-- FINAL SQL CLEANUP: Removing duplicate, ambiguous, and legacy functions
-- This will ensure no more "ambiguous function" errors and simplify the system.

-- 1. Remove ALL known duplicate/overloaded versions of shift-related functions
-- We drop them explicitly with their parameter types to be 100% sure.
DROP FUNCTION IF EXISTS public.get_active_shift(uuid);
DROP FUNCTION IF EXISTS public.get_active_shift(integer);
DROP FUNCTION IF EXISTS public.get_active_shift(bigint);

DROP FUNCTION IF EXISTS public.get_user_active_shift(uuid);
DROP FUNCTION IF EXISTS public.get_user_active_shift(integer);

-- 2. Remove legacy triggers and functions that are no longer needed
DROP TRIGGER IF EXISTS tr_log_purchase_expense ON public.inventory_purchases;
DROP TRIGGER IF EXISTS tr_log_supplier_payment_expense ON public.supplier_payments;
DROP FUNCTION IF EXISTS public.log_inventory_purchase_as_expense();
DROP FUNCTION IF EXISTS public.log_supplier_payment_as_expense();

-- 3. Create CLEAN, SINGLE versions of the necessary functions (using 'integer' for consistency)

-- Simplified shift getter for internal use
CREATE OR REPLACE FUNCTION public.get_user_active_shift(p_user_id integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id bigint;
BEGIN
    SELECT id INTO v_id 
    FROM public.shifts 
    WHERE user_id = p_user_id AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;
    RETURN v_id;
END;
$$;

-- Standard RPC for frontend
CREATE OR REPLACE FUNCTION public.get_active_shift(p_user_id integer)
RETURNS SETOF public.shifts
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.shifts 
    WHERE user_id = p_user_id AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;
$$;

-- 4. Re-create triggers to be "Shift-Agnostic" (they link to shift if open, otherwise link NULL)
CREATE OR REPLACE FUNCTION public.log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id bigint;
BEGIN
    IF NEW.amount_paid > 0 THEN
        v_shift_id := public.get_user_active_shift(NEW.created_by);

        INSERT INTO public.expenses (
            category, amount, description, date, user_id, supplier_id, payment_method, shift_id
        )
        VALUES (
            'Alış', NEW.amount_paid, 
            'Mal alışı: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id),
            now(), NEW.created_by, NEW.supplier_id, 'cash', v_shift_id
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_log_purchase_expense
    AFTER INSERT ON public.inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.log_inventory_purchase_as_expense();

-- 5. Cleanup existing 'Növbə Arası' records to standard income/expense if desired (optional)
-- This just makes them appear as normal transactions instead of 'Pending Audit'
-- UPDATE public.expenses SET category = 'Sistem Tənzimlənməsi' WHERE category = 'Növbə Arası (Araşdırılır)';

-- 6. Permissions
GRANT ALL ON public.shifts TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_shift(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_active_shift(integer) TO authenticated, anon;

-- Verification: Check for any other duplicates
-- SELECT routine_name, count(*) FROM information_schema.routines WHERE routine_schema = 'public' GROUP BY routine_name HAVING count(*) > 1;
