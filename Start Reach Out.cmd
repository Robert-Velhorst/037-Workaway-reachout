@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer, then open this file again.
  pause
  exit /b 1
)
node --input-type=module -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<13))process.exit(1);await import('node:sqlite')"
if errorlevel 1 goto failed
if not exist dist\index.html (
  if not exist node_modules (
    call npm.cmd ci
    if errorlevel 1 goto failed
  )
  call npm.cmd run build
  if errorlevel 1 goto failed
)
if /i "%~1"=="--check" (
  echo Startcontrole geslaagd. De gebouwde app en SQLite zijn beschikbaar.
  exit /b 0
)
echo Open http://127.0.0.1:4173 in je browser. Houd dit venster open.
node server/index.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo De tool kon niet starten. Bekijk de melding hierboven.
pause
exit /b 1
