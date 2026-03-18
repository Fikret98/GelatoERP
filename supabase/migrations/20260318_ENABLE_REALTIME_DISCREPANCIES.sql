-- Enable Realtime for shift_discrepancies table
-- This allows the dashboard and layout notification hooks to receive live updates

BEGIN;

-- Check if the table is already in the publication, to avoid errors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'shift_discrepancies'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_discrepancies;
    END IF;
END
$$;

COMMIT;
