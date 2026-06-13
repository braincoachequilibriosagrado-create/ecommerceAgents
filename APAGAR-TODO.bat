@echo off
title EcommerceAgents - Apagando...

echo.
echo  ================================================
echo   ECOMMERCEAGENTS - Apagando servidores
echo  ================================================
echo.

echo  Liberando puerto 3000 (APP)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Liberando puerto 3001 (ADMIN)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Liberando puerto 3002 (MOTOR)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  ================================================
echo   Listo! Puertos 3000, 3001 y 3002 liberados.
echo  ================================================
echo.
pause
