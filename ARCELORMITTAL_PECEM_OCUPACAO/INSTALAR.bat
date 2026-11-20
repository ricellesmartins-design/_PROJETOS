@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Instalar projeto ArcelorMittal Pecem - Ocupacao (IDG)
rem Rode uma vez. Instala as dependencias e liga a pasta _PROJETOS ao GitHub
rem (repositorio ricellesmartins-design/_PROJETOS), sem mexer nos outros projetos da pasta.
cd /d "%~dp0"
rem As chaves publicas do Supabase vem do arquivo env.publico.txt quando o .env nao existe
if not exist ".env.production" if exist "env.publico.txt" copy /y "env.publico.txt" ".env.production" >nul
if not exist ".env.development" if exist "env.publico.txt" copy /y "env.publico.txt" ".env.development" >nul

where npm >nul 2>nul || (echo [ERRO] Instale o Node.js LTS: https://nodejs.org & goto :fim)

echo [1/3] Instalando dependencias...
call npm install --no-audit --no-fund || (echo [ERRO] Falha no npm install. & goto :fim)

echo.
echo [2/3] Login no Netlify (abre o navegador; se ja estiver logado, so confirma)...
call npx.cmd -y netlify-cli status >nul 2>nul || call npx.cmd -y netlify-cli login

echo.
echo [3/3] Ligando ao GitHub...
where git >nul 2>nul || (echo [AVISO] Git nao instalado: https://git-scm.com/download/win . O app funciona e publica sem ele; o GitHub so guarda copia do codigo. & goto :pronto)
git remote get-url origin >nul 2>nul && (echo Ja ligado ao GitHub. & goto :pronto)

rem A pasta pai (_PROJETOS) vira a copia local do repositorio. Arquivos de outros projetos
rem (ex.: MGR_SERVICOS EXTERNO) continuam la, apenas nao sao enviados.
cd ..
if not exist ".git" git init -q
git remote add origin https://github.com/ricellesmartins-design/_PROJETOS.git
git fetch origin main || (echo [AVISO] Nao consegui acessar o GitHub. Faca login quando o Windows pedir e rode de novo. & git remote remove origin & goto :pronto)
git checkout -f -B main origin/main || goto :fim
git branch --set-upstream-to=origin/main main >nul
cd /d "%~dp0"

:pronto
echo.
echo Pronto. Para testar no computador: RODAR_LOCAL.bat
echo Para publicar no Netlify: ATUALIZAR.bat

:fim
echo.
pause
