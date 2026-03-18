-- Fix discrepancy dismissal logic: do not delete the physical cash expense/income!
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy_v3(
    p_discrepancy_id UUID,
    p_responsible_user_id BIGINT,
    p_admin_notes TEXT,
    p_status TEXT -- resolved, dismissed
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
    v_related_exp_id BIGINT;
    v_related_inc_id BIGINT;
BEGIN
    -- 1. Get current discrepancy state
    SELECT difference, shift_id, related_expense_id, related_income_id 
    INTO v_diff, v_shift_id, v_related_exp_id, v_related_inc_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    -- 2. Update discrepancy status
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    -- 3. Handle Financial Impact
    IF p_status = 'resolved' THEN
        -- Shortage (difference < 0) -> Create Debt and ensure Expense exists
        IF v_diff < 0 THEN
            -- Create/Update HR Debt
            INSERT INTO public.employee_debts (user_id, amount, type, notes, status, shift_id)
            VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri. ' || COALESCE(p_admin_notes, ''), 'pending', v_shift_id);

            IF v_related_exp_id IS NOT NULL THEN
                UPDATE public.expenses 
                SET category = 'Kassa Kəsiri (Həll edildi)',
                    description = 'Təsdiqlənmiş növbə kəsiri. ' || COALESCE(p_admin_notes, ''),
                    user_id = p_responsible_user_id
                WHERE id = v_related_exp_id;
            ELSE
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Dispute resolution ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;

        -- Surplus (difference > 0) -> Just ensure Income exists
        ELSIF v_diff > 0 THEN
            IF v_related_inc_id IS NOT NULL THEN
                UPDATE public.incomes 
                SET category = 'Kassa Artığı (Həll edildi)',
                    description = 'Təsdiqlənmiş növbə artığı. ' || COALESCE(p_admin_notes, ''),
                    user_id = p_responsible_user_id
                WHERE id = v_related_inc_id;
            ELSE
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Dispute resolution ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;

    ELSIF p_status = 'dismissed' THEN
        -- Do NOT reverse financial impact because the money is physically missing/extra
        -- Instead, just update the description to indicate it was forgiven/dismissed
        IF v_related_exp_id IS NOT NULL THEN
            UPDATE public.expenses 
            SET category = 'Kassa Kəsiri (Ləğv edildi)',
                description = 'Borc yazılmadan ləğv edilmiş növbə kəsiri. ' || COALESCE(p_admin_notes, '')
            WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            UPDATE public.incomes 
            SET category = 'Kassa Artığı (Özününküləşdirilmədi)',
                description = 'Ləğv edilmiş növbə artığı. ' || COALESCE(p_admin_notes, '')
            WHERE id = v_related_inc_id;
        END IF;

        -- Delete any pending debts for this shift if dismissed
        DELETE FROM public.employee_debts WHERE shift_id = v_shift_id AND status = 'pending' AND type = 'shortage';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;
