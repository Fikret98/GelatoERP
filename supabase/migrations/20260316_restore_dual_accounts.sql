-- Restore Dual Account (Cash & Bank) Separation
-- This script reverses the unification and restores separate tracking for Nağd and Bank accounts.

-- 1. Restore/Update get_current_cash_balance (Only 'cash')
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sales numeric;
    v_incomes numeric;
    v_expenses numeric;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales FROM public.sales WHERE payment_method = 'cash';
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes FROM public.incomes WHERE payment_method = 'cash';
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.expenses WHERE payment_method = 'cash';
    
    RETURN v_sales + v_incomes - v_expenses;
END;
$$;

-- 2. Restore/Update get_current_bank_balance (Only 'card'/'bank')
CREATE OR REPLACE FUNCTION public.get_current_bank_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sales numeric;
    v_incomes numeric;
    v_expenses numeric;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales FROM public.sales WHERE payment_method = 'card';
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes FROM public.incomes WHERE payment_method IN ('card', 'bank');
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.expenses WHERE payment_method IN ('card', 'bank');
    
    RETURN v_sales + v_incomes - v_expenses;
END;
$$;

-- 3. Update get_advanced_analytics to return both balances
CREATE OR REPLACE FUNCTION public.get_advanced_analytics(p_start_date timestamptz, p_end_date timestamptz)
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
    v_total_supplier_debt numeric;
    v_total_fixed_assets numeric;
    v_sales_data json;
    v_expenses_by_cat json;
    v_top_products json;
    v_revenue_by_cat json;
    v_abc_revenue json;
    v_abc_profit json;
    v_total_kassa numeric;
    v_total_bank numeric;
BEGIN
    -- Generic totals for the period
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*) 
    INTO v_revenue, v_transactions 
    FROM public.sales WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_expenses 
    FROM public.expenses WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_incomes 
    FROM public.incomes WHERE date >= p_start_date AND date <= p_end_date;

    -- All-time balances
    v_total_kassa := public.get_current_cash_balance();
    v_total_bank := public.get_current_bank_balance();

    -- Supplier/Assets
    SELECT COALESCE(SUM(current_debt), 0) INTO v_total_supplier_debt FROM public.supplier_debts_view;
    SELECT COALESCE(SUM(cost), 0) INTO v_total_fixed_assets FROM public.fixed_assets WHERE status != 'disposed';

    -- COGS & Profit
    SELECT COALESCE(SUM(si.quantity * COALESCE(pcv.calculated_cost_price, 0)), 0)
    INTO v_cogs
    FROM public.sale_items si
    LEFT JOIN public.product_costs_view pcv ON si.product_id = pcv.product_id
    JOIN public.sales s ON si.sale_id = s.id
    WHERE s.date >= p_start_date AND s.date <= p_end_date;

    v_net_profit := v_revenue - v_cogs - v_expenses;

    -- Inventory
    SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost, 0)), 0) INTO v_inventory_value FROM public.inventory;
    SELECT COUNT(*) INTO v_low_stock FROM public.inventory WHERE stock_quantity <= COALESCE(critical_limit, 0);

    -- Charts
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_sales_data FROM (
        SELECT date::date as date, SUM(total_amount) as amount FROM public.sales
        WHERE date >= p_start_date AND date <= p_end_date GROUP BY date::date ORDER BY date::date
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_expenses_by_cat FROM (
        SELECT category as name, SUM(amount) as amount FROM public.expenses
        WHERE date >= p_start_date AND date <= p_end_date GROUP BY category
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_revenue_by_cat FROM (
        SELECT p.category as name, SUM(si.quantity * si.price) as amount
        FROM public.sale_items si JOIN public.products p ON si.product_id = p.id JOIN public.sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date GROUP BY p.category
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_top_products FROM (
        SELECT p.name, SUM(si.quantity) as amount
        FROM public.sale_items si JOIN public.products p ON si.product_id = p.id JOIN public.sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date GROUP BY p.name ORDER BY amount DESC LIMIT 5
    ) t;

    -- Build JSON output
    RETURN json_build_object(
        'stats', json_build_object(
            'revenue', v_revenue,
            'expenses', v_expenses,
            'incomes', v_incomes,
            'cogs', v_cogs,
            'netProfit', v_net_profit,
            'kassa', v_total_kassa,
            'bank_balance', v_total_bank,
            'transactions', v_transactions,
            'inventoryValue', v_inventory_value,
            'lowStock', v_low_stock,
            'totalSupplierDebt', v_total_supplier_debt,
            'totalFixedAssets', v_total_fixed_assets
        ),
        'charts', json_build_object(
            'salesData', v_sales_data,
            'expensesByCategory', v_expenses_by_cat,
            'topProducts', v_top_products,
            'revenueByCategory', v_revenue_by_cat
        )
    );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION get_current_cash_balance() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_current_bank_balance() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_advanced_analytics(timestamptz, timestamptz) TO authenticated, anon;
