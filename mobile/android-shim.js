'use strict';

// Android-Anbindung: stellt der Oberflaeche dieselbe Schnittstelle (window.api) bereit wie am PC.
// Die eigentliche Arbeit (Datei speichern, nach Downloads/GoTrack Export exportieren) macht das
// Capacitor-Plugin "GoTrack" (mobile/GoTrackPlugin.java). Am PC (Electron) wird diese Datei nicht geladen.
(function () {
  const cap = window.Capacitor;
  if (!cap || typeof cap.getPlatform !== 'function' || cap.getPlatform() !== 'android') return;
  const plugin = cap.Plugins && cap.Plugins.GoTrack;
  if (!plugin) return;

  window.api = {
    mobile: true,
    load: () => plugin.load(),
    save: async (text) => {
      await plugin.save({ text });
      return true;
    },
    exportFile: async (text, name) => {
      try {
        const res = await plugin.exportFile({ text, name });
        return { ok: true, path: res.path };
      } catch (e) {
        return { ok: false, error: 'save_failed', detail: String((e && e.message) || e) };
      }
    },
    importFile: () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*'; // manche Dateimanager kennen .json nicht und wuerden die Datei sonst ausgrauen
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return resolve({ ok: false, canceled: true });
          try {
            resolve({ ok: true, text: await file.text() });
          } catch (e) {
            resolve({ ok: false, error: 'read_failed', detail: String((e && e.message) || e) });
          }
        });
        input.addEventListener('cancel', () => resolve({ ok: false, canceled: true }));
        input.click();
      }),
    info: async () => {
      const info = await plugin.info();
      return { version: info.version, dataPath: info.dataPath, locale: navigator.language };
    },
    showDataFolder: async () => true
  };
})();
