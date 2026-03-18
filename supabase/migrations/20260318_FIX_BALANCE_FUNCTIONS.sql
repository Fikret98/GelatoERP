-- 20260318_FIX_BALANCE_FUNCTIONS.sql

-- 1. Correct Cash Balance Function
-- Includes 'cash' and handles cases where payment_method might be NULL (historical data)
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sales numeric;
    v_incomes numeric;
    v_expenses numeric;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales FROM public.sales WHERE payment_method = 'cash' OR payment_method IS NULL;
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes FROM public.incomes WHERE payment_method = 'cash' OR payment_method IS NULL;
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.expenses WHERE payment_method = 'cash' OR payment_method IS NULL;
    
    RETURN v_sales + v_incomes - v_expenses;
END;
$$;

-- 2. Correct Bank Balance Function
-- Includes both 'card' and 'bank' for all tables
CREATE OR REPLACE FUNCTION public.get_current_bank_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sales numeric;
    v_incomes numeric;
    v_expenses numeric;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales FROM public.sales WHERE payment_method IN ('card', 'bank');
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes FROM public.incomes WHERE payment_method IN ('card', 'bank');
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.expenses WHERE payment_method IN ('card', 'bank');
    
    RETURN v_sales + v_incomes - v_expenses;
END;
$$;

-- 3. Robust Check Constraints for safety
-- Standardize all tables to allow 'cash', 'card', 'bank'
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check CHECK (payment_method IN ('cash', 'card', 'bank'));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check CHECK (payment_method IN ('cash', 'card', 'bank'));

ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_payment_method_check;
ALTER TABLE public.incomes ADD CONSTRAINT incomes_payment_method_check CHECK (payment_method IN ('cash', 'card', 'bank'));

NOTIFY pgrst, 'reload schema';
