const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('PUBLIC_KEY_START');
console.log(keys.publicKey);
console.log('PUBLIC_KEY_END');
console.log('PRIVATE_KEY_START');
console.log(keys.privateKey);
console.log('PRIVATE_KEY_END');
