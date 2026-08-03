; TalKing NSIS installer
; Produces a real Windows installer (.exe) with:
;   - Install into Program Files (or per-user AppData in single-user mode)
;   - Desktop + Start Menu shortcuts
;   - Optional "Launch when Windows starts (hidden)"
;   - Proper uninstaller registered in Add/Remove Programs

Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define APP_NAME       "TalKing"
!define APP_PUBLISHER  "Quentin Rosset"
!define APP_VERSION    "1.0.1"
!define APP_EXE        "TalKing-Frameless.exe"
!define PREVIOUS_APP_EXE "TalKing-Official.exe"
!define LEGACY_APP_EXE "TalKing.exe"
!define APP_ICON       "TalKing-1.0.1.ico"
!define APP_ID         "TalKing"
!define SOURCE_DIR     "../electron-release/TalKing-win32-x64"
!define REG_UNINSTALL  "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define REG_RUN        "Software\Microsoft\Windows\CurrentVersion\Run"

Name "${APP_NAME}"
OutFile "../electron-release/TalKing-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
BrandingText "TalKing v${APP_VERSION} - ${APP_PUBLISHER}"
ShowInstDetails hide
ShowUninstDetails hide

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName"     "${APP_NAME}"
VIAddVersionKey "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "TalKing installer"
VIAddVersionKey "FileVersion"     "${APP_VERSION}"
VIAddVersionKey "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey "LegalCopyright"  "(c) ${APP_PUBLISHER}"

!define MUI_ABORTWARNING
; The installer deliberately uses the separate black logo supplied by the
; owner. The installed app, taskbar and shortcuts keep tray-icon.ico.
!define MUI_ICON   "installer-icon.ico"
!define MUI_UNICON "installer-icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME} now"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Start ${APP_NAME} automatically when Windows starts (hidden in tray)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION EnableAutoStart
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "French"

Function EnableAutoStart
  WriteRegStr HKCU "${REG_RUN}" "${APP_ID}" '"$INSTDIR\${APP_EXE}" --hidden'
FunctionEnd

Section "Install"
  ; Kill any running instance so we can overwrite existing files on reinstall / upgrade
  ExecWait 'taskkill /F /IM ${APP_EXE}' $0
  ExecWait 'taskkill /F /IM ${PREVIOUS_APP_EXE}' $0
  ExecWait 'taskkill /F /IM ${LEGACY_APP_EXE}' $0
  Sleep 500

  SetOutPath "$INSTDIR"

  ; Wipe previous install content so stale files don't linger
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete  "$INSTDIR\*.dll"
  Delete  "$INSTDIR\*.pak"
  Delete  "$INSTDIR\*.bin"
  Delete  "$INSTDIR\${PREVIOUS_APP_EXE}"
  Delete  "$INSTDIR\${LEGACY_APP_EXE}"

  ; Copy the entire packaged app tree
  File /r "${SOURCE_DIR}\*.*"
  ; Keep a versioned icon beside the executable. Windows caches shortcut icons
  ; by path, so changing this filename forces Explorer to load the new artwork.
  File /oname=${APP_ICON} "tray-icon.ico"

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_ICON}" 0 SW_SHOWNORMAL "" "TalKing"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_ICON}" 0 SW_SHOWNORMAL "" "TalKing"

  ; Uninstaller + Add/Remove Programs entry
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "DisplayIcon"     "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${REG_UNINSTALL}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${REG_UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_UNINSTALL}" "URLInfoAbout"    "https://voice-to-clipboard.lovable.app"
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoRepair" 1

  ; Estimate installed size (KB)
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "EstimatedSize" "$0"
  IfSilent 0 +2
  Exec '"$INSTDIR\${APP_EXE}"'
SectionEnd

Section "Uninstall"
  ; Stop any running instance so files aren't locked
  ExecWait 'taskkill /F /IM ${APP_EXE}' $0
  ExecWait 'taskkill /F /IM ${PREVIOUS_APP_EXE}' $0
  ExecWait 'taskkill /F /IM ${LEGACY_APP_EXE}' $0

  ; Remove auto-start entry if present
  DeleteRegValue HKCU "${REG_RUN}" "${APP_ID}"

  ; Shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; App tree
  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${REG_UNINSTALL}"
  DeleteRegKey /ifempty HKCU "Software\${APP_NAME}"
SectionEnd
