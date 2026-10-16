@echo off
title San Isidro College - Intramurals Scoring Server
echo ============================================================
echo   San Isidro College - Intramurals Scoring System
echo ============================================================
echo.
echo  Make sure MySQL is running in XAMPP first.
echo  This starts the server (serves the app at http://localhost:3010)
echo.
cd /d "%~dp0server"
node index.js
echo.
echo Server stopped. Press any key to close.
pause >nul