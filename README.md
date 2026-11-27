# GoTrack!

*[Deutsche Version](README.de.md)*

A free, simple app to track your goals, plans and dreams in your own categories, break them into steps and watch your progress.
Everything stays on your device: no account, no server, no ads, no tracking.

## Download (Windows)

Get the latest `GoTrack-Setup-x.y.z.exe` from the [Releases](../../releases) page and run it.
It installs GoTrack! for the current Windows user (no administrator rights needed) and can create a desktop shortcut.
If GoTrack! is already installed, running the setup again offers **Repair**, **Reinstall** or **Uninstall**; your data is kept.

> Windows may show "Windows protected your PC" because the app is not code-signed (certificates cost money).
> Click **More info** and then **Run anyway**.

## Android

An Android version (APK, Android 10 or newer) is built from the same code. Download `GoTrack-x.y.z.apk` from the
[Releases](../../releases) page and open it on your phone (Android asks you to allow installing from this source).
Your data stays on the phone. **Export** saves a file to `Downloads/GoTrack Export/`; **Import** reads such a file again.
The APK is built online by GitHub Actions (`.github/workflows/build-android.yml`, wrapper in `mobile/`, uses Capacitor).

## Web app (iPhone, Mac, any browser)

GoTrack! also runs as a web app, free and without an account: **https://mikaking08.github.io/gotrack/**
On iPhone/iPad open it in Safari, tap **Share > Add to Home Screen**; on a Mac you can use it in any browser
(Safari: File > Add to Dock). It works offline after the first visit. Your data stays in your browser on that device.
**Tip: use Export regularly as a backup** (browsers can clear website data, e.g. Safari after about 7 days without use
if the app is not added to the Home Screen).

## Features

- **Categories** of your own (e.g. "Bucket List"), with an icon (or a dot) and a color
- **Goals with steps**: progress in percent per goal, category and overall, calculated automatically
- **Goals in progress** and **Achieved goals** views
- **History**: a list of when each goal was created and reached and each step was completed; goal names are links, dates are editable
- **Notes** for every goal and step, plus an optional description
- **Rename your list** (top left): "Goals", "Dreams", whatever you like
- **43 languages**: every European language (EU and non-EU, incl. Irish, Welsh, Basque, Catalan, Ukrainian, Georgian, Armenian …) plus Japanese and Simplified Chinese. Chosen automatically by system language, changeable in Settings. Translations are AI-generated – corrections are very welcome!
- **Export / import** your data as a file, to move to another device
- **Customizable**: light/dark, accent color, font size, spacing, corner radius

## Your data

Stored locally in your user folder (Settings > "Show data folder"), by default in `%APPDATA%\GoTrack`.
Saving is safe (temporary file first, then rename) and the previous state is kept as `.bak`.
Uninstalling keeps your data on purpose. Use **Export** in the app for a backup or to move to another PC; **Import** can merge or replace.

## Build it yourself

You need [Node.js](https://nodejs.org) (LTS).

```
npm install
node node_modules\electron\install.js
npm start        # run the app
npm test         # run the tests
```

To build the Windows setup file, double-click `SETUP-ERSTELLEN.bat` (it asks for administrator rights, which the build needs)
or run `npm run dist`. The result is `dist/GoTrack-Setup-x.y.z.exe`. If the setup with the Repair/Uninstall menu
(`build/installer.nsh`) cannot be built on your system, the batch file automatically builds one without it.
The repository also contains a GitHub Actions workflow (`.github/workflows/build-windows.yml`) that builds the setup file online.

## Add a language

Texts live in `renderer/i18n.js` (en, de) and `renderer/i18n-more.js` (all others). To fix a translation, edit the text there. To add a language, add a dictionary with the same keys (plural keys `count.*.<category>` per `Intl.PluralRules`) and register it in `LANGUAGE_NAMES` (`renderer/logic.js`); it appears in the Settings menu automatically. `npm test` checks keys and placeholders.

## Project layout

| File | Purpose |
| --- | --- |
| `main.js` | Electron main process: window, saving, file dialogs |
| `preload.js` | Small, safe bridge between window and main process |
| `renderer/logic.js` | Data model, progress, history, export/import, merging (no UI, tested) |
| `renderer/i18n.js` | Translations (German, English) |
| `renderer/app.js` | User interface |
| `renderer/style.css` | Design (all through CSS variables) |
| `build/` | App icon and installer script |
| `web/` | Web app build (GitHub Pages): manifest, offline cache, icons |
| `mobile/` | Android wrapper (Capacitor): build scripts, storage/export plugin |
| `test/` | Automated tests |

## Later: Android and iOS

The interface (`renderer/`) is plain HTML/CSS/JavaScript and also runs in a browser, so it can be wrapped as a web app (PWA)
or an Android app later. The export/import file format stays the same.

## License

MIT
