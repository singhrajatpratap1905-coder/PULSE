@echo off
rem Installs Pulse for this user: builds it, copies it to %LOCALAPPDATA%\Programs\Pulse,
rem adds it to the Start menu and Settings > Apps, turns on start-with-Windows, and starts it.
rem After this, Pulse updates itself from GitHub. Your notes and history are kept.
cd /d "%~dp0"
if not exist node_modules (
  echo Getting the build tools first ^(one time^)...
  call npm ci
  if errorlevel 1 goto failed
)
call npm run install-app
if errorlevel 1 goto failed
echo.
echo You can close this window.
timeout /t 5 >nul
exit /b 0

:failed
echo.
echo Pulse could not be installed. See the messages above.
pause
exit /b 1
