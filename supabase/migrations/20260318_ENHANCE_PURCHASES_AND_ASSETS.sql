-- 20260318_ENHANCE_PURCHASES_AND_ASSETS.sql

-- 1. Modify log_inventory_purchase_as_expense to always insert
CREATE OR REPLACE FUNCTION public.log_inventory_purchase_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item_name TEXT;
BEGIN
    SELECT name INTO v_item_name FROM public.inventory WHERE id = NEW.inventory_id;

    -- Always insert into expenses, even if amount_paid is 0
    -- This ensures the purchase appears in the activity feed (Reports)
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
        NEW.payment_method, -- Use the actual payment method from purchase
        NEW.id
    );
    
    RETURN NEW;
END;
$$;

-- 2. Enhance fixed_assets table
ALTER TABLE public.fixed_assets
ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS quantity DECIMAL(12, 2) DEFAULT 1,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2);

-- 3. Add asset_id to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES public.fixed_assets(id) ON DELETE SET NULL;

-- 4. Trigger function for fixed assets
CREATE OR REPLACE FUNCTION public.log_fixed_asset_as_expense()
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
        payment_method,
        asset_id
    )
    VALUES (
        'Əsas Vəsait Alışı',
        NEW.cost, -- The total cost is considered the expense amount
        'Əsas vəsait: ' || NEW.name || ' (' || NEW.quantity || ' ədəd x ' || COALESCE(NEW.unit_price, NEW.cost) || ' ₼)',
        NEW.purchase_date,
        COALESCE(NEW.created_by, (SELECT id FROM public.users LIMIT 1)),
        NEW.supplier_id,
        NEW.payment_method,
        NEW.id
    );
    RETURN NEW;
END;
$$;

-- 5. Create trigger for fixed assets
DROP TRIGGER IF EXISTS tr_log_fixed_asset_expense ON public.fixed_assets;
CREATE TRIGGER tr_log_fixed_asset_expense
AFTER INSERT ON public.fixed_assets
FOR EACH ROW
EXECUTE FUNCTION public.log_fixed_asset_as_expense();

-- 6. Update all_transactions_view to include asset_id
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
    NULL::integer as purchase_id,
    NULL::integer as asset_id
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
    e.purchase_id,
    e.asset_id
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
    NULL::integer as purchase_id,
    NULL::integer as asset_id
FROM public.incomes i
LEFT JOIN public.users u ON i.user_id = u.id;

NOTIFY pgrst, 'reload schema';
