; GoTrack! - zusaetzliche Installer-Seite: Ist das Programm schon installiert, werden
; 1. Reparieren  2. Neu installieren  3. Deinstallieren  angeboten.
; Wird von electron-builder automatisch eingebunden (build/installer.nsh).
; Falls diese Datei beim Bauen Probleme macht, baut SETUP-ERSTELLEN.bat automatisch ohne sie.

!include LogicLib.nsh
!include nsDialogs.nsh

; Immer nur fuer den aktuellen Benutzer installieren (keine Frage "Alle Benutzer / nur ich").
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  Var GT_Dlg
  Var GT_Radio1
  Var GT_Radio2
  Var GT_Radio3
  Var GT_Folder
  Var GT_De
  Var GT_Flag

  Function GtMaintCreate
    ${If} ${Silent}
      Abort
    ${EndIf}
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    ; Vorhandene Installation suchen: erst "nur ich", dann "alle Benutzer" (aeltere Installation)
    StrCpy $GT_Flag "/currentuser"
    StrCpy $GT_Folder ""
    ReadRegStr $GT_Folder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $GT_Folder == ""
      StrCpy $GT_Folder "$LOCALAPPDATA\Programs\${PRODUCT_FILENAME}"
    ${EndIf}
    ${IfNot} ${FileExists} "$GT_Folder\${UNINSTALL_FILENAME}"
      StrCpy $GT_Flag "/allusers"
      ReadRegStr $GT_Folder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $GT_Folder == ""
        StrCpy $GT_Folder "$PROGRAMFILES64\${PRODUCT_FILENAME}"
      ${EndIf}
      ${IfNot} ${FileExists} "$GT_Folder\${UNINSTALL_FILENAME}"
        Abort
      ${EndIf}
    ${EndIf}

    ; Sprache: Deutsch, wenn Windows auf Deutsch laeuft, sonst Englisch
    System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
    IntOp $0 $0 & 0x3FF
    ${If} $0 == 7
      StrCpy $GT_De "1"
    ${Else}
      StrCpy $GT_De "0"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $GT_Dlg
    ${If} $GT_Dlg == error
      Abort
    ${EndIf}

    ${If} $GT_De == "1"
      !insertmacro MUI_HEADER_TEXT "GoTrack! ist bereits installiert" "Was möchtest du tun? Deine Ziele und Einstellungen bleiben dabei erhalten."
      ${NSD_CreateRadioButton} 0 10u 100% 12u "Reparieren – Programmdateien im selben Ordner erneut installieren"
      Pop $GT_Radio1
      ${NSD_CreateRadioButton} 0 30u 100% 12u "Neu installieren – alte Version erst entfernen, dann frisch installieren"
      Pop $GT_Radio2
      ${NSD_CreateRadioButton} 0 50u 100% 12u "Deinstallieren – GoTrack! von diesem Computer entfernen"
      Pop $GT_Radio3
    ${Else}
      !insertmacro MUI_HEADER_TEXT "GoTrack! is already installed" "What would you like to do? Your goals and settings are kept."
      ${NSD_CreateRadioButton} 0 10u 100% 12u "Repair - reinstall the program files in the same folder"
      Pop $GT_Radio1
      ${NSD_CreateRadioButton} 0 30u 100% 12u "Reinstall - remove the old version first, then install fresh"
      Pop $GT_Radio2
      ${NSD_CreateRadioButton} 0 50u 100% 12u "Uninstall - remove GoTrack! from this computer"
      Pop $GT_Radio3
    ${EndIf}
    ${NSD_Check} $GT_Radio1
    nsDialogs::Show
  FunctionEnd

  Function GtMaintLeave
    ${NSD_GetState} $GT_Radio3 $0
    ${If} $0 == ${BST_CHECKED}
      ExecWait '"$GT_Folder\${UNINSTALL_FILENAME}" $GT_Flag _?=$GT_Folder'
      Delete "$GT_Folder\${UNINSTALL_FILENAME}"
      RMDir "$GT_Folder"
      Quit
    ${EndIf}
    ${NSD_GetState} $GT_Radio2 $0
    ; Aeltere "alle Benutzer"-Installation: Reparieren = ebenfalls erst entfernen (sonst gaebe es zwei Kopien)
    ${If} $GT_Flag == "/allusers"
      StrCpy $0 ${BST_CHECKED}
    ${EndIf}
    ${If} $0 == ${BST_CHECKED}
      ExecWait '"$GT_Folder\${UNINSTALL_FILENAME}" /S /KEEP_APP_DATA $GT_Flag _?=$GT_Folder'
      Delete "$GT_Folder\${UNINSTALL_FILENAME}"
      RMDir "$GT_Folder"
    ${EndIf}
    ; Reparieren: einfach normal weiter - der Installer ersetzt die Programmdateien, Daten bleiben.
  FunctionEnd

  Page custom GtMaintCreate GtMaintLeave
!macroend
