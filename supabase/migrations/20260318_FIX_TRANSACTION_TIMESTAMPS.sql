-- FIX TRANSACTION TIMESTAMPS: Ensuring full time data (not just date)
-- 1. Drop dependent views
DROP VIEW IF EXISTS public.all_transactions_view CASCADE;
DROP VIEW IF EXISTS public.fixed_assets_valuation_view CASCADE;

-- 2. Convert column types where necessary
DO $$ 
BEGIN
    -- Fixed Assets
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fixed_assets' AND column_name = 'purchase_date' AND data_type = 'date') THEN
        ALTER TABLE public.fixed_assets ALTER COLUMN purchase_date TYPE TIMESTAMPTZ USING purchase_date::timestamptz;
    END IF;

    -- Supplier Payments
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_payments' AND column_name = 'date' AND data_type = 'date') THEN
        ALTER TABLE public.supplier_payments ALTER COLUMN date TYPE TIMESTAMPTZ USING date::timestamptz;
    END IF;

    -- Ensure expenses, incomes, sales use TIMESTAMPTZ
    -- (They usually do, but this is for safety)
    ALTER TABLE public.expenses ALTER COLUMN date TYPE TIMESTAMPTZ USING date::timestamptz;
    ALTER TABLE public.expenses ALTER COLUMN date SET DEFAULT now();

    ALTER TABLE public.incomes ALTER COLUMN date TYPE TIMESTAMPTZ USING date::timestamptz;
    ALTER TABLE public.incomes ALTER COLUMN date SET DEFAULT now();

    ALTER TABLE public.sales ALTER COLUMN date TYPE TIMESTAMPTZ USING date::timestamptz;
    ALTER TABLE public.sales ALTER COLUMN date SET DEFAULT now();

    -- Ensure inventory_purchases date has time
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_purchases' AND column_name = 'date') THEN
        ALTER TABLE public.inventory_purchases ALTER COLUMN date TYPE TIMESTAMPTZ USING date::timestamptz;
        ALTER TABLE public.inventory_purchases ALTER COLUMN date SET DEFAULT now();
    END IF;
END $$;

-- 3. Update Trigger Functions to use now()
-- This ensures that when a transaction is logged from another table, it gets the CURRENT time.

-- A. Fixed Assets Trigger
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
        date, -- Use full timestamp
        user_id,
        asset_id,
        supplier_id,
        payment_method
    )
    VALUES (
        'Əsas Vəsait Alışı',
        NEW.cost,
        'Əsas vəsait alışı: ' || NEW.name || ' (' || NEW.quantity || ' ədəd)',
        now(), -- Record the actual time of insertion
        NEW.created_by,
        NEW.id,
        NEW.supplier_id,
        COALESCE(NEW.payment_method, 'cash')
    );
    RETURN NEW;
END;
$$;

-- B. Supplier Payment Trigger
CREATE OR REPLACE FUNCTION public.log_supplier_payment_as_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id UUID;
BEGIN
    -- Get active shift for the user
    SELECT id INTO v_shift_id 
    FROM public.shifts 
    WHERE user_id = NEW.created_by AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;

    INSERT INTO public.expenses (
        category,
        amount,
        description,
        date, -- Use full timestamp
        user_id,
        supplier_id,
        payment_method,
        shift_id
    )
    VALUES (
        'Borc Ödənişi',
        NEW.amount,
        'Təchizatçıya ödəniş: ' || (SELECT name FROM public.suppliers WHERE id = NEW.supplier_id),
        now(), -- Record the actual time of insertion
        NEW.created_by,
        NEW.supplier_id,
        COALESCE(NEW.payment_method, 'cash'),
        v_shift_id
    );
    RETURN NEW;
END;
$$;

-- 4. Recreate dependent views
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

CREATE OR REPLACE VIEW public.fixed_assets_valuation_view AS
WITH valuation AS (
    SELECT 
        *,
        (extract(year from age(now(), purchase_date)) * 12 + extract(month from age(now(), purchase_date))) as months_passed,
        CASE 
            WHEN useful_life_months > 0 THEN (cost - salvage_value) / useful_life_months
            ELSE 0 
        END as monthly_depreciation
    FROM public.fixed_assets
)
SELECT 
    *,
    GREATEST(0, LEAST(cost - salvage_value, monthly_depreciation * months_passed)) as accumulated_depreciation,
    cost - GREATEST(0, LEAST(cost - salvage_value, monthly_depreciation * months_passed)) as current_value,
    CASE 
        WHEN useful_life_months > 0 THEN LEAST(100, (months_passed::float / useful_life_months::float) * 100)
        ELSE 0 
    END as depreciation_percentage
FROM valuation;

-- 5. Reload cache
NOTIFY pgrst, 'reload schema';
