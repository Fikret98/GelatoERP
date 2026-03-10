-- 1. Add bonus_percentage to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bonus_percentage numeric DEFAULT 0.8;

-- 2. Create or Replace the View for seller bonuses
-- This calculates total bonus per seller based on their individual bonus_percentage
CREATE OR REPLACE VIEW public.seller_bonuses_view AS
SELECT 
    u.name as seller_name,
    COALESCE(SUM(s.total_amount * COALESCE(u.bonus_percentage, 0.8) / 100), 0) as total_bonus
FROM public.users u
LEFT JOIN public.sales s ON u.id = s.seller_id
GROUP BY u.name, u.bonus_percentage;

-- 3. Grant access
GRANT SELECT ON public.seller_bonuses_view TO authenticated;
GRANT SELECT ON public.seller_bonuses_view TO anon;
