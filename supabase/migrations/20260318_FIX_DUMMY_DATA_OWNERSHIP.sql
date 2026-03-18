-- Reassign all pending discrepancies originating from Ramazan Bahadur to the current operating user (Fikrat)
UPDATE public.shift_discrepancies
SET reported_by_id = verified_by_id
WHERE status = 'pending' AND reported_by_id IN (
    SELECT id FROM public.users WHERE name ILIKE '%Ramazan%'
);

-- Reassign any existing shifts from Ramazan to avoid this issue triggering again
-- (Since he never actually opened his account, these were test shifts)
UPDATE public.shifts 
SET user_id = (SELECT id FROM public.users WHERE name NOT ILIKE '%Ramazan%' ORDER BY id ASC LIMIT 1)
WHERE user_id IN (
    SELECT id FROM public.users WHERE name ILIKE '%Ramazan%'
);

-- Reassign related incomes, expenses, sales that might belong to him
UPDATE public.expenses SET user_id = (SELECT id FROM public.users WHERE name NOT ILIKE '%Ramazan%' ORDER BY id ASC LIMIT 1) WHERE user_id IN (SELECT id FROM public.users WHERE name ILIKE '%Ramazan%');
UPDATE public.incomes SET user_id = (SELECT id FROM public.users WHERE name NOT ILIKE '%Ramazan%' ORDER BY id ASC LIMIT 1) WHERE user_id IN (SELECT id FROM public.users WHERE name ILIKE '%Ramazan%');
UPDATE public.sales SET seller_id = (SELECT id FROM public.users WHERE name NOT ILIKE '%Ramazan%' ORDER BY id ASC LIMIT 1) WHERE seller_id IN (SELECT id FROM public.users WHERE name ILIKE '%Ramazan%');
