-- Create shifts table
CREATE TABLE public.shifts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    opened_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    closed_at TIMESTAMPTZ,
    opening_balance NUMERIC NOT NULL DEFAULT 0,
    actual_cash_balance NUMERIC,
    expected_cash_balance NUMERIC,
    cash_sales NUMERIC DEFAULT 0,
    card_sales NUMERIC DEFAULT 0,
    total_incomes NUMERIC DEFAULT 0,
    total_expenses NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT
);

-- Enable RLS for shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read shifts" ON public.shifts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert shifts" ON public.shifts
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update their own shifts" ON public.shifts
    FOR UPDATE TO authenticated USING (true);

-- Add columns to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES public.shifts(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card'));

-- Add columns to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES public.shifts(id);

-- Add columns to incomes
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES public.shifts(id);

-- Update process_sale RPC to handle shift_id and payment_method
CREATE OR REPLACE FUNCTION process_sale(
    p_total_amount numeric, 
    p_items jsonb, 
    p_seller_id integer,
    p_payment_method text DEFAULT 'cash',
    p_shift_id bigint DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id integer;
    v_item jsonb;
    v_needed record;
BEGIN
    -- Stock validation
    FOR v_needed IN 
        WITH cart_items AS (
            SELECT 
                (elem->>'product_id')::integer as product_id,
                (elem->>'quantity')::numeric as sale_quantity
            FROM jsonb_array_elements(p_items) as elem
        ),
        required_materials AS (
            SELECT 
                r.inventory_id,
                i.name as material_name,
                SUM(r.quantity_needed * ci.sale_quantity) as total_required,
                i.stock_quantity as current_stock
            FROM cart_items ci
            JOIN recipes r ON ci.product_id = r.product_id
            JOIN inventory i ON r.inventory_id = i.id
            GROUP BY r.inventory_id, i.name, i.stock_quantity
        )
        SELECT * FROM required_materials WHERE total_required > current_stock
    LOOP
        RAISE EXCEPTION 'Anbar xətası: % çatışmır (Lazımdır: %, Mövcuddur: %)', 
            v_needed.material_name, v_needed.total_required, v_needed.current_stock;
    END LOOP;

    -- Record the sale
    INSERT INTO public.sales (total_amount, date, seller_id, payment_method, shift_id)
    VALUES (p_total_amount, now(), p_seller_id, p_payment_method, p_shift_id)
    RETURNING id INTO v_sale_id;

    -- Insert sale items and deduct inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.sale_items (sale_id, product_id, quantity, price)
        VALUES (v_sale_id, (v_item->>'product_id')::integer, (v_item->>'quantity')::numeric, (v_item->>'price')::numeric);

        UPDATE public.inventory i
        SET stock_quantity = i.stock_quantity - (r.quantity_needed * (v_item->>'quantity')::numeric)
        FROM public.recipes r
        WHERE r.product_id = (v_item->>'product_id')::integer AND r.inventory_id = i.id;
    END LOOP;

    RETURN v_sale_id;
END;
$$;

-- Function to get active shift
CREATE OR REPLACE FUNCTION get_active_shift(p_user_id uuid)
RETURNS SETOF public.shifts
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.shifts WHERE user_id = p_user_id AND status = 'open' LIMIT 1;
$$;

-- Grant permissions
GRANT ALL ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO anon;
GRANT ALL ON SEQUENCE public.shifts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.shifts_id_seq TO anon;
GRANT EXECUTE ON FUNCTION get_active_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_shift(uuid) TO anon;
