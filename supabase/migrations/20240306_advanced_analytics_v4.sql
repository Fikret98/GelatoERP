-- Drop existing function to ensure fresh start
DROP FUNCTION IF EXISTS get_advanced_analytics(timestamptz);

CREATE OR REPLACE FUNCTION get_advanced_analytics(p_date_filter timestamptz)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_revenue numeric;
    v_expenses numeric;
    v_cogs numeric;
    v_net_profit numeric;
    v_transactions bigint;
    v_inventory_value numeric;
    v_low_stock bigint;
    v_sales_data json;
    v_expenses_by_cat json;
    v_top_products json;
    v_revenue_by_cat json;
    v_abc_analysis json;
BEGIN
    -- 1. Simple Aggregates (KPIs)
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*) 
    INTO v_revenue, v_transactions 
    FROM sales 
    WHERE date >= p_date_filter;

    SELECT COALESCE(SUM(amount), 0) 
    INTO v_expenses 
    FROM expenses 
    WHERE date >= p_date_filter;

    -- Calculate COGS (Satılan Malların Maya Dəyəri)
    SELECT COALESCE(SUM(si.quantity * COALESCE(p.unit_cost, 0)), 0)
    INTO v_cogs
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.date >= p_date_filter;

    v_net_profit := v_revenue - v_cogs - v_expenses;

    SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost, 0)), 0) 
    INTO v_inventory_value 
    FROM inventory;

    SELECT COUNT(*) 
    INTO v_low_stock 
    FROM inventory 
    WHERE stock_quantity <= COALESCE(critical_limit, 0);

    -- 2. Sales Trend (Chart Data)
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_sales_data FROM (
        SELECT date::date as date, SUM(total_amount) as amount
        FROM sales
        WHERE date >= p_date_filter
        GROUP BY date::date
        ORDER BY date::date
    ) t;

    -- 3. Expenses by Category
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_expenses_by_cat FROM (
        SELECT category as name, SUM(amount) as value
        FROM expenses
        WHERE date >= p_date_filter
        GROUP BY category
    ) t;

    -- 4. Revenue by Category
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_revenue_by_cat FROM (
        SELECT p.category as name, SUM(si.quantity * si.price) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_date_filter
        GROUP BY p.category
    ) t;

    -- 5. Top Products
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_top_products FROM (
        SELECT p.name, SUM(si.quantity) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_date_filter
        GROUP BY p.name
        ORDER BY value DESC
        LIMIT 5
    ) t;

    -- 6. ABC Analysis
    WITH product_revenue AS (
        SELECT p.name, SUM(si.quantity * si.price) as revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_date_filter
        GROUP BY p.name
    ),
    total_rev AS (
        SELECT SUM(revenue) as total FROM product_revenue
    ),
    abc_calc AS (
        SELECT 
            name, 
            revenue,
            CASE 
                WHEN (SELECT total FROM total_rev) > 0 
                THEN (revenue / (SELECT total FROM total_rev)) * 100 
                ELSE 0 
            END as contribution,
            CASE 
                WHEN (SELECT total FROM total_rev) > 0 
                THEN SUM(revenue) OVER (ORDER BY revenue DESC) / (SELECT total FROM total_rev) 
                ELSE 0 
            END as cumulative_share
        FROM product_revenue
    )
    SELECT json_build_object(
        'A', COALESCE((SELECT json_agg(json_build_object('name', name, 'revenue', revenue, 'contribution', contribution)) FROM abc_calc WHERE cumulative_share <= 0.70), '[]'::json),
        'B', COALESCE((SELECT json_agg(json_build_object('name', name, 'revenue', revenue, 'contribution', contribution)) FROM abc_calc WHERE cumulative_share > 0.70 AND cumulative_share <= 0.90), '[]'::json),
        'C', COALESCE((SELECT json_agg(json_build_object('name', name, 'revenue', revenue, 'contribution', contribution)) FROM abc_calc WHERE cumulative_share > 0.90), '[]'::json)
    ) INTO v_abc_analysis;

    RETURN json_build_object(
        'stats', json_build_object(
            'revenue', v_revenue,
            'expenses', v_expenses,
            'cogs', v_cogs,
            'netProfit', v_net_profit,
            'kassa', v_revenue - v_expenses,
            'transactions', v_transactions,
            'inventoryValue', v_inventory_value,
            'lowStock', v_low_stock
        ),
        'charts', json_build_object(
            'salesData', v_sales_data,
            'expensesByCategory', v_expenses_by_cat,
            'topProducts', v_top_products,
            'revenueByCategory', v_revenue_by_cat,
            'abcAnalysis', v_abc_analysis
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_advanced_analytics(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_advanced_analytics(timestamptz) TO anon;
