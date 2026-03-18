-- 20260318_PREVENT_NEGATIVE_BALANCE.sql

-- 1. Create validation function
CREATE OR REPLACE FUNCTION public.check_balance_before_expense()
RETURNS trigger AS $$
DECLARE
    v_current_balance numeric;
BEGIN
    -- Skip check for non-monetary adjustments if any (optional)
    
    IF NEW.payment_method = 'cash' THEN
        v_current_balance := public.get_current_cash_balance();
    ELSIF NEW.payment_method IN ('card', 'bank') THEN
        v_current_balance := public.get_current_bank_balance();
    ELSE
        RETURN NEW;
    END IF;

    -- Note: When UPDATING, we should consider the old amount, but let's keep it simple for INSERT first.
    -- For INSERT, it's straightforward.
    IF TG_OP = 'INSERT' THEN
        IF v_current_balance < NEW.amount THEN
            RAISE EXCEPTION 'Kifayət qədər vəsait yoxdur (%). Cari balans: % ₼', 
                CASE WHEN NEW.payment_method = 'cash' THEN 'Nağd' ELSE 'Bank' END,
                v_current_balance;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add trigger to expenses
DROP TRIGGER IF EXISTS tr_check_balance_expense ON public.expenses;
CREATE TRIGGER tr_check_balance_expense
BEFORE INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.check_balance_before_expense();

-- Note: We don't need it on inventory_purchases directly because 
-- inventory_purchases inserts into expenses, which will trigger this check.

-- 3. Diagnostic Query (to find the culprit)
-- The user can run this to see the transactions that led to -600
/*
SELECT * FROM (
    SELECT 'expense' as type, amount, category, description, date, payment_method FROM public.expenses WHERE payment_method IN ('card', 'bank')
    UNION ALL 
    SELECT 'income', amount, category, description, date, payment_method FROM public.incomes WHERE payment_method IN ('card', 'bank')
    UNION ALL 
    SELECT 'sale', total_amount, 'Satış', '', date, payment_method FROM public.sales WHERE payment_method = 'card'
) t ORDER BY date DESC LIMIT 20;
*/
