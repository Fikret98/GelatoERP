-- 1. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Policies 
-- Since the project uses custom login (not Supabase Auth), auth.uid() is null.
-- For now, we allow access to anon but ideally we'd use a different security check.
CREATE POLICY "Enable access for everyone"
    ON public.push_subscriptions
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Grant access to anon for testing (since the user likes anon access)
GRANT ALL ON TABLE public.push_subscriptions TO anon, authenticated;

-- 5. Add a function to handle expired/failed subscriptions if needed later
-- (Logic for deleting stale subscriptions would go here)
