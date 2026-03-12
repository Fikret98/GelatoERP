@echo off
echo Running Secret Setup...
call node set_secrets.cjs
echo Deploying Edge Function...
call npx -y supabase functions deploy send-push --project-ref canoruljgackpmziotel --no-verify-jwt
echo =======================================================
echo DONE!
echo Please Refresh Browser (Ctrl+F5)
echo Re-subscribe in settings
echo =======================================================
pause
