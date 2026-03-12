@echo off
echo Updating Supabase Secrets...
call npx -y supabase secrets set --project-ref canoruljgackpmziotel VAPID_PUBLIC_KEY="BFsCmKN5EyRWAs6XPIxmMwEH3BOYAjECqRn2LZgPYJMqigPUmjxeO2UTNkBUDQ9anOrvqjEFMU78E6ZvnTi9NlE" VAPID_PRIVATE_KEY="IduX3jUkWRhz2ADp2FHwK7iDWqiAbTjSL0sInHapvg"
echo Deploying Edge Function...
call npx -y supabase functions deploy send-push --project-ref canoruljgackpmziotel --no-verify-jwt
echo DONE!
pause
