-- Refined Shift Discrepancy Logic
-- 1. Add linkage columns to shift_discrepancies
ALTER TABLE public.shift_discrepancies ADD COLUMN IF NOT EXISTS related_expense_id BIGINT;
ALTER TABLE public.shift_discrepancies ADD COLUMN IF NOT EXISTS related_income_id BIGINT;

-- 2. Update resolve_shift_discrepancy function
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy(
    p_discrepancy_id UUID,
    p_responsible_user_id BIGINT,
    p_admin_notes TEXT,
    p_status TEXT -- 'resolved' or 'dismissed'
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_expense_id BIGINT;
    v_income_id BIGINT;
    v_user_name TEXT;
BEGIN
    -- Get discrepancy details
    SELECT difference, related_expense_id, related_income_id 
    INTO v_diff, v_expense_id, v_income_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    -- Get responsible user name
    SELECT name INTO v_user_name FROM public.users WHERE id = p_responsible_user_id;

    -- Update discrepancy status
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    -- If admin confirms the discrepancy
    IF p_status = 'resolved' THEN
        -- Shortage (difference < 0)
        IF v_diff < 0 THEN
            -- 1. Create HR Debt record
            -- Note: We assume employee_debts table exists as it is used in HR.tsx
            INSERT INTO public.employee_debts (user_id, amount, type, notes, status)
            VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri (ID: ' || p_discrepancy_id || ')', 'pending');
            
            -- 2. Update Expense Description (the one created during shift close)
            IF v_expense_id IS NOT NULL THEN
                UPDATE public.expenses 
                SET description = 'Növbə kəsiri (' || ABS(v_diff) || ' ₼) - Məsul şəxs: ' || COALESCE(v_user_name, 'Qeyd olunmayıb')
                WHERE id = v_expense_id;
            END IF;
            
        -- Surplus (difference > 0)
        ELSIF v_diff > 0 THEN
            -- Update Income Description
            IF v_income_id IS NOT NULL THEN
                UPDATE public.incomes 
                SET description = 'Növbə artığı (' || v_diff || ' ₼) - Təsdiqləndi'
                WHERE id = v_income_id;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
