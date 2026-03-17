-- Rename the function to avoid ANY caching or overload conflicts
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
    v_related_exp_id UUID;
    v_related_inc_id UUID;
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
        -- If already has an automated expense/income, update it
        IF v_related_exp_id IS NOT NULL THEN
            UPDATE public.expenses 
            SET category = 'Kassa Kəsiri (Həll edildi)',
                description = 'Təsdiqlənmiş növbə kəsiri. ' || COALESCE(p_admin_notes, ''),
                user_id = p_responsible_user_id
            WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            UPDATE public.incomes 
            SET category = 'Kassa Artığı (Həll edildi)',
                description = 'Təsdiqlənmiş növbə artığı. ' || COALESCE(p_admin_notes, ''),
                user_id = p_responsible_user_id
            WHERE id = v_related_inc_id;
        ELSE
            -- Create new if doesn't exist
            IF v_diff < 0 THEN
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Manual dispute resolution for shift ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            ELSIF v_diff > 0 THEN
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Manual dispute resolution for shift ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;
    ELSIF p_status = 'dismissed' THEN
        -- Reverse financial impact if dismissed
        IF v_related_exp_id IS NOT NULL THEN
            DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to the new function
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;
