@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Instalar projeto ArcelorMittal Pecem - Ocupacao (IDG)
rem Liga esta pasta (C:\Users\Ricelles\OneDrive\0_ IA's\_PROJETOS\ARCELORMITTAL_PECEM_OCUPACAO)
rem ao repositorio GitHub ricellesmartins-design/_PROJETOS. Rode uma vez so.
cd /d "%~dp0"

where git >nul 2>nul || (echo [ERRO] Instale o Git: https://git-scm.com/download/win & goto :fim)
where npm >nul 2>nul || (echo [ERRO] Instale o Node.js LTS: https://nodejs.org & goto :fim)

git rev-parse --is-inside-work-tree >nul 2>nul
if not errorlevel 1 (
  echo Esta pasta ja esta ligada ao GitHub. Use o ATUALIZAR.bat.
  goto :deps
)

rem A pasta pai (_PROJETOS) vira a copia local do repositorio.
cd ..
echo Ligando a pasta _PROJETOS ao GitHub (repositorio _PROJETOS)...
git init -q
git remote remove origin >nul 2>nul
git remote add origin https://github.com/ricellesmartins-design/_PROJETOS.git
git fetch origin main || (echo [ERRO] Nao consegui acessar o GitHub. Faca login quando o Windows pedir. & goto :fim)
rem Mantem os arquivos que ja existem na pasta e passa a acompanhar a branch main.
git checkout -f -B main origin/main || goto :fim
git branch --set-upstream-to=origin/main main >nul
cd /d "%~dp0"

:deps
echo Instalando dependencias...
call npm install --no-audit --no-fund
echo.
echo Pronto. Para rodar no seu computador: npm run dev  (abre http://localhost:5173)
echo Para publicar alteracoes: ATUALIZAR.bat

:fim
echo.
pause
