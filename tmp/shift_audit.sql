-- HEALT CHECK: Shift & Transaction Logical Consistency Audit
-- This script helps identify where the kassa "leaks" or where shift transitions break logic.

WITH shift_stats AS (
    SELECT 
        s.id,
        s.opened_at,
        s.closed_at,
        u.name as seller,
        s.opening_balance as opening,
        s.actual_cash_balance as closing_reported,
        s.expected_cash_balance as closing_expected,
        -- Calculate what SHOULD be there based on transactions linked to this shift
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE shift_id = s.id AND payment_method = 'cash'), 0) as period_sales,
        COALESCE((SELECT SUM(amount) FROM incomes WHERE shift_id = s.id AND payment_method = 'cash'), 0) as period_incomes,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE shift_id = s.id AND payment_method = 'cash'), 0) as period_expenses
    FROM shifts s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.opened_at DESC
),
audit_calc AS (
    SELECT 
        *,
        (opening + period_sales + period_incomes - period_expenses) as calculated_closing,
        ((opening + period_sales + period_incomes - period_expenses) - closing_reported) as closing_gap
    FROM shift_stats
)
SELECT 
    seller,
    opened_at::timestamp(0),
    opening,
    period_sales as sales,
    period_incomes as incomes,
    period_expenses as expenses,
    closing_reported as reported,
    calculated_closing as expected,
    CASE 
        WHEN ABS(calculated_closing - closing_reported) > 0.01 THEN 'XƏTA: Kapama uyğunsuzluğu (' || (closing_reported - calculated_closing)::text || ')'
        ELSE 'OK'
    END as status
FROM audit_calc;

-- Check 2: Shift Transitions (Does Opening N+1 match Closing N?)
WITH transition_check AS (
    SELECT 
        s.id,
        s.opened_at,
        s.opening_balance,
        LAG(s.actual_cash_balance) OVER (ORDER BY s.opened_at) as prev_closing,
        LAG(u.name) OVER (ORDER BY s.opened_at) as prev_seller,
        u.name as current_seller
    FROM shifts s 
    JOIN users u ON s.user_id = u.id
)
SELECT 
    prev_seller || ' -> ' || current_seller as handover,
    opened_at::timestamp(0) as handover_time,
    prev_closing as reported_by_prev,
    opening_balance as started_by_next,
    (opening_balance - prev_closing) as handover_gap,
    CASE 
        WHEN ABS(opening_balance - prev_closing) > 0.01 THEN 'XƏTA: Təhvil-təslim boşluğu'
        ELSE 'OK'
    END as handover_status
FROM transition_check
WHERE prev_closing IS NOT NULL
ORDER BY opened_at DESC;
