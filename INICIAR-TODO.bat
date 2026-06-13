@echo off
title EcommerceAgents - Iniciando...

echo.
echo  ================================================
echo   ECOMMERCEAGENTS - Iniciando los 3 servidores
echo  ================================================
echo.

echo  [1/3] Iniciando MOTOR (puerto 3002)...
start "MOTOR - EcommerceAgents" cmd /k "cd /d c:\Users\User\Desktop\ecommerceAgent\motor && node server.js"

timeout /t 2 /nobreak >nul

echo  [2/3] Iniciando APP USUARIO (puerto 3000)...
start "APP - EcommerceAgents" cmd /k "cd /d c:\Users\User\Desktop\ecommerceAgent\ecommerceAgent && npx serve . -p 3000"

timeout /t 1 /nobreak >nul

echo  [3/3] Iniciando ADMIN (puerto 3001)...
start "ADMIN - EcommerceAgents" cmd /k "cd /d c:\Users\User\Desktop\ecommerceAgent && npx serve admin -p 3001"

echo.
echo  ================================================
echo   Listo! Tres ventanas abiertas:
echo     MOTOR  ->  http://localhost:3002
echo     APP    ->  http://localhost:3000
echo     ADMIN  ->  http://localhost:3001
echo  ================================================
echo.
echo  Puedes cerrar esta ventana.
pause
