-- Bazadakı eyni adlı funksiyaların hamısını görmək üçün bu kodu işlədin:

SELECT 
    p.proname as function_name,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    p.oid
FROM 
    pg_catalog.pg_proc p
LEFT JOIN 
    pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE 
    n.nspname = 'public' 
    AND p.proname IN ('send_push_notification', 'resolve_shift_discrepancy', 'resolve_shift_discrepancy_v2', 'resolve_shift_discrepancy_v3');
