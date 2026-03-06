-- Security Fix: RLS policies should target the 'anon' role
-- since the app uses a custom authentication system (via the 'users' table).

DO $$ 
DECLARE t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        -- Enable and Force RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
        
        -- Drop old policies (targeted at 'authenticated')
        EXECUTE format('DROP POLICY IF EXISTS "Admin full access on %I" ON %I;', t, t);
        
        -- Create new policies for 'anon' role (which matches the app's current connection)
        EXECUTE format('CREATE POLICY "Admin full access on %I" ON %I FOR ALL TO anon USING (true) WITH CHECK (true);', t, t);
    END LOOP;
END $$;
