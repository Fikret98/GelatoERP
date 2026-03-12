@echo off
echo Running Supabase deployment...
npx -y supabase secrets set --project-ref canoruljgackpmziotel VAPID_PUBLIC_KEY="BFsCmKN5EyRWAs6XPIxmMwEH3BOYAjECqRn2LZgPYJMqigPUmjxeO2UTNkBUDQ9anOrvqjEFMU78E6ZvnTi9NlE" VAPID_PRIVATE_KEY="IduX3jUkWRhz2ADp2FHwK7iDWqiAbTjSL0sInHapvg"
if %ERRORLEVEL% NEQ 0 (
    echo Error setting secrets
    exit /b %ERRORLEVEL%
)
npx -y supabase functions deploy send-push --project-ref canoruljgackpmziotel
if %ERRORLEVEL% NEQ 0 (
    echo Error deploying function
    exit /b %ERRORLEVEL%
)
echo Success!
