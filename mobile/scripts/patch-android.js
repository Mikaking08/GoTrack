'use strict';

// Passt das von "npx cap add android" erzeugte Android-Projekt an:
// Plugin + MainActivity, Icons, Mindest-Android-Version, Versionsnummer, Signierung.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const android = path.join(root, 'android');
const pkg = JSON.parse(fs.readFileSync(path.join(root, '..', 'package.json'), 'utf8'));

function mustExist(file) {
  if (!fs.existsSync(file)) throw new Error('Not found (Capacitor template changed?): ' + file);
  return file;
}
function edit(file, fn) {
  const before = fs.readFileSync(mustExist(file), 'utf8');
  const after = fn(before);
  fs.writeFileSync(file, after);
  return before !== after;
}

// 1) Java-Dateien
const javaDir = path.join(android, 'app', 'src', 'main', 'java', 'app', 'gotrack', 'android');
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(root, 'GoTrackPlugin.java'), path.join(javaDir, 'GoTrackPlugin.java'));
fs.copyFileSync(path.join(root, 'MainActivity.java'), path.join(javaDir, 'MainActivity.java'));

// 2) Icons (alte Dichte-Ordner mit Adaptive-Icons entfernen, damit unser Bild ueberall gilt)
const res = path.join(android, 'app', 'src', 'main', 'res');
for (const dir of fs.readdirSync(res)) {
  if (dir.startsWith('mipmap-anydpi')) fs.rmSync(path.join(res, dir), { recursive: true, force: true });
}
const iconsDir = path.join(root, 'icons');
for (const dir of fs.readdirSync(iconsDir)) {
  const target = path.join(res, dir);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(path.join(iconsDir, dir))) {
    fs.copyFileSync(path.join(iconsDir, dir, file), path.join(target, file));
  }
}

// 3) Mindest-Android 10 (noetig fuer den Export nach Downloads ohne Berechtigung)
edit(path.join(android, 'variables.gradle'), (t) => {
  if (!/minSdkVersion\s*=\s*\d+/.test(t)) throw new Error('minSdkVersion not found in variables.gradle');
  return t.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 29');
});

// 4) Versionsnummer aus ../package.json (0.3.2 -> Code 302)
const [major, minor, patch] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch;
const gradleFile = path.join(android, 'app', 'build.gradle');
edit(gradleFile, (t) => {
  if (!/versionCode\s+\d+/.test(t) || !/versionName\s+"[^"]*"/.test(t)) throw new Error('versionCode/versionName not found in app/build.gradle');
  return t.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode).replace(/versionName\s+"[^"]*"/, 'versionName "' + pkg.version + '"');
});

// 5) Signierung: Schluessel aus Umgebungsvariablen (siehe .github/workflows/build-android.yml)
const signing = `

// --- GoTrack: Signierung der Release-APK ---
android {
    signingConfigs {
        gotrackRelease {
            storeFile file(System.getenv("GOTRACK_KEYSTORE") ?: "gotrack.keystore")
            storePassword System.getenv("GOTRACK_KEYSTORE_PASSWORD")
            keyAlias System.getenv("GOTRACK_KEY_ALIAS")
            keyPassword System.getenv("GOTRACK_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.gotrackRelease
        }
    }
}
`;
edit(gradleFile, (t) => (t.includes('gotrackRelease') ? t : t + signing));

// 6) App-Name
edit(path.join(res, 'values', 'strings.xml'), (t) => t.replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">GoTrack</string>').replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">GoTrack</string>'));

console.log('Android project patched: version ' + pkg.version + ' (code ' + versionCode + ')');
