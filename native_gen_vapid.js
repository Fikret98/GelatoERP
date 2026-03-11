const crypto = require('crypto');
const fs = require('fs');

function toUrlSafeBase64(s) {
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = toUrlSafeBase64(ecdh.getPublicKey('base64', 'uncompressed'));
const privateKey = toUrlSafeBase64(ecdh.getPrivateKey('base64'));

fs.writeFileSync('generated_vapid.json', JSON.stringify({ publicKey, privateKey }, null, 2));
