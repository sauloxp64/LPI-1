@echo off
chcp 65001 >nul
cd /d "%~dp0"
docker compose down
echo Containers parados. Seu progresso continua salvo no volume Docker "lpic1_dados".
pause
