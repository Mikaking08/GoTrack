@echo off
setlocal
cd /d "%~dp0"
title GoTrack - Setup-Datei erstellen

rem --- Administratorrechte werden fuer den Bau der Setup-Datei gebraucht (sonst Fehler "symbolic link") ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Es werden Administratorrechte benoetigt. Bitte im folgenden Fenster mit "Ja" bestaetigen ...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden.
  echo Bitte von https://nodejs.org die LTS-Version installieren und diese Datei danach erneut starten.
  echo.
  pause
  exit /b 1
)

echo.
echo ==== Schritt 1 von 2: Programmteile laden (beim ersten Mal dauert das ein paar Minuten) ====
echo Bitte das Fenster NICHT schliessen und nicht Strg+C druecken.
echo.
if exist node_modules\electron-builder (
  echo Programmteile sind schon vorhanden - dieser Schritt wird uebersprungen.
) else (
  call npm install
  if errorlevel 1 goto fehler
)

echo.
echo ==== Schritt 2 von 2: Setup-Datei bauen (laedt beim ersten Mal weitere Werkzeuge, bitte warten) ====
echo.
if exist build\installer.nsh.off ren build\installer.nsh.off installer.nsh
del /q dist\GoTrack-Setup-*.exe >nul 2>&1
call npm run dist
if errorlevel 1 (
  if exist build\installer.nsh (
    echo.
    echo Der Bau mit dem Reparieren/Deinstallieren-Menue ist fehlgeschlagen. Ich versuche es ohne dieses Menue ...
    echo.
    ren build\installer.nsh installer.nsh.off
    call npm run dist
    if errorlevel 1 goto fehler
    echo.
    echo ***************************************************************
    echo HINWEIS: Diese Setup-Datei wurde OHNE das Reparieren/Deinstallieren-Menue gebaut.
    echo Bitte schicke mir den roten/gelben Text oberhalb dieser Meldung.
    echo ***************************************************************
    pause
  ) else (
    goto fehler
  )
)

echo.
echo ==== FERTIG! ====
echo Setup MIT Menue (Reparieren/Neu installieren/Deinstallieren), falls oben kein HINWEIS steht.
echo Die Setup-Datei liegt im Ordner "dist":  GoTrack-Setup-0.3.2.exe
echo Diese eine Datei kannst du installieren und an andere weitergeben.
echo.
explorer "%~dp0dist"
pause
exit /b 0

:fehler
echo.
echo ==== Es ist ein Fehler aufgetreten ====
echo Bitte mache ein Foto oder kopiere den Text oberhalb dieser Zeile und schicke ihn weiter.
echo.
pause
exit /b 1
