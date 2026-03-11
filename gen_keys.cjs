const wp = require('web-push');
const keys = wp.generateVAPIDKeys();
require('fs').writeFileSync('VAPID_PUB.txt', keys.publicKey);
require('fs').writeFileSync('VAPID_PRIV.txt', keys.privateKey);
console.log('Keys generated successfully');
