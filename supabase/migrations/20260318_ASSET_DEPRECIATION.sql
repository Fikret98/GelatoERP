-- 20260318_ASSET_DEPRECIATION.sql

-- 1. Add depreciation columns to fixed_assets
ALTER TABLE public.fixed_assets
ADD COLUMN IF NOT EXISTS useful_life_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS salvage_value DECIMAL(12, 2) DEFAULT 0;

-- 2. Create valuation view
CREATE OR REPLACE VIEW public.fixed_assets_valuation_view AS
WITH valuation AS (
    SELECT 
        *,
        (extract(year from age(now(), purchase_date)) * 12 + extract(month from age(now(), purchase_date))) as months_passed,
        CASE 
            WHEN useful_life_months > 0 THEN (cost - salvage_value) / useful_life_months
            ELSE 0 
        END as monthly_depreciation
    FROM public.fixed_assets
)
SELECT 
    *,
    GREATEST(0, LEAST(cost - salvage_value, monthly_depreciation * months_passed)) as accumulated_depreciation,
    cost - GREATEST(0, LEAST(cost - salvage_value, monthly_depreciation * months_passed)) as current_value,
    CASE 
        WHEN useful_life_months > 0 THEN LEAST(100, (months_passed::float / useful_life_months::float) * 100)
        ELSE 0 
    END as depreciation_percentage
FROM valuation;

-- 3. Reload schema
NOTIFY pgrst, 'reload schema';
