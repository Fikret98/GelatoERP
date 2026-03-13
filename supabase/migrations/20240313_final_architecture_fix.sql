-- FINAL ARCHITECTURAL FIX: Standardizing everything to Integer/Bigint and fixing RPCs

-- 1. Drop EVERYTHING related to shifts to avoid type collisions and overloading
DROP TRIGGER IF EXISTS tr_log_purchase_expense ON public.inventory_purchases;
DROP TRIGGER IF EXISTS tr_log_supplier_payment_expense ON public.supplier_payments;
DROP FUNCTION IF EXISTS log_inventory_purchase_as_expense();
DROP FUNCTION IF EXISTS log_supplier_payment_as_expense();
DROP FUNCTION IF EXISTS get_active_shift(uuid);
DROP FUNCTION IF EXISTS get_active_shift(integer);
DROP FUNCTION IF EXISTS get_user_active_shift(integer);
DROP FUNCTION IF EXISTS get_user_active_shift(uuid);

-- 2. Standardize shifts table columns and types
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_user_id_fkey;
ALTER TABLE public.shifts ALTER COLUMN user_id TYPE integer USING (CASE WHEN user_id::text ~ '^[0-9]+$' THEN user_id::text::integer ELSE NULL END);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- 3. Robust function to get active shift (Internal use)
CREATE OR REPLACE FUNCTION get_user_active_shift(p_user_id integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id bigint;
BEGIN
    SELECT id INTO v_id 
    FROM public.shifts 
    WHERE user_id = p_user_id AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;
    RETURN v_id;
END;
$$;

-- 4. Robust RPC for frontend (SETOF/TABLE compatibility)
CREATE OR REPLACE FUNCTION get_active_shift(p_user_id integer)
RETURNS SETOF public.shifts
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.shifts 
    WHERE user_id = p_user_id AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;
$$;

-- 5. Update Purchase Trigger (Linking to shift)
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id bigint;
BEGIN
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
            'Mal alışı: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id),
            now(),
            NEW.created_by,
            NEW.supplier_id,
            'cash',
            v_shift_id
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_log_purchase_expense
    AFTER INSERT ON public.inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION log_inventory_purchase_as_expense();

-- 6. Update Supplier Payment Trigger
CREATE OR REPLACE FUNCTION log_supplier_payment_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id bigint;
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
        'Təchizatçıya ödəniş: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        NEW.date,
        NEW.created_by,
        NEW.supplier_id,
        'cash',
        v_shift_id
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_log_supplier_payment_expense
    AFTER INSERT ON public.supplier_payments
    FOR EACH ROW
    EXECUTE FUNCTION log_supplier_payment_as_expense();

-- 7. Permissions
GRANT ALL ON public.shifts TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_active_shift(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_active_shift(integer) TO authenticated, anon;
