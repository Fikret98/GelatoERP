-- FINAL DEFINITIVE DISCREPANCY RESOLUTION FIX (Based on Verified Schema)
-- 1. Təmizlik: Bütün köhnə və səhv yüklənmiş versiyaları silirik
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(TEXT, TEXT, TEXT, TEXT);

-- 2. Dəqiq tiplərlə yeni funksiyanı yaradırıq
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy_v3(
    p_discrepancy_id UUID,        -- Cədvəldə id UUID-dir
    p_responsible_user_id BIGINT, -- Cədvəldə user_id BIGINT-dir
    p_admin_notes TEXT,
    p_status TEXT                 -- 'resolved' və ya 'dismissed'
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
    v_related_exp_id BIGINT;      -- Cədvəldə BIGINT-dir
    v_related_inc_id BIGINT;      -- Cədvəldə BIGINT-dir
BEGIN
    -- 1. Cari vəziyyəti oxuyuruq
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

    -- 3. Maliyyə təsirini idarə edirik
    IF p_status = 'resolved' THEN
        -- Kəsir (difference < 0) -> Borc və Xərc
        IF v_diff < 0 THEN
            -- HR Borc yarat / yenilə
            INSERT INTO public.employee_debts (user_id, amount, type, notes, status, shift_id)
            VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri. ' || COALESCE(p_admin_notes, ''), 'pending', v_shift_id);

            IF v_related_exp_id IS NOT NULL THEN
                UPDATE public.expenses 
                SET category = 'Kassa Kəsiri (Həll edildi)',
                    description = 'Təsdiqləndi. ' || COALESCE(p_admin_notes, ''),
                    user_id = p_responsible_user_id
                WHERE id = v_related_exp_id;
            ELSE
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Manual resolution ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;

        -- Artıq (difference > 0) -> Gəlir
        ELSIF v_diff > 0 THEN
            IF v_related_inc_id IS NOT NULL THEN
                UPDATE public.incomes 
                SET category = 'Kassa Artığı (Həll edildi)',
                    description = 'Təsdiqləndi. ' || COALESCE(p_admin_notes, ''),
                    user_id = p_responsible_user_id
                WHERE id = v_related_inc_id;
            ELSE
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Manual resolution ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;

    ELSIF p_status = 'dismissed' THEN
        -- Ləğv edilirsə, avtomatik xərc/gəliri silirik
        IF v_related_exp_id IS NOT NULL THEN
            DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
        -- Borcu da silirik (əgər hələ ödənilməyibsə)
        DELETE FROM public.employee_debts WHERE shift_id = v_shift_id AND type = 'shortage' AND status = 'pending';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. İcazələr
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;
