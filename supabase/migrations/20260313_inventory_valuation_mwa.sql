-- Inventory Valuation Fix: Moving Weighted Average (MWA)
-- This script replaces the old "Full History Average" with a standard MWA calculation
-- and fixes stock-sync bugs when editing or deleting purchases.

-- 1. Create the improved MWA function
CREATE OR REPLACE FUNCTION update_inventory_item_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inventory_id INTEGER;
    v_current_stock NUMERIC;
    v_current_cost NUMERIC;
    v_qty_delta NUMERIC;
    v_val_delta NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    -- Determine the Delta based on the operation
    IF TG_OP = 'DELETE' THEN
        v_inventory_id := OLD.inventory_id;
        v_qty_delta := -OLD.quantity;
        v_val_delta := -(OLD.quantity * OLD.unit_price);
    ELSIF TG_OP = 'UPDATE' THEN
        v_inventory_id := NEW.inventory_id;
        v_qty_delta := NEW.quantity - OLD.quantity;
        v_val_delta := (NEW.quantity * NEW.unit_price) - (OLD.quantity * OLD.unit_price);
    ELSE -- INSERT
        v_inventory_id := NEW.inventory_id;
        v_qty_delta := NEW.quantity;
        v_val_delta := NEW.quantity * NEW.unit_price;
    END IF;

    -- Get current state from inventory table
    SELECT stock_quantity, unit_cost INTO v_current_stock, v_current_cost
    FROM public.inventory WHERE id = v_inventory_id;

    -- Calculate New Stock
    v_new_stock := v_current_stock + v_qty_delta;
    
    -- Calculate New Moving Weighted Average Cost
    -- Formula: NewAverage = (CurrentValue + AddedValue) / NewStock
    IF v_new_stock > 0 THEN
        -- If current stock is negative/zero, the new price is just the purchase price
        IF v_current_stock <= 0 THEN
            -- Only use val_delta / qty_delta if we are actually adding stock
            IF v_qty_delta > 0 THEN
                v_new_cost := v_val_delta / v_qty_delta;
            ELSE
                v_new_cost := v_current_cost; -- Default to current if somehow removing from non-existent stock
            END IF;
        ELSE
            -- Standard MWA calculation
            v_new_cost := ((v_current_stock * v_current_cost) + v_val_delta) / v_new_stock;
        END IF;
    ELSE
        -- If stock goes to zero or negative, keep the last known average cost
        v_new_cost := v_current_cost;
    END IF;

    -- Update inventory record
    UPDATE public.inventory 
    SET 
        stock_quantity = v_new_stock,
        unit_cost = ROUND(GREATEST(0, v_new_cost), 2)
    WHERE id = v_inventory_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Recreate the trigger to include DELETE operations
DROP TRIGGER IF EXISTS tr_inventory_purchase_update ON inventory_purchases;
CREATE TRIGGER tr_inventory_purchase_update
    AFTER INSERT OR UPDATE OR DELETE ON inventory_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_item_cogs();

-- 3. Optional: Recalculate all existing item costs based on current total history 
-- to provide a clean slate for the MWA logic to start from.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM inventory LOOP
        UPDATE inventory i
        SET unit_cost = COALESCE((
            SELECT ROUND(SUM(quantity * unit_price) / NULLIF(SUM(quantity), 0), 2)
            FROM inventory_purchases
            WHERE inventory_id = r.id
        ), i.unit_cost)
        WHERE id = r.id;
    END LOOP;
END $$;
