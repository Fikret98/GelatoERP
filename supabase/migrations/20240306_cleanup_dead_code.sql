-- Drop obsolete dashboard stats function
DROP FUNCTION IF EXISTS get_dashboard_stats();

-- Drop redundant 2-argument version of process_sale
-- The application now uses the 3-argument version: process_sale(numeric, jsonb, integer)
DROP FUNCTION IF EXISTS process_sale(numeric, jsonb);
