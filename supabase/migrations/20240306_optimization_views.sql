-- 1. Low Stock View
-- Purpose: Offload filtering of low stock items from frontend JS to DB
CREATE OR REPLACE VIEW public.low_stock_view AS
SELECT 
    name, 
    stock_quantity, 
    critical_limit, 
    unit
FROM public.inventory
WHERE stock_quantity <= COALESCE(critical_limit, 0);

-- 2. POS Products View
-- Purpose: Join products with their calculated cost in a single query for POS
CREATE OR REPLACE VIEW public.pos_products_view AS
SELECT 
    p.id,
    p.name,
    p.category,
    p.price,
    COALESCE(cv.calculated_cost_price, 0) as cost_price
FROM public.products p
LEFT JOIN public.product_costs_view cv ON p.id = cv.product_id;

-- 3. Ensure RLS for these views (inherited from base tables, but good to grant access)
GRANT SELECT ON public.low_stock_view TO anon;
GRANT SELECT ON public.pos_products_view TO anon;
