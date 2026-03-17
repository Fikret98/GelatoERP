-- Professional Push Notifications Migration

-- 1. Add preference columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS notify_low_stock BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notify_shifts BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notify_reports BOOLEAN DEFAULT TRUE;

-- 2. Function to send push via Edge Function
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/',
    p_image TEXT DEFAULT NULL,
    p_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This function will be called by triggers to invoke the edge function
    -- For now, we use http extension if available, or just log for Supabase to pick up
    -- In Supabase, we can use net.http_post if enabled
    PERFORM net.http_post(
        url := (SELECT value FROM secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT value FROM secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
        ),
        body := jsonb_build_object(
            'user_id', p_user_id::text,
            'title', p_title,
            'body', p_body,
            'url', p_url,
            'image', p_image,
            'actions', p_actions
        )
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Push notification failed: %', SQLERRM;
END;
$$;

-- 3. Low Stock Trigger
CREATE OR REPLACE FUNCTION public.handle_low_stock_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
BEGIN
    -- Check if stock fell below threshold
    IF NEW.stock <= NEW.min_stock AND (OLD.stock > OLD.min_stock OR OLD.stock IS NULL) THEN
        -- Notify all admins who have notify_low_stock enabled
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_low_stock = TRUE) LOOP
            PERFORM public.send_push_notification(
                v_admin_id,
                '⚠️ Azalan Stok: ' || NEW.name,
                NEW.name || ' məhsulunun stoku ' || NEW.stock || ' ədədə düşdü. Zəhmət olmasa tədarük edin.',
                '/inventory',
                NEW.image_url,
                jsonb_build_array(jsonb_build_object('action', 'view_inventory', 'title', 'Anbara Bax'))
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_low_stock ON public.products;
CREATE TRIGGER on_low_stock
    AFTER UPDATE ON public.products
    FOR EACH ROW
    WHEN (NEW.stock <= NEW.min_stock)
    EXECUTE FUNCTION public.handle_low_stock_notification();

-- 4. Shift Opening/Closing Trigger
CREATE OR REPLACE FUNCTION public.handle_shift_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
    v_user_name TEXT;
BEGIN
    SELECT name INTO v_user_name FROM public.users WHERE id = NEW.user_id;

    -- Shift Opened
    IF TG_OP = 'INSERT' THEN
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_shifts = TRUE) LOOP
            PERFORM public.send_push_notification(
                v_admin_id,
                '🟢 Növbə Açıldı',
                v_user_name || ' tərəfindən yeni növbə açıldı.',
                '/dashboard'
            );
        END LOOP;
    -- Shift Closed
    ELSIF TG_OP = 'UPDATE' AND NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_shifts = TRUE) LOOP
            PERFORM public.send_push_notification(
                v_admin_id,
                '🔴 Növbə Bağlandı',
                v_user_name || ' növbəni təhvil verdi. Uyğunsuzluq: ' || (NEW.closing_actual - NEW.closing_expected)::TEXT || ' ₼',
                '/dashboard'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_shift_change ON public.shifts;
CREATE TRIGGER on_shift_change
    AFTER INSERT OR UPDATE ON public.shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_shift_notification();
