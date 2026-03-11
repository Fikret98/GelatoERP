-- Migration to add user_id to expenses and ensure timestamp support
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES public.users(id),
  ALTER COLUMN date TYPE timestamptz USING date::timestamptz;

-- Set default value for now() if not already set
ALTER TABLE public.expenses ALTER COLUMN date SET DEFAULT now();

-- Update existing records with a default user if needed (optional)
-- UPDATE public.expenses SET user_id = (SELECT id FROM public.users LIMIT 1) WHERE user_id IS NULL;
