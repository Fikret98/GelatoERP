-- 1. Improved Push Notification Sender (Uses secrets table instead of pg settings)
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
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    -- Fetch credentials securely from the secrets table
    SELECT value INTO v_url FROM public.secrets WHERE name = 'SUPABASE_URL';
    SELECT value INTO v_key FROM public.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';

    IF v_url IS NULL OR v_key IS NULL THEN
        RAISE WARNING 'Push notification failed: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in secrets table';
        RETURN;
    END IF;

    -- Call the Supabase Edge Function
    PERFORM
      net.http_post(
        url := v_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object(
          'user_id', p_user_id,
          'title', p_title,
          'body', p_body,
          'url', p_url,
          'icon', COALESCE(p_icon, '/icon-192.png'),
          'image', p_image,
          'actions', p_actions
        )
      );
END;
$$;

-- 2. Function to handle shift push notifications
CREATE OR REPLACE FUNCTION public.fn_check_shift_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
    v_shift_user_name TEXT;
    v_title TEXT;
    v_body TEXT;
BEGIN
    -- Get the name of the user who performed the action
    SELECT name INTO v_shift_user_name FROM public.users WHERE id = NEW.user_id;
    IF v_shift_user_name IS NULL THEN
        v_shift_user_name := 'İstifadəçi';
    END IF;

    -- Shift Opened (INSERT)
    IF TG_OP = 'INSERT' THEN
        v_title := '🟢 Növbə Açıldı';
        v_body := v_shift_user_name || ' yeni növbə açdı. Kassa: ' || NEW.opening_balance || ' ₼';
    -- Shift Closed (UPDATE where closed_at IS NOT NULL)
    ELSIF TG_OP = 'UPDATE' AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
        v_title := '🔴 Növbə Bağlandı';
        v_body := v_shift_user_name || ' növbəni təhvil verdi. Fərq: ' || (NEW.actual_cash_balance - NEW.expected_cash_balance) || ' ₼';
    ELSE
        RETURN NEW;
    END IF;

    -- Find users to notify (Admins who have notify_shifts = true)
    -- Intentionally omitting "AND id != NEW.user_id" so the admin testing gets their own notification!
    FOR v_user IN (SELECT id FROM public.users WHERE role = 'admin' AND COALESCE(notify_shifts, true) = true) LOOP
        PERFORM public.fn_notify_user_push(
            v_user.id,
            v_title,
            v_body,
            '/',
            NULL,
            NULL,
            NULL
        );
    END LOOP;

    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_shift_notifications ON public.shifts;
CREATE TRIGGER tr_shift_notifications
    AFTER INSERT OR UPDATE ON public.shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_shift_notifications();

