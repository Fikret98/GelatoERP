-- PROFESSIONAL PUSH NOTIFICATIONS: FINAL ROBUST FIX
-- Bu skript hər şeyi birlikdə bərpa edir və bildiriş xətası olsa belə sistemin donmamasını təmin edir.

-- 1. HTTP imkanını aktivləşdiririk
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Secrets cədvəli və açarlar
CREATE TABLE IF NOT EXISTS public.secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO public.secrets (name, value) VALUES 
('SUPABASE_URL', 'https://canoruljgackpmziotel.supabase.co'),
('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbm9ydWxqZ2Fja3BtemlvdGVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY5MTY3MCwiZXhwIjoyMDg4MjY3NjcwfQ.Phd1TGghzHmlhEU5Th9a25Lu0PEWfe0DIp6-LKRAZw0')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;

-- 3. Bildiriş funksiyası (ROBUST - Xəta olsa belə əsas əməliyyatı dayandırmır)
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
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    -- Məlumatları götürürük
    SELECT value INTO v_url FROM public.secrets WHERE name = 'SUPABASE_URL';
    SELECT value INTO v_key FROM public.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';

    -- Əgər datalar varsa sorğu göndəririk
    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_url || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_key
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
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Xəta olduqda sadəcə loq yazırıq, əsas satış/növbə əməliyyatını pozmuruq
    RAISE WARNING 'Push notification failed: %', SQLERRM;
END;
$$;

-- 4. TRIGERLƏRİ YENİDƏN QURURUQ

-- A. Azalan Stok
CREATE OR REPLACE FUNCTION public.handle_low_stock_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
BEGIN
    IF NEW.stock_quantity <= NEW.critical_limit AND (OLD.stock_quantity > OLD.critical_limit OR OLD.stock_quantity IS NULL) THEN
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_low_stock = TRUE) LOOP
            PERFORM public.send_push_notification(
                v_admin_id,
                '⚠️ Azalan Stok: ' || NEW.name,
                NEW.name || ' məhsulunun ehtiyatı ' || NEW.stock_quantity || ' ' || NEW.unit || ' səviyyəsinə düşdü.',
                '/inventory'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_low_stock ON public.inventory;
CREATE TRIGGER on_low_stock
    AFTER UPDATE ON public.inventory
    FOR EACH ROW
    WHEN (NEW.stock_quantity <= NEW.critical_limit)
    EXECUTE FUNCTION public.handle_low_stock_notification();

-- B. Növbə Bildirişi
CREATE OR REPLACE FUNCTION public.handle_shift_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
    v_user_name TEXT;
BEGIN
    SELECT name INTO v_user_name FROM public.users WHERE id = NEW.user_id;

    IF TG_OP = 'INSERT' THEN
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_shifts = TRUE) LOOP
            PERFORM public.send_push_notification(v_admin_id, '🟢 Növbə Açıldı', v_user_name || ' tərəfindən yeni növbə açıldı.', '/dashboard');
        END LOOP;
    ELSIF TG_OP = 'UPDATE' AND NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_shifts = TRUE) LOOP
            PERFORM public.send_push_notification(v_admin_id, '🔴 Növbə Bağlandı', v_user_name || ' növbəni bağladı. Fərq: ' || (COALESCE(NEW.actual_cash_balance, 0) - COALESCE(NEW.expected_cash_balance, 0))::TEXT || ' ₼', '/dashboard');
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

-- C. Böyük Xərclər
CREATE OR REPLACE FUNCTION public.handle_large_expense_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
    v_user_name TEXT;
BEGIN
    IF NEW.amount >= 500 THEN
        SELECT name INTO v_user_name FROM public.users WHERE id = NEW.user_id;
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND notify_reports = TRUE) LOOP
            PERFORM public.send_push_notification(v_admin_id, '📌 Böyük Xərc', v_user_name || ' tərəfindən ' || NEW.amount || ' ₼ xərc qeydə alındı.', '/reports');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_large_expense ON public.expenses;
CREATE TRIGGER on_large_expense
    AFTER INSERT ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_large_expense_notification();
