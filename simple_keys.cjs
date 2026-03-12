const crypto = require('crypto');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const toBase64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
console.log('---START---');
console.log(toBase64url(ecdh.getPublicKey()));
console.log(toBase64url(ecdh.getPrivateKey()));
console.log('---END---');
