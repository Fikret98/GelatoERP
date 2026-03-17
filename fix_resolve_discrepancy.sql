-- MASTER UNIFIED FIX: DISCREPANCY & NOTIFICATIONS
-- 1. KÖHNƏ FUNKSİYALARIN TƏMİZLƏNMƏSİ (Argumentləri dəqiq göstərməklə)

-- Resolve Discrepancy overloads
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(TEXT, TEXT, TEXT, TEXT);

-- Send Push Notification overloads (Ambiguity yaradanlar)
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.send_push_notification(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB);


-- 2. MASTER BİLDİRİŞ FUNKSİYASI (Vahid və Real-time dəstəkli)
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/dashboard',
    p_image TEXT DEFAULT NULL,
    p_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
    v_type TEXT;
BEGIN
    -- In-app üçün tip təyin edirik
    IF p_title ~* 'kəsir|artıq|problem|xəta|kritik|azalan' THEN v_type := 'warning';
    ELSIF p_title ~* 'təbrik|uğur|success|həll' THEN v_type := 'success';
    ELSE v_type := 'info';
    END IF;

    -- A) In-App Bildirişi (notifications cədvəlinə)
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (p_user_id, p_title, p_body, v_type, p_url);

    -- B) Push Bildirişi (Edge Function vasitəsilə)
    SELECT value INTO v_url FROM public.secrets WHERE name = 'SUPABASE_URL';
    SELECT value INTO v_key FROM public.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';

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
    RAISE WARNING 'Bildiriş göndərilmədi: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. MASTER UYĞUNSUZLUQ HƏLLİ (Baza strukturuna tam uyğun)
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy_v3(
    p_discrepancy_id UUID,        -- shift_discrepancies.id UUID-dir
    p_responsible_user_id BIGINT, -- users.id BIGINT-dir
    p_admin_notes TEXT,
    p_status TEXT                 -- 'resolved' və ya 'dismissed'
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
    v_related_exp_id BIGINT;
    v_related_inc_id BIGINT;
BEGIN
    -- 1. Mövcud vəziyyəti oxuyuruq
    SELECT difference, shift_id, related_expense_id, related_income_id 
    INTO v_diff, v_shift_id, v_related_exp_id, v_related_inc_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Uyğunsuzluq tapılmadı: %', p_discrepancy_id;
    END IF;

    -- 2. Statusu yeniləyirik
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    -- 3. Maliyyə təsiri
    IF p_status = 'resolved' THEN
        -- Kəsir (Borc yaradırıq)
        IF v_diff < 0 THEN
            INSERT INTO public.employee_debts (user_id, amount, type, notes, status, shift_id)
            VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri. ' || COALESCE(p_admin_notes, ''), 'pending', v_shift_id);
            
            IF v_related_exp_id IS NOT NULL THEN
                UPDATE public.expenses SET category = 'Kassa Kəsiri (Həll edildi)', user_id = p_responsible_user_id WHERE id = v_related_exp_id;
            ELSE
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Dispute resolution for ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        -- Artıq (Gəlir kimi qəbul edirik)
        ELSIF v_diff > 0 THEN
            IF v_related_inc_id IS NOT NULL THEN
                UPDATE public.incomes SET category = 'Kassa Artığı (Həll edildi)', user_id = p_responsible_user_id WHERE id = v_related_inc_id;
            ELSE
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Dispute resolution for ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;

    ELSIF p_status = 'dismissed' THEN
        -- Ləğv olunursa xərcləri təmizləyirik
        IF v_related_exp_id IS NOT NULL THEN DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
        DELETE FROM public.employee_debts WHERE shift_id = v_shift_id AND type = 'shortage' AND status = 'pending';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. İCAZƏLƏR (Drop edildiyi üçün yenidən vermək lazımdır)
GRANT EXECUTE ON FUNCTION public.send_push_notification(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;
