-- Push Bildirişlərinin Düzəldilməsi (Fix)

-- 1. HTTP sorğular üçün 'pg_net' extension-ı aktivləşdiririk
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. SUPABASE URL və SERVICE ROLE KEY-i SQL daxilində istifadə etmək üçün 'secrets' cədvəli yaradırıq
CREATE TABLE IF NOT EXISTS public.secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- DİQQƏT: SERVICE_ROLE_KEY artıq daxil edilib.
INSERT INTO public.secrets (name, value) VALUES 
('SUPABASE_URL', 'https://canoruljgackpmziotel.supabase.co'),
('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbm9ydWxqZ2Fja3BtemlvdGVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY5MTY3MCwiZXhwIjoyMDg4MjY3NjcwfQ.Phd1TGghzHmlhEU5Th9a25Lu0PEWfe0DIp6-LKRAZw0')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;

-- 3. Bildiriş funksiyasını təkmilləşdiririk (Xətaları tutmaq üçün)
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id BIGINT,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/',
    p_image TEXT DEFAULT NULL,
    p_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
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
                'user_id', p_user_id::text,
                'title', p_title,
                'body', p_body,
                'url', p_url,
                'image', p_image,
                'actions', p_actions
            )
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Push Notification Error: %', SQLERRM;
END;
$$;
