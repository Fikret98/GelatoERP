-- PROFESSIONAL IN-APP NOTIFICATIONS
-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT CHECK (type IN ('info', 'warning', 'success', 'error')) DEFAULT 'info',
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable row level security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid()::text = (SELECT username FROM public.users WHERE id = user_id));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid()::text = (SELECT username FROM public.users WHERE id = user_id));

-- Qeyd: Yuxarıdakı siyasətlərdə auth.uid() ilə username-i müqayisə edirik. 
-- Çünki mövcud sistemdə auth.uid() çox vaxt username-ə bərabərdir (və ya ona bağlıdır).

-- 4. Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 5. Update send_push_notification to sync with the table
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/dashboard'
)
RETURNS VOID AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
    v_type TEXT;
BEGIN
    -- Determine type based on title or body keywords
    IF p_title ~* 'kəsir|artıq|problem|xəta|critical|azalan' THEN
        v_type := 'warning';
    ELSIF p_title ~* 'təbrik|uğur|həll|success' THEN
        v_type := 'success';
    ELSE
        v_type := 'info';
    END IF;

    -- A) Insert into in-app notifications table
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (p_user_id, p_title, p_body, v_type, p_url);

    -- B) Send Push Notification (via Edge Function)
    SELECT value INTO v_url FROM public.secrets WHERE name = 'SUPABASE_URL';
    SELECT value INTO v_key FROM public.secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';

    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_url || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_key
            ),
            body := jsonb_build_object(
                'user_id', p_user_id,
                'title', p_title,
                'body', p_body,
                'url', p_url
            )
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Prevent transaction rollback on notification failures
    RAISE NOTICE 'Notification error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
