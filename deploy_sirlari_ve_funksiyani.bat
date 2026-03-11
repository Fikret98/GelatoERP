@echo off
echo.
echo Supabase sirləri yenilənir (VAPID Keys)...
call npx supabase secrets set VAPID_PUBLIC_KEY="BFsCmKN5EyRWAs6XPIxmMwEH3BOYAjECqRn2LZgPYJMqigPUmjxeO2UTNkBUDQ9anOrvqjEFMU78E6ZvnTi9NlE"
call npx supabase secrets set VAPID_PRIVATE_KEY="IduX3jUkWRhz2ADp2FHwK7iDWqiAbTjSL0sInHapvg"
echo.
echo Funksiya Supabase-e gonderilir...
call npx supabase functions deploy send-push
echo.
echo =======================================================
echo HƏR ŞEY HAZIRDIR! 
echo Səhifəni (Vercel) yeniləyib (Ctrl+F5) testi yoxlayın.
echo =======================================================
pause
