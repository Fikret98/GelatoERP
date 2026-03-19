-- 20260319_MASTER_SHIFT_SYSTEM_REWRITE.sql
-- Final bulletproof logic for Shift and Discrepancy system

-- 1. Schema Updates
DO $$ 
BEGIN
    -- Add type to shift_discrepancies
    BEGIN
        ALTER TABLE public.shift_discrepancies ADD COLUMN type TEXT DEFAULT 'closing_gap';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;

    -- Add is_system_generated to expenses
    BEGIN
        ALTER TABLE public.expenses ADD COLUMN is_system_generated BOOLEAN DEFAULT FALSE;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;

    -- Make verifier_counted and verified_by_id nullable
    -- Because at closeShift time, we don't have the next person to verify yet.
    BEGIN
        ALTER TABLE public.shift_discrepancies ALTER COLUMN verifier_counted DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.shift_discrepancies ALTER COLUMN verified_by_id DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- 2. Function to get current cash balance (Global)
CREATE OR REPLACE FUNCTION public.get_global_cash_balance()
RETURNS DECIMAL(12, 2)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT (
        COALESCE((SELECT SUM(total_amount) FROM public.sales WHERE payment_method = 'cash'), 0) +
        COALESCE((SELECT SUM(amount) FROM public.incomes WHERE payment_method = 'cash'), 0) -
        COALESCE((SELECT SUM(amount) FROM public.expenses WHERE payment_method = 'cash'), 0)
    )::DECIMAL(12, 2);
$$;

-- 3. Function to get expected cash for a SPECIFIC shift
-- This is the CORE of Scenario 1, 3, 4, 5.
-- It MUST ignore system-generated entries to avoid Bug 6 (loop errors).
CREATE OR REPLACE FUNCTION public.get_shift_expected_cash(p_shift_id UUID)
RETURNS DECIMAL(12, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening DECIMAL(12, 2);
    v_sales   DECIMAL(12, 2);
    v_incomes DECIMAL(12, 2);
    v_expenses DECIMAL(12, 2);
BEGIN
    -- Opening balance as entered by the user (Sacred rule 1)
    SELECT opening_balance INTO v_opening FROM public.shifts WHERE id = p_shift_id;

    -- Cash Sales in this shift
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales
    FROM public.sales
    WHERE shift_id = p_shift_id AND payment_method = 'cash';

    -- Cash Incomes in this shift (EXCLUDING system-generated ones)
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes
    FROM public.incomes
    WHERE shift_id = p_shift_id
      AND payment_method = 'cash'
      AND is_system_generated = FALSE;

    -- Cash Expenses in this shift (EXCLUDING system-generated ones)
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM public.expenses
    WHERE shift_id = p_shift_id
      AND payment_method = 'cash'
      AND is_system_generated = FALSE;

    RETURN ROUND((v_opening + v_sales + v_incomes - v_expenses), 2);
END;
$$;

-- 4. Final Discrepancy Resolution Function (Scenario 6)
-- Handles Fine vs Enterprise expense
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy_v4(
    p_discrepancy_id UUID,
    p_responsible_user_id BIGINT,
    p_admin_notes TEXT,
    p_status TEXT -- 'resolved', 'dismissed', 'enterprise_expense'
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
    v_related_exp_id BIGINT;
    v_related_inc_id BIGINT;
BEGIN
    -- 1. Get current state
    SELECT difference, shift_id, related_expense_id, related_income_id 
    INTO v_diff, v_shift_id, v_related_exp_id, v_related_inc_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    -- 2. Update status
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    -- 3. Handle Financial Impact based on status
    IF p_status IN ('resolved', 'enterprise_expense') THEN
        -- Shortage (diff < 0)
        IF v_diff < 0 THEN
            -- If 'resolved', it's a fine (Employee pays)
            IF p_status = 'resolved' THEN
                INSERT INTO public.employee_debts (user_id, amount, type, notes, status, shift_id)
                VALUES (p_responsible_user_id, ABS(v_diff), 'shortage', 'Növbə kəsiri. ' || COALESCE(p_admin_notes, ''), 'pending', v_shift_id);
            END IF;

            -- Always update or create the expense record to fix global balance
            -- BUT we mark it as is_system_generated = true
            IF v_related_exp_id IS NOT NULL THEN
                UPDATE public.expenses 
                SET category = CASE WHEN p_status = 'resolved' THEN 'Kassa Kəsiri (İşçi)' ELSE 'Kassa Kəsiri (Müəssisə)' END,
                    description = COALESCE(p_admin_notes, 'Növbə fərqi həlli'),
                    user_id = p_responsible_user_id,
                    is_system_generated = TRUE
                WHERE id = v_related_exp_id;
            ELSE
                INSERT INTO public.expenses (amount, category, description, date, payment_method, user_id, shift_id, is_system_generated)
                VALUES (ABS(v_diff), CASE WHEN p_status = 'resolved' THEN 'Kassa Kəsiri (İşçi)' ELSE 'Kassa Kəsiri (Müəssisə)' END, COALESCE(p_admin_notes, 'Növbə fərqi həlli'), NOW(), 'cash', p_responsible_user_id, v_shift_id, TRUE);
            END IF;

        -- Surplus (diff > 0)
        ELSIF v_diff > 0 THEN
            IF v_related_inc_id IS NOT NULL THEN
                UPDATE public.incomes 
                SET category = 'Kassa Artığı (Rəsmiləşdirildi)',
                    description = COALESCE(p_admin_notes, 'Növbə fərqi həlli'),
                    user_id = p_responsible_user_id,
                    is_system_generated = TRUE
                WHERE id = v_related_inc_id;
            ELSE
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id, is_system_generated)
                VALUES (v_diff, 'Kassa Artığı (Rəsmiləşdirildi)', COALESCE(p_admin_notes, 'Növbə fərqi həlli'), NOW(), 'cash', p_responsible_user_id, v_shift_id, TRUE);
            END IF;
        END IF;

    ELSIF p_status = 'dismissed' THEN
        -- Scenario 6C: Dismissed (No financial impact)
        IF v_related_exp_id IS NOT NULL THEN
            DELETE FROM public.expenses WHERE id = v_related_exp_id;
        ELSIF v_related_inc_id IS NOT NULL THEN
            DELETE FROM public.incomes WHERE id = v_related_inc_id;
        END IF;
        -- Also delete any pending debts
        DELETE FROM public.employee_debts WHERE shift_id = v_shift_id AND status = 'pending' AND type = 'shortage';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Final Permissions and Notify
GRANT EXECUTE ON FUNCTION public.get_global_cash_balance() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_shift_expected_cash(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v4(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
