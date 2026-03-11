const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateVAPIDKeys() {
  const { publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' }
  });

  const rawPubKey = publicKey.slice(-65); 
  const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return base64url(rawPubKey);
}

const pubKey = generateVAPIDKeys();
const filePath = path.join(__dirname, 'src', 'hooks', 'usePushNotifications.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the placeholder with the new real key
content = content.replace(/const VAPID_PUBLIC_KEY = '.*';/, `const VAPID_PUBLIC_KEY = '${pubKey}';`);

fs.writeFileSync(filePath, content);
console.log('Successfully updated VAPID_PUBLIC_KEY to:', pubKey);
