-- Function to validate cash balance before supplier payment
CREATE OR REPLACE FUNCTION validate_supplier_payment_cash_balance()
RETURNS TRIGGER AS $$
DECLARE
    current_balance NUMERIC;
BEGIN
    -- Get current cash balance
    SELECT get_current_cash_balance() INTO current_balance;

    -- Check if payment amount exceeds current balance
    IF NEW.amount > current_balance THEN
        RAISE EXCEPTION 'Kassada kifayət qədər məbləğ yoxdur. Mövcud qalıq: % ₼', ROUND(current_balance, 2);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run before inserting into supplier_payments
DROP TRIGGER IF EXISTS tr_validate_supplier_payment_cash_balance ON supplier_payments;
CREATE TRIGGER tr_validate_supplier_payment_cash_balance
BEFORE INSERT ON supplier_payments
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_payment_cash_balance();
