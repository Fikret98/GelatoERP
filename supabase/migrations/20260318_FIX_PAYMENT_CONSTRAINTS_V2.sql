-- 20260318_FIX_PAYMENT_CONSTRAINTS_V2.sql

-- 1. DATA CLEANUP: Update all invalid or NULL payment methods to 'cash'
-- This ensures the constraint can be applied without error 23514.
UPDATE public.expenses SET payment_method = 'cash' WHERE payment_method NOT IN ('cash', 'bank') OR payment_method IS NULL;
UPDATE public.incomes SET payment_method = 'cash' WHERE payment_method NOT IN ('cash', 'bank') OR payment_method IS NULL;
UPDATE public.sales SET payment_method = 'cash' WHERE payment_method NOT IN ('cash', 'bank') OR payment_method IS NULL;

-- 2. Apply expenses payment_method check
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

-- 3. Apply incomes payment_method check
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_payment_method_check;
ALTER TABLE public.incomes ADD CONSTRAINT incomes_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

-- 4. Apply sales payment_method check
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method IN ('cash', 'bank'));

NOTIFY pgrst, 'reload schema';
