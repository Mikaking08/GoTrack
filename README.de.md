# GoTrack!

*[English version](README.md)*

Ziele, Pläne und Träume in eigenen Kategorien festhalten, in Schritte zerlegen und den Fortschritt sehen.
Alles bleibt lokal auf deinem Gerät: kein Account, kein Server, keine Werbung.

- **Android-Version** (APK, ab Android 10): gleicher Code, Export nach `Downloads/GoTrack Export/`; wird bei GitHub automatisch gebaut (`mobile/`, `.github/workflows/build-android.yml`)
- **Web-App** (iPhone, Mac, jeder Browser): https://mikaking08.github.io/gotrack/ – am iPhone in Safari „Teilen > Zum Home-Bildschirm“; wird bei GitHub Pages automatisch bereitgestellt (`web/`). Regelmäßig exportieren als Backup!
- **Kategorien** frei anlegen (z. B. „Bucketliste“), mit Symbol (viele zur Auswahl oder ohne Symbol = Punkt) und Farbe
- **Ziele** mit **Schritten**, Fortschritt in Prozent pro Schritt, Ziel, Kategorie und insgesamt
- **Verlauf**: wann welcher Schritt erledigt und welches Ziel erreicht wurde, plus deine Notizen, nach Monaten sortiert
- **Notizen & Erinnerungen** zu jedem Ziel und jedem Schritt (z. B. dein Tokio-Tagebuch), dazu eine optionale Beschreibung
- **Eigener Listenname** oben links (Klick darauf): „Goals“, „Dreams“, was du willst
- **43 Sprachen**: alle europäischen Sprachen (EU und Nicht-EU, u. a. Irisch, Walisisch, Baskisch, Katalanisch, Ukrainisch, Georgisch, Armenisch …) plus Japanisch und vereinfachtes Chinesisch. Automatisch nach Systemsprache, in den Einstellungen umstellbar. Die Übersetzungen sind KI-erstellt – Korrekturen willkommen!
- **Export/Import** als Datei, um Ziele auf ein anderes Gerät mitzunehmen
- **Anpassbar**: Hell/Dunkel, Akzentfarbe, Schriftgröße, Abstände, Ecken-Rundung

## Die Setup-Datei (.exe) bekommen

Eine fertige `.exe` muss einmal gebaut werden. Das passiert **nicht** beim Nutzer, sondern bei dir (oder bei GitHub).
Danach gibt es nur noch **eine einzige Datei**: `GoTrack-Setup-0.5.0.exe`. Sie installiert die App, legt auf Wunsch
eine Desktop-Verknüpfung an, und danach startet GoTrack! wie jedes normale Programm per Doppelklick, ohne Eingabeaufforderung.

### Weg 1: Doppelklick auf deinem PC (einfachster Weg)

1. [Node.js](https://nodejs.org) (LTS) installieren, falls noch nicht geschehen.
2. Ordner entpacken und **`SETUP-ERSTELLEN.bat`** doppelt anklicken. Mit „Ja“ bestätigen (Administratorrechte).
3. Warten (beim ersten Mal einige Minuten). Am Ende öffnet sich der Ordner `dist` mit `GoTrack-Setup-0.5.0.exe`.

### Weg 2: Kostenlos bei GitHub bauen und gleichzeitig öffentlich anbieten

1. Auf github.com ein kostenloses Konto anlegen und ein neues, **öffentliches** Repository erstellen.
2. Den Projektordner hochladen (inklusive des Ordners `.github`).
3. **Actions** > **Build Windows setup** > **Run workflow**: Nach wenigen Minuten gibt es die Setup-Datei bei **Artifacts**.
4. Für einen öffentlichen Download-Link: unter **Releases** eine neue Version mit dem Tag `v0.5.0` anlegen.
   Der Workflow hängt die Setup-Datei dann automatisch an die Release-Seite. Diesen Link kann jeder öffnen und
   die Datei herunterladen, kostenlos.

### Setup erneut starten (Reparieren / Neu installieren / Deinstallieren)

Die fertige Setup-Datei lädt nichts aus dem Internet, alles steckt schon in ihr. Erkennt sie, dass GoTrack! bereits
installiert ist, fragt sie: **1. Reparieren** (Programmdateien im selben Ordner erneut schreiben),
**2. Neu installieren** (alte Version erst entfernen) oder **3. Deinstallieren**. Deine Ziele bleiben dabei erhalten. GoTrack! wird immer nur für den aktuellen Windows-Benutzer installiert (ohne Administratorrechte); die Frage nach „alle Benutzer“ gibt es nicht mehr.
Falls sich die Setup-Datei mit diesem Menü auf deinem System nicht bauen lässt, baut `SETUP-ERSTELLEN.bat`
automatisch eine Version ohne das Menü (die Datei `build/installer.nsh` wird dann übersprungen).

### Arbeitsspeicher

GoTrack! schaltet GPU-Beschleunigung und Rechtschreibprüfung ab und begrenzt den JavaScript-Speicher. Electron hat
trotzdem einen Sockel (mehrere Prozesse); realistisch sind grob 50-70 MB im Leerlauf statt 80-90 MB.
Gemessen wird im Task-Manager die Summe aller GoTrack-Einträge.

### Hinweis zu Windows SmartScreen

Die Setup-Datei ist nicht mit einem kostenpflichtigen Zertifikat signiert. Windows zeigt deshalb beim ersten Start
„Der Computer wurde durch Windows geschützt“. Das ist kein Fehler: **Weitere Informationen** und dann
**Trotzdem ausführen**. Das ist bei jeder unsignierten Gratis-App so. Schreib es am besten auf die Download-Seite.

### Namen

Das Programm heißt **GoTrack!**. Datei- und Verknüpfungsnamen heißen **GoTrack** (ohne Ausrufezeichen), weil Windows-Installer
mit Sonderzeichen im Namen Probleme machen können.

## Entwickeln und ausprobieren

```
npm install
node node_modules\electron\install.js
npm start
```

(Der zweite Befehl lädt die Electron-Programmdateien, die neuere npm-Versionen nicht automatisch herunterladen.)
Tests: `npm test`.

## Wo liegen die Daten?

Lokal im Benutzerordner (Einstellungen > „Datenordner zeigen“). Die App schreibt sicher (erst temporäre Datei, dann
umbenennen) und behält eine Sicherung des vorherigen Stands (`.bak`). Eine beschädigte Datei wird nie überschrieben.
Beim Deinstallieren bleiben die Daten absichtlich erhalten. Daten der ersten Version („Zielbuch“) werden beim ersten Start
von GoTrack! automatisch übernommen.

## Export / Import (Geräte-Wechsel)

- **Exportieren** erzeugt eine Datei `gotrack-JJJJ-MM-TT.json` (inklusive Verlauf und Notizen).
- **Importieren** liest so eine Datei wieder ein: **Zusammenführen** (Neues wird ergänzt, nichts geht verloren) oder
  **Ersetzen**. Dateien aus der ersten Version werden weiterhin gelesen.

## Eine Sprache hinzufügen

Texte stehen in `renderer/i18n.js` (en, de) und `renderer/i18n-more.js` (alle anderen); Übersetzungen dort korrigieren. Neue Sprache: Wörterbuch mit denselben Schlüsseln anlegen (Mehrzahl-Schlüssel `count.*.<Kategorie>` nach `Intl.PluralRules`) und in `LANGUAGE_NAMES` (`renderer/logic.js`) eintragen; sie erscheint automatisch im Einstellungs-Menü. `npm test` prüft Schlüssel und Platzhalter.

## Projektaufbau

| Datei | Aufgabe |
| --- | --- |
| `main.js` | Electron-Hauptprozess: Fenster, Speichern, Datei-Dialoge |
| `preload.js` | Schmale, sichere Brücke zwischen Fenster und Hauptprozess |
| `renderer/logic.js` | Datenmodell, Fortschritt, Verlauf, Export/Import, Zusammenführen (ohne Oberfläche, getestet) |
| `renderer/i18n.js` | Übersetzungen (Deutsch, Englisch) |
| `renderer/app.js` | Oberfläche |
| `renderer/style.css` | Design (alles über CSS-Variablen) |
| `build/` | App-Symbol |
| `SETUP-ERSTELLEN.bat` | Baut per Doppelklick die Setup-Datei |
| `test/` | Automatische Tests (`npm test`) |

## Später: Android und iOS

Die Oberfläche (`renderer/`) ist normales HTML/CSS/JavaScript und läuft auch im Browser. Darauf lassen sich aufbauen:
iOS als Web-App (PWA, kostenlos über eine Webseite) und Android als APK in einer App-Hülle (z. B. Capacitor). Dafür sind
noch Anpassungen für Touch-Bedienung nötig (z. B. sind manche Symbole erst beim Darüberfahren mit der Maus sichtbar).
Das Dateiformat für Export/Import bleibt dasselbe.
