-- 0. Create/Update Shifts Table
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES public.users(id),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_balance DECIMAL(12, 2) DEFAULT 0,
    expected_cash_balance DECIMAL(12, 2) DEFAULT 0,
    actual_cash_balance DECIMAL(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'open', -- open, closed
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.shifts ADD COLUMN cash_sales DECIMAL(12, 2) DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.shifts ADD COLUMN card_sales DECIMAL(12, 2) DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.shifts ADD COLUMN total_incomes DECIMAL(12, 2) DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.shifts ADD COLUMN total_expenses DECIMAL(12, 2) DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 1. Function to get active shift for a user
CREATE OR REPLACE FUNCTION public.get_active_shift(p_user_id BIGINT)
RETURNS SETOF public.shifts
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.shifts 
    WHERE user_id = p_user_id AND status = 'open' 
    ORDER BY opened_at DESC LIMIT 1;
$$;

-- Enable RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Policies (Idempotent)
DROP POLICY IF EXISTS "Allow authenticated access to shifts" ON public.shifts;
CREATE POLICY "Allow authenticated access to shifts" ON public.shifts
    FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions (Ensure anon can also access if RLS allows, but RLS is enabled)
GRANT ALL ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO anon;
GRANT ALL ON public.shifts TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_shift(BIGINT) TO authenticated, anon;
