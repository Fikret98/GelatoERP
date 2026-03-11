-- Fix RLS for incomes table to support custom auth system (anon role)
DROP POLICY IF EXISTS "Anon can view incomes" ON public.incomes;
DROP POLICY IF EXISTS "Anon can insert incomes" ON public.incomes;
DROP POLICY IF EXISTS "Anon can update incomes" ON public.incomes;
DROP POLICY IF EXISTS "Anon can delete incomes" ON public.incomes;

-- Create new policies for 'anon' role
CREATE POLICY "Anon can view incomes" ON public.incomes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert incomes" ON public.incomes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update incomes" ON public.incomes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon can delete incomes" ON public.incomes FOR DELETE TO anon USING (true);

-- Ensure RLS is enabled and forced
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes FORCE ROW LEVEL SECURITY;

-- Grant permissions explicitly
GRANT ALL ON public.incomes TO anon;
GRANT ALL ON public.incomes TO authenticated;
GRANT ALL ON public.incomes TO service_role;
