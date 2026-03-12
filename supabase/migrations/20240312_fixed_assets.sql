-- Create fixed_assets table
CREATE TABLE IF NOT EXISTS fixed_assets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', -- active, maintenance, disposed
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_DATE,
    created_by INTEGER REFERENCES users(id)
);

-- Enable RLS
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users (simplified for now, mirroring other tables)
CREATE POLICY "Allow all for authenticated users on fixed_assets"
    ON fixed_assets FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Add to expenses log when a new asset is added? 
-- The user didn't explicitly ask for this, but it's good practice. 
-- For now, let's just keep the table for tracking.

-- Create indexes
CREATE INDEX idx_fixed_assets_status ON fixed_assets(status);
CREATE INDEX idx_fixed_assets_purchase_date ON fixed_assets(purchase_date);
