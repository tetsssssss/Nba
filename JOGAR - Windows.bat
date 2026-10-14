@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js 20 ou superior e necessario. Instale em https://nodejs.org
  pause
  exit /b 1
)
echo Iniciando o NBA Universe Manager...
node launch.mjs
if errorlevel 1 (
  echo Ocorreu um erro ao abrir o jogo.
  pause
)
