@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Atualizar app ArcelorMittal Pecem - Ocupacao (IDG)
cd /d "%~dp0"

echo ============================================================
echo   Atualizar app ArcelorMittal Pecem - Ocupacao  (IDG)
echo   GitHub ^> Netlify (publicacao automatica) + Supabase
echo ============================================================
echo.

where git >nul 2>nul || (echo [ERRO] Git nao encontrado. Instale em https://git-scm.com/download/win e rode de novo. & goto :fim)
where npm >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo. & goto :fim)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Esta pasta nao esta ligada ao repositorio GitHub.
  echo Rode primeiro o arquivo INSTALAR.bat que fica na mesma pasta.
  goto :fim
)

echo [1/5] Baixando a versao mais recente do GitHub...
git checkout -q main 2>nul
git pull --no-rebase origin main || (echo [ERRO] Falha ao baixar do GitHub. Verifique a internet ou conflitos de arquivos. & goto :fim)

echo.
echo [2/5] Instalando/atualizando dependencias...
call npm install --no-audit --no-fund || (echo [ERRO] Falha no npm install. & goto :fim)

echo.
echo [3/5] Rodando os testes das regras...
call npm test || (echo [ERRO] Testes falharam. Nada foi enviado. & goto :fim)

echo.
echo [4/5] Gerando a versao de producao...
call npm run build || (echo [ERRO] Build falhou. Nada foi enviado. & goto :fim)

echo.
echo [5/5] Enviando suas alteracoes para o GitHub...
git add -A -- .
git diff --cached --quiet
if not errorlevel 1 (
  echo Nenhuma alteracao local para enviar. O site ja esta com a versao do GitHub.
  goto :ok
)
set "MSG="
set /p "MSG=Descreva a alteracao (Enter = 'Atualizacao do app'): "
if "%MSG%"=="" set "MSG=Atualizacao do app"
git commit -q -m "%MSG%" || (echo [ERRO] Falha no commit. & goto :fim)
git push origin main || (echo [ERRO] Falha ao enviar para o GitHub. & goto :fim)

:ok
echo.
echo ============================================================
echo  Pronto! O Netlify publica automaticamente em 1 a 2 minutos.
echo  Para testar antes no seu computador: npm run dev
echo ============================================================

:fim
echo.
pause
