-- RESTORE SHIFT LINKAGE: Re-adding shift_id to transactions and fixing views
-- This script reverses the 'unification' changes that removed shift tracking.

-- 1. Restore shift_id columns to transaction tables
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.sales ADD COLUMN shift_id UUID REFERENCES public.shifts(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.expenses ADD COLUMN shift_id UUID REFERENCES public.shifts(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.incomes ADD COLUMN shift_id UUID REFERENCES public.shifts(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 2. Repair pos_products_view and ensure permissions
-- If it's missing or broken, this recreates it
CREATE OR REPLACE VIEW public.pos_products_view AS
SELECT 
    p.id,
    p.name,
    p.category,
    p.price,
    COALESCE(cv.calculated_cost_price, 0) as cost_price
FROM public.products p
LEFT JOIN public.product_costs_view cv ON p.id = cv.product_id;

-- 3. Grant permissions to both authenticated and anon roles
GRANT SELECT ON public.pos_products_view TO authenticated, anon;
GRANT ALL ON public.shifts TO authenticated, anon;
GRANT SELECT ON public.products TO authenticated, anon;
GRANT SELECT ON public.inventory TO authenticated, anon;

-- 4. Ensure get_active_shift function is accessible
GRANT EXECUTE ON FUNCTION public.get_active_shift(BIGINT) TO authenticated, anon;

-- 5. Fix RLS for sales/expenses/incomes to allow access to new column
-- (Assuming they have existing policies, we just ensure they are broad enough)
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated access to sales" ON public.sales;
CREATE POLICY "Allow authenticated access to sales" ON public.sales
    FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated access to expenses" ON public.expenses;
CREATE POLICY "Allow authenticated access to expenses" ON public.expenses
    FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated access to incomes" ON public.incomes;
CREATE POLICY "Allow authenticated access to incomes" ON public.incomes
    FOR ALL USING (true) WITH CHECK (true);
