-- 0. Create Shifts Table
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

-- Enable RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow authenticated access to shifts" ON public.shifts
    FOR ALL USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO anon;
