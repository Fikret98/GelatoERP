-- Function to get the all-time total cash balance (Sales + Incomes - Expenses)
CREATE OR REPLACE FUNCTION get_current_cash_balance()
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
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales FROM sales;
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes FROM incomes;
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM expenses;
    
    RETURN v_sales + v_incomes - v_expenses;
END;
$$;

GRANT EXECUTE ON FUNCTION get_current_cash_balance() TO anon;
GRANT EXECUTE ON FUNCTION get_current_cash_balance() TO authenticated;
