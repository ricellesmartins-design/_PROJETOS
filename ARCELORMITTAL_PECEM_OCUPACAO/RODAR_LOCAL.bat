@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Instale o Node.js LTS: https://nodejs.org & pause & exit /b)
if not exist node_modules call npm install --no-audit --no-fund
start "" http://localhost:5173
call npm run dev
