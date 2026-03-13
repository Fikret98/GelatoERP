-- FINAL COMPREHENSIVE FIX FOR SHIFT SYSTEM & FINANCIAL BALANCES
-- This script standardizes all types to ensure no silent failures.

-- 1. Standardize shifts table
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_user_id_fkey;
ALTER TABLE public.shifts ALTER COLUMN user_id TYPE integer USING NULL;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- 2. Update get_user_active_shift to use correct types (Integer user_id, Bigint return)
DROP FUNCTION IF EXISTS get_user_active_shift(integer);
CREATE OR REPLACE FUNCTION get_user_active_shift(p_user_id integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id bigint;
BEGIN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE user_id = p_user_id
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
    
    RETURN v_shift_id;
END;
$$;

-- 3. Update inventory purchase expense trigger
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
            'Mal alışı (Ödəniş): ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
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

-- 4. Update supplier payment expense trigger
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
        'Təchizatçıya borc ödənişi: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        NEW.date,
        NEW.created_by,
        NEW.supplier_id,
        'cash',
        v_shift_id
    );

    RETURN NEW;
END;
$$;

-- 5. Fix discrepancy categories for existing data to ensure they show up in HR
UPDATE public.expenses SET category = 'Növbə Arası (Araşdırılır)' WHERE category = 'Kassa Kəsiri' OR category = 'Növbə Arası';
UPDATE public.incomes SET category = 'Növbə Arası (Araşdırılır)' WHERE category = 'Kassa Artığı' OR category = 'Növbə Arası';

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_active_shift(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_shift(integer) TO anon;
