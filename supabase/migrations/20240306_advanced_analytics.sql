-- Drop existing function if needed
DROP FUNCTION IF EXISTS get_advanced_analytics(timestamptz);

CREATE OR REPLACE FUNCTION get_advanced_analytics(p_date_filter timestamptz)
RETURNS json AS $$
DECLARE
    v_revenue numeric;
    v_expenses numeric;
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

    SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost, 0)), 0) 
    INTO v_inventory_value 
    FROM inventory;

    SELECT COUNT(*) 
    INTO v_low_stock 
    FROM inventory 
    WHERE stock_quantity <= COALESCE(critical_limit, 0);

    -- 2. Sales Trend (Chart Data)
    SELECT json_agg(t) INTO v_sales_data FROM (
        SELECT date::date as date, SUM(total_amount) as amount
        FROM sales
        WHERE date >= p_date_filter
        GROUP BY date::date
        ORDER BY date::date
    ) t;

    -- 3. Expenses by Category
    SELECT json_agg(t) INTO v_expenses_by_cat FROM (
        SELECT category as name, SUM(amount) as value
        FROM expenses
        WHERE date >= p_date_filter
        GROUP BY category
    ) t;

    -- 4. Revenue by Category
    SELECT json_agg(t) INTO v_revenue_by_cat FROM (
        SELECT p.category as name, SUM(si.quantity * si.price) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.created_at >= p_date_filter
        GROUP BY p.category
    ) t;

    -- 5. Top Products
    SELECT json_agg(t) INTO v_top_products FROM (
        SELECT p.name, SUM(si.quantity) as value
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.created_at >= p_date_filter
        GROUP BY p.name
        ORDER BY value DESC
        LIMIT 5
    ) t;

    -- 6. ABC Analysis
    WITH product_revenue AS (
        SELECT p.name, SUM(si.quantity * si.price) as revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.created_at >= p_date_filter
        GROUP BY p.name
    ),
    total_rev AS (
        SELECT SUM(revenue) as total FROM product_revenue
    ),
    abc_calc AS (
        SELECT 
            name, 
            revenue,
            (revenue / NULLIF((SELECT total FROM total_rev), 0)) * 100 as contribution,
            SUM(revenue) OVER (ORDER BY revenue DESC) / NULLIF((SELECT total FROM total_rev), 0) as cumulative_share
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
            'profit', v_revenue - v_expenses,
            'transactions', v_transactions,
            'inventoryValue', v_inventory_value,
            'lowStock', v_low_stock
        ),
        'charts', json_build_object(
            'salesData', COALESCE(v_sales_data, '[]'::json),
            'expensesByCategory', COALESCE(v_expenses_by_cat, '[]'::json),
            'topProducts', COALESCE(v_top_products, '[]'::json),
            'revenueByCategory', COALESCE(v_revenue_by_cat, '[]'::json),
            'abcAnalysis', v_abc_analysis
        )
    );
END;
$$ LANGUAGE plpgsql;
