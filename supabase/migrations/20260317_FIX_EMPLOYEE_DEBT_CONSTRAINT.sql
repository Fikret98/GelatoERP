-- Migration to fix the employee_debts status constraint and refine discrepancy resolution
-- 1. Explicitly fix the status check constraint on employee_debts
DO $$ 
DECLARE 
    v_constraint_name TEXT;
BEGIN
    -- Find the check constraint name for status on employee_debts
    SELECT conname INTO v_constraint_name
    FROM pg_constraint 
    WHERE conrelid = 'public.employee_debts'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) ILIKE '%status%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.employee_debts DROP CONSTRAINT %I', v_constraint_name);
    END IF;

    -- Add the new, expanded constraint
    ALTER TABLE public.employee_debts 
    ADD CONSTRAINT employee_debts_status_check 
    CHECK (status IN ('unpaid', 'paid', 'pending', 'cancelled'));
EXCEPTION WHEN OTHERS THEN
    -- Fallback: If table doesn't exist or other error, just log it
    RAISE NOTICE 'Could not update employee_debts constraint: %', SQLERRM;
END $$;

-- 2. Ensure linkage columns exist in shift_discrepancies (if not already added)
ALTER TABLE public.shift_discrepancies ADD COLUMN IF NOT EXISTS related_expense_id BIGINT;
ALTER TABLE public.shift_discrepancies ADD COLUMN IF NOT EXISTS related_income_id BIGINT;

-- 3. Refine the resolve_shift_discrepancy function
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
            -- 1. Create HR Debt record with 'pending' status
            INSERT INTO public.employee_debts (user_id, amount, type, notes, status)
            VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri (ID: ' || p_discrepancy_id || ')', 'pending');
            
            -- 2. Update Expense Description
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
