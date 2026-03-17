-- FINAL COMPREHENSIVE TYPE FIX: Ensuring consistency between Frontend and Database
-- Handles view dependencies by dropping and recreating them.

-- 1. DROP DEPENDENT VIEWS
DROP VIEW IF EXISTS public.all_transactions_view CASCADE;
DROP VIEW IF EXISTS public.seller_bonuses_view CASCADE;

DO $$ 
BEGIN
    -- 2. Unify all user_id columns to BIGINT (matching users.id)
    ALTER TABLE public.expenses ALTER COLUMN user_id TYPE BIGINT;
    ALTER TABLE public.incomes ALTER COLUMN user_id TYPE BIGINT;
    ALTER TABLE public.sales ALTER COLUMN seller_id TYPE BIGINT;
    
    -- 3. Ensure shift_discrepancies uses BIGINT for user references and financial IDs
    ALTER TABLE public.shift_discrepancies ALTER COLUMN reported_by_id TYPE BIGINT;
    ALTER TABLE public.shift_discrepancies ALTER COLUMN verified_by_id TYPE BIGINT;
    ALTER TABLE public.shift_discrepancies ALTER COLUMN responsible_user_id TYPE BIGINT;
    ALTER TABLE public.shift_discrepancies ALTER COLUMN related_expense_id TYPE BIGINT;
    ALTER TABLE public.shift_discrepancies ALTER COLUMN related_income_id TYPE BIGINT;
    
    -- 4. Ensure shift identifiers are UUID
    ALTER TABLE public.expenses ALTER COLUMN shift_id TYPE UUID USING shift_id::uuid;
    ALTER TABLE public.incomes ALTER COLUMN shift_id TYPE UUID USING shift_id::uuid;
    ALTER TABLE public.sales ALTER COLUMN shift_id TYPE UUID USING shift_id::uuid;

END $$;

-- 5. RECREATE all_transactions_view
CREATE OR REPLACE VIEW public.all_transactions_view AS
SELECT 
    'sale'::text as type,
    s.id,
    s.total_amount as amount,
    'Satış'::text as category,
    ''::text as description,
    s.payment_method,
    s.date,
    s.seller_id as user_id,
    u.name as user_name
FROM public.sales s
LEFT JOIN public.users u ON s.seller_id = u.id
UNION ALL
SELECT 
    'expense'::text as type,
    e.id,
    e.amount,
    e.category,
    e.description,
    e.payment_method,
    e.date,
    e.user_id,
    u.name as user_name
FROM public.expenses e
LEFT JOIN public.users u ON e.user_id = u.id
UNION ALL
SELECT 
    'income'::text as type,
    i.id,
    i.amount,
    i.category,
    i.description,
    i.payment_method,
    i.date,
    i.user_id,
    u.name as user_name
FROM public.incomes i
LEFT JOIN public.users u ON i.user_id = u.id;

-- 6. RECREATE seller_bonuses_view
CREATE OR REPLACE VIEW public.seller_bonuses_view AS
SELECT 
    u.name as seller_name,
    u.id as user_id,
    COALESCE(SUM(s.total_amount * u.bonus_percentage / 100), 0) as total_bonus
FROM public.users u
JOIN public.sales s ON u.id = s.seller_id
GROUP BY u.name, u.id;

-- 7. Recreate the resolution function with CORRECT INTERNAL TYPES (BIGINT for expenses/incomes)
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
                VALUES (ABS(v_diff), 'Kassa Kəsiri (Həll edildi)', 'Manual resolution for shift ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
            ELSIF v_diff > 0 THEN
                INSERT INTO public.incomes (amount, category, description, date, payment_method, user_id, shift_id)
                VALUES (v_diff, 'Kassa Artığı (Həll edildi)', 'Manual resolution for shift ' || v_shift_id::text, NOW(), 'cash', p_responsible_user_id, v_shift_id);
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

-- 8. Final Permissions
GRANT EXECUTE ON FUNCTION public.resolve_shift_discrepancy_v3(UUID, BIGINT, TEXT, TEXT) TO authenticated, anon;
GRANT SELECT ON public.all_transactions_view TO authenticated, anon;
GRANT SELECT ON public.seller_bonuses_view TO authenticated, anon;

-- Notify Supabase to reload schema
NOTIFY pgrst, 'reload schema';
