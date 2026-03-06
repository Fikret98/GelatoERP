-- 1. Enable Realtime for the required tables
-- This ensures the React app receives postgres_changes events
BEGIN;
  -- Remove them first just in case to avoid duplicates/errors
  -- ALTER PUBLICATION supabase_realtime DROP TABLE inventory;
  -- ALTER PUBLICATION supabase_realtime DROP TABLE sales;
  -- ALTER PUBLICATION supabase_realtime DROP TABLE expenses;
EXCEPTION WHEN OTHERS THEN
END;

ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;

-- Note on Negative Inventory:
-- In standard POS systems, negative inventory is allowed because you shouldn't 
-- block a physical sale just because the warehouse manager forgot to input the latest milk delivery.
-- If you DO want to completely block sales when inventory is 0, we would need to modify 
-- the process_sale RPC to RAISE EXCEPTION 'Anbar xətası: Kifayət qədər ehtiyat yoxdur'.
