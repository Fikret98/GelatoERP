-- 6. Discrepancy Resolution Notification
CREATE OR REPLACE FUNCTION public.handle_discrepancy_resolution_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_id BIGINT;
    v_resolver_name TEXT;
    v_responsible_name TEXT;
BEGIN
    -- Yalnız status dəyişəndə (pending -> resolved/dismissed)
    IF NEW.status != OLD.status AND OLD.status = 'pending' THEN
        -- Təsdiqləyən adminin adını götürürük
        v_resolver_name := 'Admin'; -- Default
        -- Qeyd: Real istifadəçini auth.uid() ilə götürmək olar, amma trigger funksiyasında bu bəzən null ola bilər
        
        IF NEW.status = 'resolved' THEN
            -- Məsul şəxsin adını götürürük
            SELECT name INTO v_responsible_name FROM public.users WHERE id = NEW.responsible_user_id;
            
            FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin' AND id != NEW.responsible_user_id) LOOP
                PERFORM public.send_push_notification(
                    v_admin_id,
                    '⚖️ Uyğunsuzluq Həll Edildi',
                    'Kəsir/Artıq təsdiqləndi. Məsul: ' || COALESCE(v_responsible_name, 'Qeyd edilməyib') || '. Məbləğ: ' || NEW.difference || ' ₼',
                    '/dashboard'
                );
            END LOOP;
        ELSIF NEW.status = 'dismissed' THEN
            FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'admin') LOOP
                PERFORM public.send_push_notification(
                    v_admin_id,
                    '⚪ Uyğunsuzluq Ləğv Edildi',
                    'Məbləğ: ' || NEW.difference || ' ₼ olan uyğunsuzluq borc yazılmadan bağlanıldı.',
                    '/dashboard'
                );
            END LOOP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_discrepancy_resolution ON public.shift_discrepancies;
CREATE TRIGGER on_discrepancy_resolution
    AFTER UPDATE ON public.shift_discrepancies
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_discrepancy_resolution_notification();
