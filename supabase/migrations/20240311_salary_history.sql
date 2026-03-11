-- Create salary history table to track promotions and salary changes
CREATE TABLE IF NOT EXISTS public.salary_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  old_salary NUMERIC,
  new_salary NUMERIC,
  old_bonus_percentage NUMERIC,
  new_bonus_percentage NUMERIC,
  old_role TEXT,
  new_role TEXT,
  change_type TEXT DEFAULT 'update', -- 'promotion', 'salary_change', 'bonus_change', 'role_change', 'update'
  note TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by INTEGER REFERENCES public.users(id)
);

-- RLS policies
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read salary history" ON public.salary_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert salary history" ON public.salary_history FOR INSERT TO authenticated WITH CHECK (true);
