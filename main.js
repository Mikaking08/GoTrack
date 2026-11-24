'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_BYTES = 20 * 1024 * 1024; // Schutz gegen versehentlich riesige Dateien
const DATA_NAME = 'gotrack-data.json';

let win = null;

function dataFile() {
  return path.join(app.getPath('userData'), DATA_NAME);
}

function readValidJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    JSON.parse(text);
    return text;
  } catch (e) {
    return null;
  }
}

function safeFileName(name) {
  const base = path.basename(String(name || 'gotrack.json')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return base || 'gotrack.json';
}

function label(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : fallback;
}

// Die erste Version hieß "Zielbuch" und speicherte in einem anderen Ordner. Beim ersten Start von GoTrack
// werden diese Daten übernommen (kopiert, die alte Datei bleibt unberührt).
function migrateLegacyData() {
  const file = dataFile();
  if (fs.existsSync(file) || fs.existsSync(file + '.bak')) return;
  const legacy = path.join(app.getPath('appData'), 'Zielbuch', 'zielbuch-daten.json');
  if (readValidJson(legacy) === null) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(legacy, file);
  } catch (e) {
    /* Migration ist ein Extra; ohne sie startet die App einfach leer */
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'GoTrack!',
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: true
    }
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });

  // Die App ist komplett lokal: keine Navigation weg von der eigenen Seite, keine Pop-ups.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerIpc() {
  // Laden: Hauptdatei, sonst Sicherung. Eine beschädigte Datei wird nie überschrieben, sondern umbenannt.
  // Hinweise werden als Code zurückgegeben; die Oberfläche übersetzt sie.
  ipcMain.handle('data:load', () => {
    migrateLegacyData();
    const file = dataFile();
    const backup = file + '.bak';
    const hasMain = fs.existsSync(file);
    const hasBackup = fs.existsSync(backup);
    if (!hasMain && !hasBackup) return { text: null, notice: null };

    const mainText = hasMain ? readValidJson(file) : null;
    if (mainText !== null) return { text: mainText, notice: null };

    let keptAs = null;
    if (hasMain) {
      keptAs = file.replace(/\.json$/, '') + '.damaged-' + Date.now() + '.json';
      try {
        fs.renameSync(file, keptAs);
      } catch (e) {
        keptAs = null;
      }
    }
    const backupText = hasBackup ? readValidJson(backup) : null;
    if (backupText !== null) return { text: backupText, notice: 'backup' };
    return { text: null, notice: 'corrupt', keptAs };
  });

  // Speichern: erst in eine temporäre Datei, dann umbenennen – so bleibt nie eine halbe Datei zurück.
  ipcMain.handle('data:save', (_event, text) => {
    if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('Invalid data.');
    JSON.parse(text);
    const file = dataFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, file + '.bak');
      } catch (e) {
        /* Sicherung ist nur ein Extra */
      }
    }
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      fs.copyFileSync(tmp, file);
      fs.unlinkSync(tmp);
    }
    return true;
  });

  ipcMain.handle('file:export', async (event, text, defaultName, labels) => {
    try {
      if (typeof text !== 'string' || text.length > MAX_BYTES) return { ok: false, error: 'too_big' };
      const parent = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(parent, {
        title: label(labels && labels.title, 'Export'),
        defaultPath: path.join(app.getPath('documents'), safeFileName(defaultName)),
        filters: [{ name: label(labels && labels.filter, 'GoTrack (JSON)'), extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(result.filePath, text, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: 'save_failed', detail: e.message };
    }
  });

  ipcMain.handle('file:import', async (event, labels) => {
    try {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(parent, {
        title: label(labels && labels.title, 'Import'),
        properties: ['openFile'],
        filters: [
          { name: label(labels && labels.filter, 'GoTrack (JSON)'), extensions: ['json'] },
          { name: label(labels && labels.allFiles, 'All files'), extensions: ['*'] }
        ]
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
      const file = result.filePaths[0];
      if (fs.statSync(file).size > MAX_BYTES) return { ok: false, error: 'too_big' };
      return { ok: true, text: fs.readFileSync(file, 'utf8') };
    } catch (e) {
      return { ok: false, error: 'read_failed', detail: e.message };
    }
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataPath: dataFile(), locale: app.getLocale() }));

  ipcMain.handle('app:showData', () => {
    const file = dataFile();
    if (fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(path.dirname(file));
    return true;
  });
}

// Speicher sparen: Die App ist reine Oberfläche ohne Grafik-Spielereien, deshalb braucht sie keinen
// GPU-Prozess und keine Rechtschreibprüfung (beides kostet im Leerlauf Dutzende MB).
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', 'SpellCheck,TranslateUI,MediaRouter,OptimizationHints');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --optimize-for-size');
app.commandLine.appendSwitch('in-process-gpu'); // kein eigener Grafik-Prozess
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('no-pings');

if (!app.requestSingleInstanceLock()) {
  // Zweite Instanz würde dieselbe Datei überschreiben – deshalb nur ein Fenster erlauben.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('app.gotrack.desktop');
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
