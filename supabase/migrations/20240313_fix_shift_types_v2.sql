-- Comprehensive fix for shift user_id and audit trail
-- 1. Ensure shifts use integer user_id
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_user_id_fkey;
ALTER TABLE public.shifts ALTER COLUMN user_id TYPE integer USING NULL;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- 2. Data Migration: Fix existing shifts if any (link to first admin as fallback or leave null)
UPDATE public.shifts SET user_id = (SELECT id FROM public.users WHERE role = 'admin' LIMIT 1) WHERE user_id IS NULL;

-- 3. Fix the 'Kassa Kəsiri' and 'Kassa Artığı' to 'Növbə Arası (Araşdırılır)' for existing closing discrepancies
UPDATE public.expenses SET category = 'Növbə Arası (Araşdırılır)' WHERE category = 'Kassa Kəsiri';
UPDATE public.incomes SET category = 'Növbə Arası (Araşdırılır)' WHERE category = 'Kassa Artığı';
