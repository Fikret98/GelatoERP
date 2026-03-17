-- 1. Add shift_id to missing transaction tables
ALTER TABLE public.inventory_purchases ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id);
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id);

-- 2. Update log_inventory_purchase_as_expense to propagate shift_id
CREATE OR REPLACE FUNCTION public.log_inventory_purchase_as_expense()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.expenses (
        amount,
        category,
        description,
        date,
        user_id,
        payment_method,
        shift_id
    )
    VALUES (
        NEW.amount_paid,
        'Anbar Alışı',
        'Avtomatik qeydiyyat: ' || (SELECT name FROM public.inventory WHERE id = NEW.inventory_id),
        NEW.purchase_date,
        NEW.created_by,
        NEW.payment_method,
        NEW.shift_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update log_supplier_payment_as_expense to propagate shift_id
CREATE OR REPLACE FUNCTION public.log_supplier_payment_as_expense()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.expenses (
        amount,
        category,
        description,
        date,
        user_id,
        payment_method,
        shift_id
    )
    VALUES (
        NEW.amount,
        'Təchizatçı Ödənişi',
        COALESCE(NEW.description, 'Təchizatçıya ödəniş'),
        NEW.payment_date,
        NEW.created_by,
        NEW.payment_method,
        NEW.shift_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant permissions
GRANT ALL ON public.inventory_purchases TO authenticated, anon;
GRANT ALL ON public.supplier_payments TO authenticated, anon;
