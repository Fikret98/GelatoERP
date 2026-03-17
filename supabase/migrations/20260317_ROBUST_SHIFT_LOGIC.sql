-- 1. Function to calculate expected cash for a shift (The "Source of Truth")
CREATE OR REPLACE FUNCTION public.get_shift_expected_cash(p_shift_id UUID)
RETURNS DECIMAL(12, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening DECIMAL(12, 2);
    v_sales DECIMAL(12, 2);
    v_incomes DECIMAL(12, 2);
    v_expenses DECIMAL(12, 2);
BEGIN
    -- Get opening balance
    SELECT opening_balance INTO v_opening FROM public.shifts WHERE id = p_shift_id;
    
    -- Cash Sales
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales 
    FROM public.sales 
    WHERE shift_id = p_shift_id AND payment_method = 'cash';
    
    -- Cash Incomes (Excluding opening adjustments)
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes 
    FROM public.incomes 
    WHERE shift_id = p_shift_id 
      AND payment_method = 'cash'
      AND NOT (category = 'Kassa Artığı' AND description LIKE '%Təhvil-təslim%');
      
    -- Cash Expenses (Excluding opening adjustments)
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses 
    FROM public.expenses 
    WHERE shift_id = p_shift_id 
      AND payment_method = 'cash'
      AND NOT (category = 'Kassa Kəsiri' AND description LIKE '%Təhvil-təslim%');

    RETURN ROUND((v_opening + v_sales + v_incomes - v_expenses), 2);
END;
$$;

-- 2. Update resolve_shift_discrepancy to be more robust
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy(
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
    SELECT difference, shift_id, related_expense_id, related_income_id 
    INTO v_diff, v_shift_id, v_related_exp_id, v_related_inc_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    -- Update discrepancy status
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    IF p_status = 'resolved' THEN
        -- If already has an expense/income, just update its description
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
            -- Create new if doesn't exist (shouldn't happen with current logic, but for safety)
            IF v_diff < 0 THEN
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Manual dispute resolution for shift ' || v_shift_id, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            ELSIF v_diff > 0 THEN
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Manual dispute resolution for shift ' || v_shift_id, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            END IF;
        END IF;
    ELSIF p_status = 'dismissed' THEN
        -- If dismissed, we MUST reverse the financial impact (delete or zero out the automated expense)
        IF v_related_exp_id IS NOT NULL THEN
            DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_shift_expected_cash(UUID) TO authenticated, anon;
