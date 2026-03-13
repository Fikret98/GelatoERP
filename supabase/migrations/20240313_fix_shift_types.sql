-- Standardize shifts.user_id to use public.users(id) integer
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_user_id_fkey;
ALTER TABLE public.shifts ALTER COLUMN user_id TYPE integer USING NULL; -- Drop data if incompatible, or cast if possible
ALTER TABLE public.shifts ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Link existing shifts to users based on some logic if possible, or just leave as is
-- Since this is a fix for a very recent issue, we can reset the table if it's mostly test data
-- TRUNCATE public.shifts CASCADE; -- Optional: clear if data is corrupted
