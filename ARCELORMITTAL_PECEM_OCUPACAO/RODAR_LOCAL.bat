@echo off
cd /d "%~dp0"
rem As chaves publicas do Supabase vem do arquivo env.publico.txt quando o .env nao existe
if not exist ".env.production" if exist "env.publico.txt" copy /y "env.publico.txt" ".env.production" >nul
if not exist ".env.development" if exist "env.publico.txt" copy /y "env.publico.txt" ".env.development" >nul
where npm >nul 2>nul || (echo Instale o Node.js LTS: https://nodejs.org & pause & exit /b)
if not exist node_modules call npm install --no-audit --no-fund
start "" http://localhost:5173
call npm run dev
