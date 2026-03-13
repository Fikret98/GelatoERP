-- Centralized trigger to find active shift for a user
CREATE OR REPLACE FUNCTION get_user_active_shift(p_user_id integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id uuid;
BEGIN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE user_id::text = p_user_id::text
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
    
    RETURN v_shift_id;
END;
$$;

-- Update inventory purchase expense trigger to include shift and payment method
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id uuid;
BEGIN
    -- Only log as expense if there was a payment made
    IF NEW.amount_paid > 0 THEN
        v_shift_id := get_user_active_shift(NEW.created_by);

        INSERT INTO public.expenses (
            category,
            amount,
            description,
            date,
            user_id,
            supplier_id,
            payment_method,
            shift_id
        )
        VALUES (
            'Alış',
            NEW.amount_paid,
            'Mal alışı (Ödəniş): ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
            now(),
            NEW.created_by,
            NEW.supplier_id,
            'cash', -- Purchases are cash outflows from the drawer
            v_shift_id
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Update supplier payment expense trigger to include shift and payment method
CREATE OR REPLACE FUNCTION log_supplier_payment_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id uuid;
BEGIN
    v_shift_id := get_user_active_shift(NEW.created_by);

    INSERT INTO public.expenses (
        category,
        amount,
        description,
        date,
        user_id,
        supplier_id,
        payment_method,
        shift_id
    )
    VALUES (
        'Borc Ödənişi',
        NEW.amount,
        'Təchizatçıya borc ödənişi: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        NEW.date,
        NEW.created_by,
        NEW.supplier_id,
        'cash', -- Supplier debt payments are cash outflows from the drawer
        v_shift_id
    );

    RETURN NEW;
END;
$$;
