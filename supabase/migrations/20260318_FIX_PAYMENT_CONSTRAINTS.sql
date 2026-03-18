-- 20260318_FIX_PAYMENT_CONSTRAINTS.sql

-- 1. Fix expenses payment_method check
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

-- 2. Fix incomes payment_method check
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_payment_method_check;
ALTER TABLE public.incomes ADD CONSTRAINT incomes_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

-- 3. Fix sales payment_method check
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

NOTIFY pgrst, 'reload schema';
