const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// VAPID açarlarını yaradan funksiya (xarici paketlərə ehtiyac olmadan)
function generateVAPIDKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();

  const toBase64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  // VAPID üçün uncompressed 65 byte public key və 32 byte private key lazımdır.
  const publicKey = toBase64url(ecdh.getPublicKey());
  const privateKey = toBase64url(ecdh.getPrivateKey());

  return { publicKey, privateKey };
}

console.log('Yeni açarlar yaradılır...');
const keys = generateVAPIDKeys();

// 1. Frontend-i avtomatik yeniləyək
const hookPath = path.join(__dirname, 'src', 'hooks', 'usePushNotifications.ts');
if (fs.existsSync(hookPath)) {
  let content = fs.readFileSync(hookPath, 'utf8');
  content = content.replace(/const VAPID_PUBLIC_KEY *= *'.*';/, `const VAPID_PUBLIC_KEY = '${keys.publicKey}';`);
  fs.writeFileSync(hookPath, content);
  console.log('✅ usePushNotifications.ts faylında Public açar yeniləndi.');
} else {
  console.error('❌ usePushNotifications.ts faylı tapılmadı!');
}

// 2. Supabase əmrlərini tək bir icra edilə bilən bat faylına yazaq
const batContent = `@echo off
echo.
echo Supabase sirləri yenilənir (VAPID Keys)...
call npx supabase secrets set VAPID_PUBLIC_KEY="${keys.publicKey}"
call npx supabase secrets set VAPID_PRIVATE_KEY="${keys.privateKey}"
echo.
echo Funksiya Supabase-e gonderilir...
call npx supabase functions deploy send-push
echo.
echo =======================================================
echo HƏR ŞEY HAZIRDIR! 
echo Səhifəni (Vercel) yeniləyib (Ctrl+F5) testi yoxlayın.
echo =======================================================
pause
`;

const batPath = path.join(__dirname, 'deploy_sirlari_ve_funksiyani.bat');
fs.writeFileSync(batPath, batContent);
console.log('✅ "deploy_sirlari_ve_funksiyani.bat" faylı yaradıldı.');
console.log('');
console.log('=======================================================');
console.log('SON ADDIM: Terminalda aşağıdakı komandanı işlədin:');
console.log('deploy_sirlari_ve_funksiyani.bat');
console.log('=======================================================');
