@echo off
rem Inicia o servidor local e abre o jogo no navegador padrao.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
rem abre o navegador um instante depois, quando o servidor ja estiver no ar
start "" /min cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:5173"
node server.mjs
pause
