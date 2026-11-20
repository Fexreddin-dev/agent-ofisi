@echo off
chcp 65001 >nul
title Agent Ofisi
cd /d "%~dp0"
start "" "http://127.0.0.1:8770"
node app\server.js
pause
