@echo off
title San Isidro College - Intramurals Setup
echo ============================================================
echo   Setup: installs dependencies, builds frontend, inits database
echo ============================================================
echo   Needs a Postgres reachable via DATABASE_URL in .env
echo   (copy .env.example to .env first).
echo.

echo [1/4] Installing server dependencies...
cd /d "%~dp0"
call npm install || goto :error

echo.
echo [2/4] Installing client dependencies...
cd /d "%~dp0client"
call npm install || goto :error

echo.
echo [3/4] Building frontend...
call npm run build || goto :error

echo.
echo [4/4] Initializing database...
cd /d "%~dp0"
call npm run db:init || goto :error

echo.
echo ============================================================
echo   Setup complete!
echo   Run start-server.bat then open http://localhost:3010
echo   Default login:  admin / admin123
echo ============================================================
pause
exit /b 0

:error
echo.
echo  Something went wrong. Read the error above.
pause
exit /b 1
