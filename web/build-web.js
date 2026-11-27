'use strict';

// Baut die Web-Version (fuer GitHub Pages) nach ../web-dist: Oberflaeche + Manifest + Offline-Funktion + Icons.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web-dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

for (const name of fs.readdirSync(path.join(root, 'renderer'))) {
  fs.copyFileSync(path.join(root, 'renderer', name), path.join(out, name));
}
for (const name of ['web-extras.js', 'web.css']) fs.copyFileSync(path.join(__dirname, name), path.join(out, name));
for (const name of fs.readdirSync(path.join(__dirname, 'icons'))) {
  fs.copyFileSync(path.join(__dirname, 'icons', name), path.join(out, 'icons', name));
}

fs.writeFileSync(
  path.join(out, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'GoTrack!',
      short_name: 'GoTrack',
      description: 'Track your goals, plans and dreams. Everything stays on your device.',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#f5f6f8',
      theme_color: '#f5f6f8',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    },
    null,
    2
  )
);

// index.html: Manifest, iPhone-Einstellungen, Zusatzdateien
const indexFile = path.join(out, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
const mustReplace = (from, to) => {
  if (!html.includes(from)) throw new Error('index.html: not found: ' + from);
  html = html.replace(from, to);
};
mustReplace(
  '<link rel="stylesheet" href="style.css" />',
  `<link rel="stylesheet" href="style.css" />
    <link rel="stylesheet" href="web.css" />
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="icon" type="image/png" href="icons/icon-192.png" />
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="GoTrack" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />`
);
mustReplace('<script src="app.js"></script>', '<script src="app.js"></script>\n    <script src="web-extras.js"></script>');
fs.writeFileSync(indexFile, html);

// Service Worker mit Dateiliste und Version
const files = ['./'];
const walk = (dir, prefix) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'sw.js') continue;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), prefix + entry.name + '/');
    else files.push(prefix + entry.name);
  }
};
walk(out, '');
let sw = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
sw = sw.replace('__VERSION__', pkg.version).replace('__FILES__', JSON.stringify(files, null, 2));
fs.writeFileSync(path.join(out, 'sw.js'), sw);

console.log('web-dist ready (' + files.length + ' files, version ' + pkg.version + ')');
