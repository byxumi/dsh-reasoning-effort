@echo off
chcp 65001 >nul
title DSH Reasoning Effort Installer
echo ============================================
echo  DSH Reasoning Effort Installer
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found. Download from https://nodejs.org
  pause
  exit /b 1
)

node "%~dp0install.js" %*
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Installation failed. Check the message above.
  pause
  exit /b %errorlevel%
)

echo.
echo Done. Press any key to exit.
pause >nul