-- Migration for Fixing Negative Inventory and Trigger Bugs

-- 1. First, set any existing negative stock to 0 to avoid constraint violation
UPDATE public.inventory SET stock_quantity = 0 WHERE stock_quantity < 0;

-- 2. Safely add a constraint to prevent negative stock
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_stock_non_negative'
    ) THEN
        ALTER TABLE public.inventory ADD CONSTRAINT inventory_stock_non_negative CHECK (stock_quantity >= 0);
    END IF;
END $$;

-- 2. Improved process_sale function with aggregate stock validation
-- We drop it first to avoid "cannot remove parameter defaults" error
DROP FUNCTION IF EXISTS process_sale(numeric, jsonb, integer);

CREATE OR REPLACE FUNCTION process_sale(p_total_amount numeric, p_items jsonb, p_seller_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id integer;
    v_item jsonb;
    v_needed record;
BEGIN
    -- Aggregate total required quantity for each raw material across all items in the cart
    -- This prevents over-selling when multiple items share materials.
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
    INSERT INTO sales (total_amount, date, seller_id)
    VALUES (p_total_amount, now(), p_seller_id)
    RETURNING id INTO v_sale_id;

    -- Insert sale items and deduct inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO sale_items (sale_id, product_id, quantity, price)
        VALUES (v_sale_id, (v_item->>'product_id')::integer, (v_item->>'quantity')::integer, (v_item->>'price')::numeric);

        -- Deducting inventory using aggregate logic to be safe, 
        -- though we already checked for whole cart above.
        UPDATE inventory i
        SET stock_quantity = i.stock_quantity - (r.quantity_needed * (v_item->>'quantity')::integer)
        FROM recipes r
        WHERE r.product_id = (v_item->>'product_id')::integer AND r.inventory_id = i.id;
    END LOOP;

    RETURN v_sale_id;
END;
$$;

-- 3. Fix update_inventory_item_cogs trigger
-- Removed the line that resets stock_quantity from purchase history (which ignored sales)
CREATE OR REPLACE FUNCTION update_inventory_item_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_quantity NUMERIC;
    v_total_cost NUMERIC;
    v_avg_cost NUMERIC;
BEGIN
    -- Calculate average cost across ALL purchases for this item
    SELECT 
        SUM(quantity),
        SUM(quantity * unit_price)
    INTO 
        v_total_quantity,
        v_total_cost
    FROM inventory_purchases
    WHERE inventory_id = NEW.inventory_id;

    IF v_total_quantity > 0 THEN
        v_avg_cost := ROUND(v_total_cost / v_total_quantity, 2);
        
        -- 1. Update average cost for the item
        UPDATE inventory SET unit_cost = v_avg_cost WHERE id = NEW.inventory_id;
    END IF;

    -- 2. Increment stock ONLY on INSERT to avoid double-counting on updates
    IF TG_OP = 'INSERT' THEN
        UPDATE inventory SET stock_quantity = stock_quantity + NEW.quantity WHERE id = NEW.inventory_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Clean up redundant triggers and functions
-- We drop the dependent trigger first
DROP TRIGGER IF EXISTS tr_update_cogs ON inventory_purchases;
DROP FUNCTION IF EXISTS update_inventory_cogs();

-- 5. Create/Recreate the trigger for inventory purchases
-- This ensures the NEW function is actually being used
DROP TRIGGER IF EXISTS tr_inventory_purchase_update ON inventory_purchases;
CREATE TRIGGER tr_inventory_purchase_update
    AFTER INSERT OR UPDATE ON inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_item_cogs();

-- Ensure permissions are set correctly for POS
GRANT EXECUTE ON FUNCTION process_sale(numeric, jsonb, integer) TO anon;
GRANT EXECUTE ON FUNCTION process_sale(numeric, jsonb, integer) TO authenticated;
