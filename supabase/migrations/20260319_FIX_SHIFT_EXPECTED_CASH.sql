-- 20260319_FIX_SHIFT_EXPECTED_CASH.sql
-- Bug 6 Fix: get_shift_expected_cash was including the auto-generated
-- discrepancy expense/income (created by closeShift) in its own calculation.
-- This caused the expected value to shrink by the discrepancy amount,
-- making the shortage appear to "disappear" if the function was called again.
-- Fix: explicitly exclude all discrepancy-category records from this shift.

CREATE OR REPLACE FUNCTION public.get_shift_expected_cash(p_shift_id UUID)
RETURNS DECIMAL(12, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening DECIMAL(12, 2);
    v_sales   DECIMAL(12, 2);
    v_incomes DECIMAL(12, 2);
    v_expenses DECIMAL(12, 2);
BEGIN
    -- Opening balance
    SELECT opening_balance INTO v_opening FROM public.shifts WHERE id = p_shift_id;

    -- Cash Sales in this shift
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales
    FROM public.sales
    WHERE shift_id = p_shift_id AND payment_method = 'cash';

    -- Cash Incomes in this shift
    -- Exclude all discrepancy-generated adjustments (Kassa Artığı variants)
    SELECT COALESCE(SUM(amount), 0) INTO v_incomes
    FROM public.incomes
    WHERE shift_id = p_shift_id
      AND payment_method = 'cash'
      AND category NOT IN (
          'Kassa Artığı',
          'Kassa Artığı (Həll edildi)',
          'Kassa Artığı (Özününküləşdirilmədi)'
      );

    -- Cash Expenses in this shift
    -- Exclude all discrepancy-generated adjustments (Kassa Kəsiri variants)
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM public.expenses
    WHERE shift_id = p_shift_id
      AND payment_method = 'cash'
      AND category NOT IN (
          'Kassa Kəsiri',
          'Kassa Kəsiri (Həll edildi)',
          'Kassa Kəsiri (Ləğv edildi)'
      );

    RETURN ROUND((v_opening + v_sales + v_incomes - v_expenses), 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shift_expected_cash(UUID) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
