-- FIX PROCESS_SALE: Support UUID shift_id and ensure linkage
-- This script updates the process_sale function to match the new shifts table schema.

CREATE OR REPLACE FUNCTION public.process_sale(
    p_total_amount numeric, 
    p_items jsonb, 
    p_seller_id integer,
    p_payment_method text DEFAULT 'cash',
    p_shift_id UUID DEFAULT NULL -- Changed from bigint to UUID
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

    -- Record the sale (Including shift_id linkage)
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

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION public.process_sale(numeric, jsonb, integer, text, UUID) TO authenticated, anon;
