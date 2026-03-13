-- ENRICH PURCHASE TRANSACTION DETAILS
-- 1. Add purchase_id to expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS purchase_id INTEGER REFERENCES public.inventory_purchases(id) ON DELETE SET NULL;

-- 2. Update log_inventory_purchase_as_expense trigger function
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item_name TEXT;
BEGIN
    SELECT name INTO v_item_name FROM public.inventory WHERE id = NEW.inventory_id;

    IF NEW.amount_paid > 0 THEN
        INSERT INTO public.expenses (
            category,
            amount,
            description,
            date,
            user_id,
            supplier_id,
            payment_method,
            purchase_id
        )
        VALUES (
            'Alış',
            NEW.amount_paid,
            'Mal alışı: ' || v_item_name || ' (' || NEW.quantity || ' ədəd x ' || NEW.unit_price || ' ₼)',
            now(),
            NEW.created_by,
            NEW.supplier_id,
            'cash',
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Update all_transactions_view to include purchase_id
CREATE OR REPLACE VIEW public.all_transactions_view AS
SELECT 
    'sale'::text as type,
    s.id,
    s.total_amount as amount,
    'Satış'::text as category,
    ''::text as description,
    s.payment_method,
    s.date,
    s.seller_id as user_id,
    u.name as user_name,
    NULL::integer as purchase_id
FROM public.sales s
LEFT JOIN public.users u ON s.seller_id = u.id
UNION ALL
SELECT 
    'expense'::text as type,
    e.id,
    e.amount,
    e.category,
    e.description,
    e.payment_method,
    e.date,
    e.user_id,
    u.name as user_name,
    e.purchase_id
FROM public.expenses e
LEFT JOIN public.users u ON e.user_id = u.id
UNION ALL
SELECT 
    'income'::text as type,
    i.id,
    i.amount,
    i.category,
    i.description,
    i.payment_method,
    i.date,
    i.user_id,
    u.name as user_name,
    NULL::integer as purchase_id
FROM public.incomes i
LEFT JOIN public.users u ON i.user_id = u.id;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
