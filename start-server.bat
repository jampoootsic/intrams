@echo off
title San Isidro College - Intramurals Scoring Server
echo ============================================================
echo   San Isidro College - Intramurals Scoring System
echo ============================================================
echo.
echo  Needs Postgres reachable via DATABASE_URL in .env
echo  This starts the server (serves the app at http://localhost:3010)
echo.
cd /d "%~dp0"
call npm start
echo.
echo Server stopped. Press any key to close.
pause >nul
