@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Atualizar app ArcelorMittal Pecem - Ocupacao (IDG)
cd /d "%~dp0"

echo ============================================================
echo   Atualizar app ArcelorMittal Pecem - Ocupacao  (IDG)
echo   Supabase (banco) + Netlify (site) + GitHub (copia do codigo)
echo ============================================================
echo.

where npm >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo. & goto :fim)

rem GitHub e opcional: so e usado se a pasta ja foi ligada pelo INSTALAR.bat
set "GIT_OK="
where git >nul 2>nul && git remote get-url origin >nul 2>nul && set "GIT_OK=1"

if defined GIT_OK (
  echo [1/5] Baixando a versao mais recente do GitHub...
  git checkout -q main 2>nul
  git pull --no-rebase origin main || (echo [ERRO] Falha ao baixar do GitHub. Verifique a internet ou conflitos de arquivos. & goto :fim)
) else (
  echo [1/5] GitHub nao configurado nesta pasta ^(rode INSTALAR.bat para ligar^). Seguindo so com Netlify.
)

echo.
echo [2/5] Instalando/atualizando dependencias...
call npm install --no-audit --no-fund || (echo [ERRO] Falha no npm install. & goto :fim)

echo.
echo [3/5] Rodando os testes das regras...
call npm test || (echo [ERRO] Testes falharam. Nada foi publicado. & goto :fim)

echo.
echo [4/5] Gerando a versao de producao...
call npm run build || (echo [ERRO] Build falhou. Nada foi publicado. & goto :fim)

echo.
echo [5/5] Publicando no Netlify...
rem Pasta .netlify propria deste app, para nao misturar com o site MGR Projetos da pasta _PROJETOS
if not exist ".netlify" mkdir ".netlify"
if not exist ".netlify\state.json" (
  echo Primeira publicacao: criando o site no Netlify...
  call npx.cmd -y netlify-cli sites:create --name arcelormittal-pecem-ocupacao
  if not exist ".netlify\state.json" (
    echo Esse nome ja existe no Netlify. Digite outro nome quando pedir:
    call npx.cmd -y netlify-cli sites:create
  )
  if not exist ".netlify\state.json" (
    echo [ERRO] Nao foi possivel criar o site. Se aparecer "Unauthorized", rode: npx.cmd netlify-cli login
    goto :fim
  )
)
call npx.cmd -y netlify-cli deploy --prod --dir dist
if errorlevel 1 (
  echo [ERRO] Falha na publicacao. Se aparecer "Unauthorized", rode uma vez: npx.cmd netlify-cli login
  goto :fim
)

if defined GIT_OK (
  echo.
  echo Guardando suas alteracoes no GitHub...
  git add -A -- .
  git diff --cached --quiet
  if errorlevel 1 (
    set "MSG="
    set /p "MSG=Descreva a alteracao (Enter = Atualizacao do app): "
    call :commit
  ) else (
    echo Nenhuma alteracao local para guardar.
  )
)

echo.
echo ============================================================
echo  PRONTO! Nova versao publicada (endereco "Production URL" acima).
echo  O aplicativo instalado atualiza sozinho ao ser aberto.
echo ============================================================
goto :fim

:commit
if not defined MSG set "MSG=Atualizacao do app"
git commit -q -m "%MSG%" || (echo [AVISO] Falha no commit. O site ja foi publicado. & exit /b)
git push origin main || echo [AVISO] Falha ao enviar ao GitHub. O site ja foi publicado.
exit /b

:fim
echo.
pause
