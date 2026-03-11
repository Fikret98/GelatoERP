-- 1. Ensure bonus_percentage exists in users (fixing the reported error)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bonus_percentage numeric DEFAULT 0.8;

-- 2. Rename role to job_title in employees to avoid confusion with system roles
ALTER TABLE public.employees RENAME COLUMN role TO job_title;

-- 3. Add user_id to employees to link with users table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. Data Migration: Link existing employees to users based on name
UPDATE public.employees e
SET user_id = u.id
FROM public.users u
WHERE e.name = u.name AND e.user_id IS NULL;

-- 5. Finalize the link (optional: make it unique/not null later once verified)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_user_id ON public.employees(user_id);

-- 6. Update the seller_bonuses_view to use the new link if possible, 
-- but it's already using users table which is correct.
-- Let's just make sure it's up to date.
CREATE OR REPLACE VIEW public.seller_bonuses_view AS
SELECT 
    u.name as seller_name,
    u.id as user_id,
    COALESCE(SUM(s.total_amount * COALESCE(u.bonus_percentage, 0.8) / 100), 0) as total_bonus
FROM public.users u
LEFT JOIN public.sales s ON u.id = s.seller_id
GROUP BY u.id, u.name, u.bonus_percentage;
