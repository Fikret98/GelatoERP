-- Function to call the send-push Edge Function
CREATE OR REPLACE FUNCTION public.fn_notify_user_push(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/',
    p_icon TEXT DEFAULT NULL,
    p_image TEXT DEFAULT NULL,
    p_actions JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Call the Supabase Edge Function
    -- Note: This requires the edge function to be deployed and accessible
    PERFORM
      net.http_post(
        url := (SELECT value FROM (SELECT COALESCE(current_setting('app.settings.supabase_url', true), 'https://your-project.supabase.co')) AS s) || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
        ),
        body := jsonb_build_object(
          'user_id', p_user_id,
          'title', p_title,
          'body', p_body,
          'url', p_url,
          'icon', p_icon,
          'image', p_image,
          'actions', p_actions
        )
      );
END;
$$;

-- Trigger function for inventory low stock
CREATE OR REPLACE FUNCTION public.fn_check_inventory_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id BIGINT;
BEGIN
    -- Only trigger if stock falls below critical limit
    IF (NEW.stock_quantity <= NEW.critical_limit) AND (OLD.stock_quantity > NEW.critical_limit) THEN
        -- Find the admin user(s) to notify
        -- In this case, we notify the admin (ID 1 usually, but let's be safe)
        FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin') LOOP
            PERFORM public.fn_notify_user_push(
                v_admin_id,
                '⚠️ Kritik Stok Xəbərdarlığı',
                NEW.name || ' məhsulunun stoku bitmək üzrədir (' || NEW.stock_quantity || ' ' || NEW.unit || ')',
                '/inventory',
                NULL,
                NULL,
                jsonb_build_array(
                  jsonb_build_object('action', 'view_inventory', 'title', 'Anbara bax')
                )
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_inventory_low_stock ON public.inventory;
CREATE TRIGGER tr_inventory_low_stock
    AFTER UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_inventory_low_stock();

-- Note: 'net' extension must be enabled for http_post to work
-- CREATE EXTENSION IF NOT EXISTS pg_net;
