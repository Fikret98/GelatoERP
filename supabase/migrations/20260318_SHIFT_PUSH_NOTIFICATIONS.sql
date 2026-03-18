-- Function to handle shift push notifications
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

    -- Find users to notify (Admins who have notify_shifts = true, excluding the user doing the action)
    FOR v_user IN (SELECT id FROM public.users WHERE role = 'admin' AND COALESCE(notify_shifts, true) = true AND id != NEW.user_id) LOOP
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
