; Custom NSIS hooks — add/remove $INSTDIR to user PATH so `fleet` is accessible
; in any new terminal after installation.

!macro customInstall
  ; Add $INSTDIR to the user PATH (idempotent)
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \
    "$p = [Environment]::GetEnvironmentVariable(\"PATH\",\"User\"); \
     $parts = $p -split \";\"; \
     if ($parts -notcontains \"$INSTDIR\") { \
       [Environment]::SetEnvironmentVariable(\"PATH\", ($p.TrimEnd(\";\") + \";$INSTDIR\"), \"User\") \
     }"'
  Pop $0
  ; Broadcast WM_WININICHANGE so open explorer/shells pick up the new PATH
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUninstall
  ; Remove $INSTDIR from the user PATH
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \
    "$p = [Environment]::GetEnvironmentVariable(\"PATH\",\"User\"); \
     $parts = ($p -split \";\") | Where-Object { $_ -ne \"$INSTDIR\" }; \
     [Environment]::SetEnvironmentVariable(\"PATH\", ($parts -join \";\"), \"User\")"'
  Pop $0
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
