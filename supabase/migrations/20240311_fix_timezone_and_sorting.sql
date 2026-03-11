-- Set the database timezone to Asia/Baku to ensure manual timestamp entries are interpreted correctly
-- (manual entries currently send local strings without offsets, which PG interprets as UTC in a UTC session)

ALTER DATABASE postgres SET timezone TO 'Asia/Baku';
ALTER ROLE authenticated SET timezone TO 'Asia/Baku';
ALTER ROLE anon SET timezone TO 'Asia/Baku';
ALTER ROLE service_role SET timezone TO 'Asia/Baku';

-- Add default sorting indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_sales_date_desc ON sales (date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date_desc ON expenses (date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_incomes_date_desc ON incomes (date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_purchases_date_desc ON inventory_purchases (purchase_date DESC);
