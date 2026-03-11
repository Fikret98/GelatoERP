-- Manual fix for existing 'Alış' (Purchase) expenses
-- This will try to link them back to the user who created the corresponding inventory purchase.
-- Fixed version: Does NOT rely on ip.created_at which seems to be missing.

UPDATE public.expenses e
SET user_id = ip.created_by
FROM public.inventory_purchases ip
WHERE e.category = 'Alış'
  AND e.user_id IS NULL
  AND e.amount = (ip.quantity * ip.unit_price)
  -- Since we can't match timestamps exactly, this is a best-effort match.
  -- It's reasonably safe since the product of quantity and unit_price is usually unique enough for distinct purchases.
;
