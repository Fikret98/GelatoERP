-- Migration for Supplier Debt Management System

-- 1. Add amount_paid to inventory_purchases
ALTER TABLE public.inventory_purchases ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;

-- 2. Create supplier_payments table
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES public.suppliers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    description TEXT,
    date TIMESTAMPTZ DEFAULT now(),
    created_by INTEGER REFERENCES public.users(id)
);

-- 3. Create a view for current supplier debts
CREATE OR REPLACE VIEW public.supplier_debts_view AS
WITH total_purchases AS (
    SELECT 
        supplier_id,
        SUM(quantity * unit_price) as total_purchase_amount,
        SUM(amount_paid) as paid_at_purchase
    FROM public.inventory_purchases
    GROUP BY supplier_id
),
total_payments AS (
    SELECT 
        supplier_id,
        SUM(amount) as additional_paid
    FROM public.supplier_payments
    GROUP BY supplier_id
)
SELECT 
    s.id as supplier_id,
    s.name as supplier_name,
    COALESCE(tp.total_purchase_amount, 0) as total_purchases,
    (COALESCE(tp.paid_at_purchase, 0) + COALESCE(pay.additional_paid, 0)) as total_paid,
    (COALESCE(tp.total_purchase_amount, 0) - (COALESCE(tp.paid_at_purchase, 0) + COALESCE(pay.additional_paid, 0))) as current_debt
FROM public.suppliers s
LEFT JOIN total_purchases tp ON s.id = tp.supplier_id
LEFT JOIN total_payments pay ON s.id = pay.supplier_id;

-- 4. Update the expense trigger for purchases
-- We only want to log the amount_paid as an expense at the time of purchase
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only log as expense if there was a payment made
    IF NEW.amount_paid > 0 THEN
        INSERT INTO public.expenses (
            category,
            amount,
            description,
            date,
            user_id,
            supplier_id
        )
        VALUES (
            'Alış',
            NEW.amount_paid,
            'Mal alışı (Ödəniş): ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
            now(),
            NEW.created_by,
            NEW.supplier_id
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 5. Create trigger to log debt repayments as expenses
CREATE OR REPLACE FUNCTION log_supplier_payment_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.expenses (
        category,
        amount,
        description,
        date,
        user_id,
        supplier_id
    )
    VALUES (
        'Borc Ödənişi',
        NEW.amount,
        'Təchizatçıya borc ödənişi: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        NEW.date,
        NEW.created_by,
        NEW.supplier_id
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_log_supplier_payment_expense ON public.supplier_payments;
CREATE TRIGGER tr_log_supplier_payment_expense
    AFTER INSERT ON public.supplier_payments
    FOR EACH ROW
    EXECUTE FUNCTION log_supplier_payment_as_expense();
