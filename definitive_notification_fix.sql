-- DEFINITIVE NOTIFICATION & DISCREPANCY CLEANUP
-- 1. Təmizlik: Bütün köhnə və qarışıq versiyaları silirik
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT);

-- 2. Tək və Güclü Funksiya: Bütün ehtiyacları bir yerdə qarşılayır
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/dashboard',
    p_image TEXT DEFAULT NULL,
    p_actions JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID AS $$
DECLARE
    v_push_enabled BOOLEAN;
    v_user_role TEXT;
BEGIN
    -- İstifadəçinin bildiriş tənzimləməsini yoxlayaq (opsional)
    SELECT role INTO v_user_role FROM public.users WHERE id = p_user_id;

    -- 1. In-App Notification (Daxili Bildiriş Mərkəzi üçün)
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
        p_user_id, 
        p_title, 
        p_body, 
        CASE 
            WHEN p_title ILIKE '%Xəta%' OR p_title ILIKE '%Kəsir%' THEN 'error'
            WHEN p_title ILIKE '%Anbar%' OR p_title ILIKE '%Stok%' THEN 'warning'
            WHEN p_title ILIKE '%Uğur%' OR p_title ILIKE '%Bağlandı%' THEN 'success'
            ELSE 'info'
        END,
        p_url
    );

    -- 2. Push Notification (Edge Function vasitəsilə)
    -- Robust error handling: Push göndərilməsə belə proses dayanmasın
    BEGIN
        PERFORM net.http_post(
            url := (SELECT value FROM public.app_settings WHERE key = 'supabase_url') || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (SELECT value FROM public.app_settings WHERE key = 'supabase_anon_key')
            ),
            body := jsonb_build_object(
                'user_id', p_user_id,
                'title', p_title,
                'body', p_body,
                'url', p_url,
                'image', p_image,
                'actions', p_actions
            )
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Push bildiriş göndərilə bilmədi, lakin proses davam edir.';
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Triger Funksiyasını yeniləyək (Ambiguity-ni həll etmək üçün)
CREATE OR REPLACE FUNCTION public.notify_discrepancy()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
BEGIN
    -- Bütün adminlərə xəbər veririk
    FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin') LOOP
        PERFORM public.send_push_notification(
            v_admin_id,
            'Növbə Uyğunsuzluğu: ' || CASE WHEN NEW.difference < 0 THEN 'Kəsir' ELSE 'Artıq' END,
            'Məbləğ: ' || ABS(NEW.difference) || ' AZN. Növbə ID: ' || NEW.shift_id,
            '/dashboard'
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Triger-i aktiv edək
DROP TRIGGER IF EXISTS notify_discrepancy_trigger ON public.shift_discrepancies;
CREATE TRIGGER notify_discrepancy_trigger
AFTER INSERT ON public.shift_discrepancies
FOR EACH ROW EXECUTE FUNCTION public.notify_discrepancy();

GRANT EXECUTE ON FUNCTION public.send_push_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_push_notification TO anon;
GRANT EXECUTE ON FUNCTION public.send_push_notification TO service_role;
