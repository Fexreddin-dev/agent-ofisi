@echo off
chcp 65001 >nul
title Agent Ofisi - Install
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js not found. Install the LTS version from https://nodejs.org and run Install.bat again.
  echo Node.js tapilmadi. https://nodejs.org saytindan LTS versiyasini qurun, sonra Install.bat-i yeniden acin.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
node install.js %*
echo.
pause
