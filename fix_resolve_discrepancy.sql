-- UNIFIED DISCREPANCY RESOLUTION FIX
-- 1. Təmizlik: Köhnə və səhv versiyaları silirik
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v2(BIGINT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.resolve_shift_discrepancy_v3(BIGINT, BIGINT, TEXT, TEXT);

-- 2. Yeni və peşəkar versiyanı yaradırıq
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy_v3(
    p_discrepancy_id BIGINT,
    p_responsible_user_id BIGINT,
    p_admin_notes TEXT,
    p_status TEXT -- 'resolved' və ya 'dismissed'
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
    v_related_exp_id UUID;
    v_related_inc_id UUID;
BEGIN
    -- 1. Cari vəziyyəti oxuyuruq
    SELECT difference, shift_id, related_expense_id, related_income_id 
    INTO v_diff, v_shift_id, v_related_exp_id, v_related_inc_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Discrepancy not found';
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
        -- Əgər avtomatik yaranmış xərc/gəlir varsa, onu yeniləyirik
        IF v_related_exp_id IS NOT NULL THEN
            UPDATE public.expenses 
            SET category = 'Kassa Kəsiri (Həll edildi)',
                description = 'Təsdiqlənmiş kəsir. ' || COALESCE(p_admin_notes, ''),
                user_id = p_responsible_user_id
            WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            UPDATE public.incomes 
            SET category = 'Kassa Artığı (Həll edildi)',
                description = 'Təsdiqlənmiş artıq. ' || COALESCE(p_admin_notes, ''),
                user_id = p_responsible_user_id
            WHERE id = v_related_inc_id;
        ELSE
            -- Əgər heç bir qeyd yoxdursa (nadir hallarda), yenisini yaradırıq
            IF v_diff < 0 THEN
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Manual dispute resolution. ' || COALESCE(p_admin_notes, ''), NOW(), 'cash', p_responsible_user_id, v_shift_id);
            ELSIF v_diff > 0 THEN
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Manual dispute resolution. ' || COALESCE(p_admin_notes, ''), NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;
    ELSIF p_status = 'dismissed' THEN
        -- Əgər ləğv edilirsə, maliyyə təsirini (varsa) silirik
        IF v_related_exp_id IS NOT NULL THEN
            DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. İcazələri veririk
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(BIGINT, BIGINT, TEXT, TEXT) TO authenticated, anon;
