'use strict';

// Kopiert die Oberflaeche (../renderer) nach ./www und bindet die Android-Anbindung ein.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, '..', 'renderer');
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, name), path.join(out, name));
}
fs.copyFileSync(path.join(root, 'android-shim.js'), path.join(out, 'android-shim.js'));

const indexFile = path.join(out, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html: app.js script tag not found');
html = html.replace('<script src="app.js"></script>', '<script src="android-shim.js"></script>\n    <script src="app.js"></script>');
fs.writeFileSync(indexFile, html);
console.log('www ready: ' + fs.readdirSync(out).join(', '));
