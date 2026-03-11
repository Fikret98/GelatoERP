-- Update advanced analytics to support full date range (start/end)
CREATE OR REPLACE FUNCTION get_advanced_analytics(p_start_date timestamptz, p_end_date timestamptz)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_revenue numeric;
    v_expenses numeric;
    v_incomes numeric;
    v_cogs numeric;
    v_net_profit numeric;
    v_transactions bigint;
    v_inventory_value numeric;
    v_low_stock bigint;
    v_sales_data json;
    v_expenses_by_cat json;
    v_top_products json;
    v_revenue_by_cat json;
    v_abc_revenue json;
    v_abc_profit json;
    v_total_kassa numeric;
BEGIN
    -- 1. Simple Aggregates (KPIs)
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*) 
    INTO v_revenue, v_transactions 
    FROM sales 
    WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) 
    INTO v_expenses 
    FROM expenses 
    WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) 
    INTO v_incomes 
    FROM incomes 
    WHERE date >= p_start_date AND date <= p_end_date;

    -- Get all-time cash balance (Kassa is current state, not historical range)
    v_total_kassa := get_current_cash_balance();

    -- Calculate COGS
    SELECT COALESCE(SUM(si.quantity * COALESCE(pcv.calculated_cost_price, 0)), 0)
    INTO v_cogs
    FROM sale_items si
    LEFT JOIN product_costs_view pcv ON si.product_id = pcv.product_id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.date >= p_start_date AND s.date <= p_end_date;

    -- Net profit traditionally relates to the selected period performance
    v_net_profit := v_revenue - v_cogs - v_expenses;

    -- Inventory Value (Current state)
    SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost, 0)), 0) 
    INTO v_inventory_value 
    FROM inventory;

    SELECT COUNT(*) 
    INTO v_low_stock 
    FROM inventory 
    WHERE stock_quantity <= COALESCE(critical_limit, 0);

    -- 2. Sales Trend
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_sales_data FROM (
        SELECT date::date as date, SUM(total_amount) as amount
        FROM sales
        WHERE date >= p_start_date AND date <= p_end_date
        GROUP BY date::date
        ORDER BY date::date
    ) t;

    -- 3. Expenses by Category
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_expenses_by_cat FROM (
        SELECT category as name, SUM(amount) as value
        FROM expenses
        WHERE date >= p_start_date AND date <= p_end_date
        GROUP BY category
    ) t;

    -- 4. Revenue by Category
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_revenue_by_cat FROM (
        SELECT p.category as name, SUM(si.quantity * si.price) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date
        GROUP BY p.category
    ) t;

    -- 5. Top Products
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_top_products FROM (
        SELECT p.name, SUM(si.quantity) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date
        GROUP BY p.name
        ORDER BY value DESC
        LIMIT 5
    ) t;

    -- 6. ABC Analysis
    WITH product_metrics AS (
        SELECT 
            p.name, 
            SUM(si.quantity * si.price) as revenue,
            SUM(si.quantity * (si.price - COALESCE(pcv.calculated_cost_price, 0))) as profit
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN product_costs_view pcv ON p.id = pcv.product_id
        WHERE s.date >= p_start_date AND s.date <= p_end_date
        GROUP BY p.name
    ),
    total_metrics AS (
        SELECT SUM(revenue) as total_rev, SUM(profit) as total_prof FROM product_metrics
    ),
    abc_rev_calc AS (
        SELECT 
            name, 
            revenue,
            CASE WHEN (SELECT total_rev FROM total_metrics) > 0 THEN (revenue / (SELECT total_rev FROM total_metrics)) * 100 ELSE 0 END as contribution,
            CASE WHEN (SELECT total_rev FROM total_metrics) > 0 THEN SUM(revenue) OVER (ORDER BY revenue DESC) / (SELECT total_rev FROM total_metrics) ELSE 0 END as cumulative_share
        FROM product_metrics
    ),
    abc_prof_calc AS (
        SELECT 
            name, 
            profit,
            CASE WHEN (SELECT total_prof FROM total_metrics) > 0 THEN (profit / (SELECT total_prof FROM total_metrics)) * 100 ELSE 0 END as contribution,
            CASE WHEN (SELECT total_prof FROM total_metrics) > 0 THEN SUM(profit) OVER (ORDER BY profit DESC) / (SELECT total_prof FROM total_metrics) ELSE 0 END as cumulative_share
        FROM product_metrics
    )
    SELECT 
        json_build_object(
            'A', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', revenue, 'contribution', contribution)) FROM abc_rev_calc WHERE cumulative_share <= 0.70), '[]'::json),
            'B', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', revenue, 'contribution', contribution)) FROM abc_rev_calc WHERE cumulative_share > 0.70 AND cumulative_share <= 0.90), '[]'::json),
            'C', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', revenue, 'contribution', contribution)) FROM abc_rev_calc WHERE cumulative_share > 0.90), '[]'::json)
        ),
        json_build_object(
            'A', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', profit, 'contribution', contribution)) FROM abc_prof_calc WHERE cumulative_share <= 0.70), '[]'::json),
            'B', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', profit, 'contribution', contribution)) FROM abc_prof_calc WHERE cumulative_share > 0.70 AND cumulative_share <= 0.90), '[]'::json),
            'C', COALESCE((SELECT json_agg(json_build_object('name', name, 'value', profit, 'contribution', contribution)) FROM abc_prof_calc WHERE cumulative_share > 0.90), '[]'::json)
        )
    INTO v_abc_revenue, v_abc_profit;

    RETURN json_build_object(
        'stats', json_build_object(
            'revenue', v_revenue,
            'expenses', v_expenses,
            'incomes', v_incomes,
            'cogs', v_cogs,
            'netProfit', v_net_profit,
            'kassa', v_total_kassa,
            'transactions', v_transactions,
            'inventoryValue', v_inventory_value,
            'lowStock', v_low_stock
        ),
        'charts', json_build_object(
            'salesData', v_sales_data,
            'expensesByCategory', v_expenses_by_cat,
            'topProducts', v_top_products,
            'revenueByCategory', v_revenue_by_cat,
            'abcRevenue', v_abc_revenue,
            'abcProfit', v_abc_profit
        )
    );
END;
$$;
