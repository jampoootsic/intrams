@echo off
title San Isidro College - Intramurals DEV
echo ============================================================
echo   Development mode
echo   - API server on   http://localhost:3010
echo   - Frontend dev on http://localhost:5174  (hot reload)
echo     Network:       http://<this PC's IP>:5174  (same Wi-Fi/LAN)
echo  Close both windows to stop.
echo ============================================================
cd /d "%~dp0server"
start "SIC API" cmd /k "node index.js"
cd /d "%~dp0client"
start "SIC Frontend (Vite)" cmd /k "npm run dev"