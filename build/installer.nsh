; Extra uninstall step for the NSIS installer built by electron-builder.
; Pulse registers itself to start with Windows through Electron's setLoginItemSettings, which
; writes a value named after the AppUserModelId. Remove it so nothing points at a deleted exe.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.pulse.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.pulse.app"
!macroend
