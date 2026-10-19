@echo off
chcp 65001 >nul
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker nao encontrado. Instale o Docker Desktop e tente de novo.
  pause
  exit /b 1
)
echo Subindo a area de estudos LPIC-1 (a primeira vez demora alguns minutos)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Falha ao subir os containers. Veja a mensagem acima.
  pause
  exit /b 1
)
echo.
echo Pronto! Abrindo http://localhost:8088
start "" http://localhost:8088
