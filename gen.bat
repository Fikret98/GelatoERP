@echo off
node -e "const wp = require('web-push'); const keys = wp.generateVAPIDKeys(); console.log(keys.publicKey);" > %~dp0VAPID_PUB.txt
