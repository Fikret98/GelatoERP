const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log('---VAPID KEYS---');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
console.log('-----------------');
