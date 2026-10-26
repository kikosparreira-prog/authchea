@echo off
title FrisGui Auth System - Setup
color 0B
cls
echo.
echo  FRISGUI AUTH SYSTEM - Setup
echo  ============================
echo.

:: Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js nao encontrado!
    echo [!] Instala em: https://nodejs.org
    pause & exit /b 1
)
echo [+] Node.js encontrado

:: Check MySQL
mysql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] MySQL nao encontrado no PATH
    echo [!] Certifica-te que o MySQL esta instalado
)

:: Install dependencies
echo.
echo [*] Instalando dependencias...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [!] Erro ao instalar dependencias
    pause & exit /b 1
)
echo [+] Dependencias instaladas

echo.
echo [*] Proximos passos:
echo.
echo  1. Edita backend\.env com os teus dados MySQL
echo  2. Cria a base de dados:
echo     mysql -u root -p ^< backend\schema.sql
echo  3. Inicia o servidor:
echo     cd backend ^&^& npm start
echo.
echo  Painel admin: http://localhost:3000
echo  Login: admin / admin123
echo  (Muda a password depois do primeiro login!)
echo.
pause
