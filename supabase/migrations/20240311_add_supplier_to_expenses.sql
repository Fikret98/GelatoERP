-- Add supplier_id column to expenses table (nullable, only set for purchase-type expenses)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES public.suppliers(id);

-- Update the trigger function to also store supplier_id
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
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
        'Alış',
        NEW.quantity * NEW.unit_price,
        'Mal alışı: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
        now(),
        NEW.created_by,
        NEW.supplier_id
    );

    RETURN NEW;
END;
$$;

-- Recreate the trigger (it already exists, no need to drop/recreate but safe to do so)
DROP TRIGGER IF EXISTS tr_log_purchase_expense ON public.inventory_purchases;
CREATE TRIGGER tr_log_purchase_expense
    AFTER INSERT ON public.inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION log_inventory_purchase_as_expense();
