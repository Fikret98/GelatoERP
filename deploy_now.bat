@echo off
echo Running Robust Secret Setup...
call node set_secrets.cjs
echo Deploying Edge Function...
call npx -y supabase functions deploy send-push --project-ref canoruljgackpmziotel --no-verify-jwt
echo DONE!
pause
