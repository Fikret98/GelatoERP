@echo off
echo Running Robust Secret Setup...
call node set_secrets.cjs
echo Deploying Edge Function...
call npx -y supabase functions deploy send-push --project-ref canoruljgackpmziotel --no-verify-jwt
echo =======================================================
echo HƏMİŞƏKİ KİMİ SON ADDIM:
echo 1. Brauzerdə səhifəni yeniləyin (Ctrl+F5)
echo 2. "Deaktiv et" düyməsini sıxın (köhnə abunəliyi silmək üçün)
echo 3. Yenidən "Aktiv et" düyməsini sıxın (yeni açarla abunə olmaq üçün)
echo 4. "Test Bildirişi Göndər" düyməsini yoxlayın.
echo =======================================================
echo DONE!
pause
