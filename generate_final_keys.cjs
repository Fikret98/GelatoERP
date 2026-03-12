const crypto = require('crypto');
const fs = require('fs');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const toBase64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const pub = toBase64url(ecdh.getPublicKey());
const priv = toBase64url(ecdh.getPrivateKey());

fs.writeFileSync('vapid_keys_final.txt', pub + '\n' + priv);
console.log('Keys saved to vapid_keys_final.txt');
