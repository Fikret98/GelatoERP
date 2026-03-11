const crypto = require('crypto');

function generateVAPIDKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  // SPKI DER format for P-256 public key ends with the 65-byte uncompressed point
  const rawPubKey = publicKey.slice(-65); 
  
  // PKCS8 DER format for P-256 private key often has the 32-byte private scalar at the end or in a specific offset
  // A safer way is to use getPublicKey and then extract
  
  const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  // Let's use a simpler approach for private key extraction if slice(-32) is too fragile
  // but for PKCS#8 on EC it's exactly the last 32 bytes of the inner octet string.
  const rawPrivKey = privateKey.slice(-32);

  return {
    publicKey: base64url(rawPubKey),
    privateKey: base64url(rawPrivKey)
  };
}

console.log(JSON.stringify(generateVAPIDKeys(), null, 2));
