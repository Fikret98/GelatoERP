const crypto = require('crypto');
const fs = require('fs');

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
const filePath = 'c:\\Users\\FikratGadimov\\OneDrive - workplace.az\\Documents\\GitHub\\GelatoERP\\src\\hooks\\usePushNotifications.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the line
const lines = content.split('\n');
const newLines = lines.map(line => {
  if (line.includes('const VAPID_PUBLIC_KEY =')) {
    return `const VAPID_PUBLIC_KEY = '${pubKey}';`;
  }
  return line;
});

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Successfully updated VAPID_PUBLIC_KEY to:', pubKey);
