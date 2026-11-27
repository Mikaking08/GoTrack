'use strict';

// Nur fuer die Web-Version (GitHub Pages): Offline-Funktion, dauerhafter Speicher, Installationshinweis fuers iPhone.
(function () {
  // 1) Offline-Funktion
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // 2) Browser bitten, die Daten nicht zu loeschen (wird nicht ueberall erfuellt)
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {
    /* nur ein Extra */
  }

  // 3) Hinweis "Zum Home-Bildschirm hinzufuegen" (iPhone/iPad, nur im normalen Browser)
  try {
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    const KEY = 'gotrack-install-hint-dismissed';
    if (!isIos || standalone || localStorage.getItem(KEY)) return;
    const de = /^de/i.test(navigator.language || '');
    const text = de
      ? 'Tipp: Tippe auf „Teilen“ und dann auf „Zum Home-Bildschirm“. So bleibt GoTrack! dauerhaft gespeichert und startet wie eine App.'
      : 'Tip: tap “Share”, then “Add to Home Screen”. This keeps GoTrack! saved permanently and opens it like an app.';
    window.addEventListener('load', () => {
      const box = document.createElement('div');
      box.className = 'web-hint';
      box.setAttribute('role', 'note');
      const span = document.createElement('span');
      span.textContent = text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'OK';
      btn.addEventListener('click', () => {
        try {
          localStorage.setItem(KEY, '1');
        } catch (e) {
          /* ignorieren */
        }
        box.remove();
      });
      box.append(span, btn);
      document.body.append(box);
    });
  } catch (e) {
    /* der Hinweis ist nur ein Extra */
  }
})();
