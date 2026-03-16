-- 1. Create Shift Discrepancies Table
CREATE TABLE IF NOT EXISTS public.shift_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
    reported_by_id BIGINT REFERENCES public.users(id),
    verified_by_id BIGINT REFERENCES public.users(id),
    system_expected DECIMAL(12, 2) NOT NULL,
    seller_reported DECIMAL(12, 2) NOT NULL,
    verifier_counted DECIMAL(12, 2) NOT NULL,
    difference DECIMAL(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, resolved, dismissed
    responsible_user_id BIGINT REFERENCES public.users(id),
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create App Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Shift Discrepancy Limit
INSERT INTO public.app_settings (key, value)
VALUES ('shift_security', '{"critical_limit": 50.00}')
ON CONFLICT (key) DO NOTHING;

-- 3. Function to resolve discrepancy and create financial record
CREATE OR REPLACE FUNCTION public.resolve_shift_discrepancy(
    p_discrepancy_id UUID,
    p_responsible_user_id BIGINT,
    p_admin_notes TEXT,
    p_status TEXT -- resolved, dismissed
)
RETURNS VOID AS $$
DECLARE
    v_diff DECIMAL(12, 2);
    v_shift_id UUID;
BEGIN
    SELECT difference, shift_id INTO v_diff, v_shift_id
    FROM public.shift_discrepancies
    WHERE id = p_discrepancy_id;

    -- Update discrepancy status
    UPDATE public.shift_discrepancies
    SET 
        status = p_status,
        responsible_user_id = p_responsible_user_id,
        admin_notes = p_admin_notes,
        resolved_at = NOW()
    WHERE id = p_discrepancy_id;

    IF p_status = 'resolved' THEN
        -- If kəsir (difference < 0) -> Create Expense
        IF v_diff < 0 THEN
            INSERT INTO public.expenses (amount, category, description, date, payment_method)
            VALUES (ABS(v_diff), 'Kassa Kəsiri', 'Növbə fərqi (ID: ' || v_shift_id || ')', NOW(), 'cash');
            
            -- Add to HR Debt (assuming we have a debts table or logic, if not we log it)
            -- For now, just the expense is enough as per primary requirement.
        ELSIF v_diff > 0 THEN
            -- If artıq (difference > 0) -> Create Income
            INSERT INTO public.incomes (amount, category, description, date, payment_method)
            VALUES (v_diff, 'Kassa Artığı', 'Növbə fərqi (ID: ' || v_shift_id || ')', NOW(), 'cash');
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable RLS
ALTER TABLE public.shift_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Polices (Simplified for development, adjust as needed)
DROP POLICY IF EXISTS "Allow authenticated access to shift_discrepancies" ON public.shift_discrepancies;
CREATE POLICY "Allow authenticated access to shift_discrepancies" ON public.shift_discrepancies
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated access to app_settings" ON public.app_settings;
CREATE POLICY "Allow authenticated access to app_settings" ON public.app_settings
    FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.shift_discrepancies TO authenticated;
GRANT ALL ON public.app_settings TO authenticated;
GRANT ALL ON public.shift_discrepancies TO anon; -- For dev convenience if needed, reconsider for prod
GRANT ALL ON public.app_settings TO anon;
