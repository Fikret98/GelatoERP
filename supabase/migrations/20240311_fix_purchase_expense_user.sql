-- Migration to ensure 'Alış' (Purchase) expenses track the creator (user_id)
-- Fixed to avoid reference to potentially missing 'created_at' column in inventory_purchases

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
        user_id
    )
    VALUES (
        'Alış',
        NEW.quantity * NEW.unit_price,
        'Mal alışı: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id) || ' (' || NEW.quantity || ' ədəd)',
        now(), -- Use current time for the expense
        NEW.created_by
    );

    RETURN NEW;
END;
$$;

-- Safely recreate the trigger
DROP TRIGGER IF EXISTS tr_log_purchase_expense ON public.inventory_purchases;
CREATE TRIGGER tr_log_purchase_expense
    AFTER INSERT ON public.inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION log_inventory_purchase_as_expense();
