-- Veritabanı strukturunu tam görmək üçün aşağıdakı kodu Supabase-də işlədin və nəticəni mənə göndərin.

SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns 
WHERE 
    table_schema = 'public' 
    AND table_name IN (
        'shift_discrepancies', 
        'users', 
        'shifts', 
        'expenses', 
        'incomes', 
        'employee_debts'
    )
ORDER BY 
    table_name, ordinal_position;
