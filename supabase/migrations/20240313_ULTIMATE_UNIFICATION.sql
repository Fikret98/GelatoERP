-- ULTIMATE SYSTEM UNIFICATION: NO SHIFTS, ONE KASSA
-- This script simplifies the entire financial architecture.

-- 1. Unify Cash Balance Function (Sum ALL transactions)
CREATE OR REPLACE FUNCTION get_current_cash_balance()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (
        COALESCE((SELECT SUM(total_amount) FROM sales), 0) +
        COALESCE((SELECT SUM(amount) FROM incomes), 0) -
        COALESCE((SELECT SUM(amount) FROM expenses), 0)
    );
$$;

-- 2. Drop the redundant bank balance function
DROP FUNCTION IF EXISTS get_current_bank_balance();

-- 3. Update Advanced Analytics to show only ONE kassa
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
    v_total_supplier_debt numeric;
    v_total_fixed_assets numeric;
    v_sales_data json;
    v_expenses_by_cat json;
    v_top_products json;
    v_revenue_by_cat json;
    v_abc_revenue json;
    v_abc_profit json;
    v_total_kassa numeric;
BEGIN
    -- Generic totals for the period
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*) 
    INTO v_revenue, v_transactions 
    FROM sales WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_expenses 
    FROM expenses WHERE date >= p_start_date AND date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_incomes 
    FROM incomes WHERE date >= p_start_date AND date <= p_end_date;

    -- Unified all-time cash balance
    v_total_kassa := get_current_cash_balance();

    -- Supplier/Assets
    SELECT COALESCE(SUM(current_debt), 0) INTO v_total_supplier_debt FROM supplier_debts_view;
    SELECT COALESCE(SUM(cost), 0) INTO v_total_fixed_assets FROM fixed_assets WHERE status != 'disposed';

    -- COGS & Profit
    SELECT COALESCE(SUM(si.quantity * COALESCE(pcv.calculated_cost_price, 0)), 0)
    INTO v_cogs
    FROM sale_items si
    LEFT JOIN product_costs_view pcv ON si.product_id = pcv.product_id
    JOIN sales s ON si.sale_id = s.id
    WHERE s.date >= p_start_date AND s.date <= p_end_date;

    v_net_profit := v_revenue - v_cogs - v_expenses;

    -- Inventory
    SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost, 0)), 0) INTO v_inventory_value FROM inventory;
    SELECT COUNT(*) INTO v_low_stock FROM inventory WHERE stock_quantity <= COALESCE(critical_limit, 0);

    -- Charts (Same as before)
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_sales_data FROM (
        SELECT date::date as date, SUM(total_amount) as amount FROM sales
        WHERE date >= p_start_date AND date <= p_end_date GROUP BY date::date ORDER BY date::date
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_expenses_by_cat FROM (
        SELECT category as name, SUM(amount) as value FROM expenses
        WHERE date >= p_start_date AND date <= p_end_date GROUP BY category
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_revenue_by_cat FROM (
        SELECT p.category as name, SUM(si.quantity * si.price) as value
        FROM sale_items si JOIN products p ON si.product_id = p.id JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date GROUP BY p.category
    ) t;

    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_top_products FROM (
        SELECT p.name, SUM(si.quantity) as value
        FROM sale_items si JOIN products p ON si.product_id = p.id JOIN sales s ON si.sale_id = s.id
        WHERE s.date >= p_start_date AND s.date <= p_end_date GROUP BY p.name ORDER BY value DESC LIMIT 5
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
            'bank_balance', 0, -- Set to 0 to avoid frontend breaking
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

-- 4. Clean up all shift-related triggers and functions
DROP TRIGGER IF EXISTS tr_log_purchase_expense ON public.inventory_purchases;
DROP TRIGGER IF EXISTS tr_log_supplier_payment_expense ON public.supplier_payments;
DROP FUNCTION IF EXISTS log_inventory_purchase_as_expense();
DROP FUNCTION IF EXISTS log_supplier_payment_as_expense();
DROP FUNCTION IF EXISTS get_user_active_shift(uuid);

-- 6. Remove redundant shift tables and columns
ALTER TABLE IF EXISTS public.sales DROP COLUMN IF EXISTS shift_id;
ALTER TABLE IF EXISTS public.expenses DROP COLUMN IF EXISTS shift_id;
ALTER TABLE IF EXISTS public.incomes DROP COLUMN IF EXISTS shift_id;
DROP TABLE IF EXISTS public.shifts CASCADE;

-- 5. Final simple triggers (No shift linkage)
CREATE OR REPLACE FUNCTION log_inventory_purchase_as_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.amount_paid > 0 THEN
        INSERT INTO public.expenses (category, amount, description, date, user_id, supplier_id, payment_method)
        VALUES ('Alış', NEW.amount_paid, 'Mal alışı: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id), now(), NEW.created_by, NEW.supplier_id, 'cash');
    END IF; RETURN NEW;
END; $$;

CREATE TRIGGER tr_log_purchase_expense AFTER INSERT ON public.inventory_purchases FOR EACH ROW EXECUTE FUNCTION log_inventory_purchase_as_expense();

-- Permissions
GRANT EXECUTE ON FUNCTION get_current_cash_balance() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_advanced_analytics(timestamptz, timestamptz) TO authenticated, anon;
