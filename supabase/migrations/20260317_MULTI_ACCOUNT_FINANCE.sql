-- 1. Add payment_method to inventory_purchases
ALTER TABLE public.inventory_purchases ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank'));

-- 2. Add payment_method to supplier_payments
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank'));

-- 3. Update log_inventory_purchase_as_expense trigger function
CREATE OR REPLACE FUNCTION public.log_inventory_purchase_as_expense()
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
            supplier_id,
            purchase_id,
            payment_method
        )
        VALUES (
            'Alış',
            NEW.amount_paid,
            'Mal alışı (Ödəniş): ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
            now(),
            NEW.created_by,
            NEW.supplier_id,
            NEW.id,
            COALESCE(NEW.payment_method, 'cash')
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Update log_supplier_payment_as_expense trigger function
CREATE OR REPLACE FUNCTION public.log_supplier_payment_as_expense()
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
        supplier_id,
        payment_method
    )
    VALUES (
        'Borc Ödənişi',
        NEW.amount,
        'Təchizatçıya borc ödənişi: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        NEW.date,
        NEW.created_by,
        NEW.supplier_id,
        COALESCE(NEW.payment_method, 'cash')
    );

    RETURN NEW;
END;
$$;
