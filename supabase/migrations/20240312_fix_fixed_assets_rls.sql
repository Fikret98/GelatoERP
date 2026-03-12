-- Drop the old policy that was targeting 'authenticated'
DROP POLICY IF EXISTS "Allow all for authenticated users on fixed_assets" ON fixed_assets;

-- Create the correct policy for the 'anon' role used by the app's custom auth
CREATE POLICY "Allow all for anon on fixed_assets"
    ON fixed_assets FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
