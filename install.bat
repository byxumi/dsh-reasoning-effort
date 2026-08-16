@echo off
chcp 65001 >nul
echo ============================================
echo  DSH 推理强度 (Reasoning Effort) 安装器
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [错误] 未找到 Node.js，请先安装: https://nodejs.org
  pause
  exit /b 1
)

node "%~dp0install.js" %*

echo.
pause