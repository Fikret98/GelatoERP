-- DATA FIX: Ensure all old records have a default payment method so they are counted in balances.
UPDATE public.sales SET payment_method = 'cash' WHERE payment_method IS NULL;
UPDATE public.expenses SET payment_method = 'cash' WHERE payment_method IS NULL;
UPDATE public.incomes SET payment_method = 'cash' WHERE payment_method IS NULL;
