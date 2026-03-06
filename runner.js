const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logPath);

logStream.write('Starting server script...\n');

const child = spawn('npm.cmd', ['run', 'dev'], {
    shell: true,
    cwd: __dirname
});

child.stdout.on('data', (data) => {
    logStream.write(data);
});

child.stderr.on('data', (data) => {
    logStream.write('ERROR: ' + data);
});

child.on('close', (code) => {
    logStream.write(`Process exited with code ${code}\n`);
});

process.on('exit', () => {
    child.kill();
});
