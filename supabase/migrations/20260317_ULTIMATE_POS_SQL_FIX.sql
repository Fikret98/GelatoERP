-- ULTIMATE CONSOLIDATED SQL FIX: Resolve all POS, Shifts, and Overloading conflicts
-- This script clears all previous variations and ensures a single definitive function.

-- 1. DROP ALL POSSIBLE VARIATIONS OF PROCESS_SALE
-- We use a DO block to drop functions regardless of their specific argument names or order
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ');' as drop_cmd
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'process_sale'
        AND n.nspname = 'public'
    ) LOOP
        EXECUTE r.drop_cmd;
    END LOOP;
END $$;

-- 2. CREATE THE DEFINITIVE PROCESS_SALE
CREATE OR REPLACE FUNCTION public.process_sale(
    p_total_amount numeric, 
    p_items jsonb, 
    p_seller_id integer,
    p_payment_method text DEFAULT 'cash',
    p_shift_id UUID DEFAULT NULL
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
    INSERT INTO public.sales (total_amount, date, seller_id, payment_method, shift_id)
    VALUES (p_total_amount, now(), p_seller_id, p_payment_method, p_shift_id)
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

-- 3. PERMISSIONS & VIEWS
GRANT EXECUTE ON FUNCTION public.process_sale(numeric, jsonb, integer, text, UUID) TO authenticated, anon;

-- Ensure shift_id column exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='shift_id') THEN
        ALTER TABLE public.sales ADD COLUMN shift_id UUID REFERENCES public.shifts(id);
    END IF;
END $$;
