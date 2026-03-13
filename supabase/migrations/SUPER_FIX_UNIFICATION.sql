-- FINAL SUPER FIX: RUN THIS IN SUPABASE SQL EDITOR
-- This script fixes ALL regressions, including the Relationship/Join error.

-- 1. DROP EVERYTHING OLD TO START CLEAN
DROP VIEW IF EXISTS public.all_transactions_view CASCADE;
DROP FUNCTION IF EXISTS public.process_sale(numeric, jsonb, integer, text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.process_sale(numeric, jsonb, integer, text) CASCADE;

-- 2. RECREATE all_transactions_view (WITH EMBEDDED USER NAMES)
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
    u.name as user_name
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
    u.name as user_name
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
    u.name as user_name
FROM public.incomes i
LEFT JOIN public.users u ON i.user_id = u.id;

-- 3. RECREATE process_sale (Simplified, no shift dependencies)
CREATE OR REPLACE FUNCTION public.process_sale(
    p_total_amount numeric, 
    p_items jsonb, 
    p_seller_id integer,
    p_payment_method text DEFAULT 'cash'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale_id integer;
    v_item jsonb;
    v_needed record;
BEGIN
    -- Stock validation
    FOR v_needed IN 
        WITH cart_items AS (
            SELECT 
                (elem->>'product_id')::integer as product_id,
                (elem->>'quantity')::numeric as sale_quantity
            FROM jsonb_array_elements(p_items) as elem
        ),
        required_materials AS (
            SELECT 
                r.inventory_id,
                i.name as material_name,
                SUM(r.quantity_needed * ci.sale_quantity) as total_required,
                i.stock_quantity as current_stock
            FROM cart_items ci
            JOIN recipes r ON ci.product_id = r.product_id
            JOIN inventory i ON r.inventory_id = i.id
            GROUP BY r.inventory_id, i.name, i.stock_quantity
        )
        SELECT * FROM required_materials WHERE total_required > current_stock
    LOOP
        RAISE EXCEPTION 'Anbar xətası: % çatışmır (Lazımdır: %, Mövcuddur: %)', 
            v_needed.material_name, v_needed.total_required, v_needed.current_stock;
    END LOOP;

    -- Record the sale
    INSERT INTO public.sales (total_amount, date, seller_id, payment_method)
    VALUES (p_total_amount, now(), p_seller_id, p_payment_method)
    RETURNING id INTO v_sale_id;

    -- Insert sale items and deduct inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (sale_id, product_id, quantity, price)
        VALUES (v_sale_id, (v_item->>'product_id')::integer, (v_item->>'quantity')::numeric, (v_item->>'price')::numeric);

        UPDATE public.inventory i
        SET stock_quantity = i.stock_quantity - (r.quantity_needed * (v_item->>'quantity')::numeric)
        FROM public.recipes r
        WHERE r.product_id = (v_item->>'product_id')::integer AND r.inventory_id = i.id;
    END LOOP;

    RETURN v_sale_id;
END;
$$;

-- 4. GRANT PERMISSIONS
GRANT SELECT ON public.all_transactions_view TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(numeric, jsonb, integer, text) TO authenticated, anon;

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
