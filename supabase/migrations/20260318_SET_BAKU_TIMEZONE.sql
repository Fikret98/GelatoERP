-- TIMEZONE ENFORCEMENT
-- Set database timezone to Baku for consistency in now() calculations
ALTER DATABASE postgres SET timezone TO 'Asia/Baku';

-- Update all existing transaction records to ensure they are interpreted as Asia/Baku if they were stored as local without offset
-- (Though TIMESTAMPTZ handles this, setting the DB timezone is the definitive way to fix now() behavior)

NOTIFY pgrst, 'reload schema';
