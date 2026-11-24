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

## Features

- **Categories** of your own (e.g. "Bucket List"), with an icon (or a dot) and a color
- **Goals with steps**: progress in percent per goal, category and overall, calculated automatically
- **Goals in progress** and **Achieved goals** views
- **History**: a list of when each goal was created and reached and each step was completed; goal names are links, dates are editable
- **Notes** for every goal and step, plus an optional description
- **Rename your list** (top left): "Goals", "Dreams", whatever you like
- **Automatic language** by system language (German, otherwise English); can be changed in Settings
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

In `renderer/i18n.js` add another object with the same keys as `en`, register the language in `LANGUAGES` (`renderer/logic.js`)
and add it to the language menu (`renderer/app.js`, function `openSettings`). `npm test` checks that no texts are missing.

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
| `test/` | Automated tests |

## Later: Android and iOS

The interface (`renderer/`) is plain HTML/CSS/JavaScript and also runs in a browser, so it can be wrapped as a web app (PWA)
or an Android app later. The export/import file format stays the same.

## License

MIT
