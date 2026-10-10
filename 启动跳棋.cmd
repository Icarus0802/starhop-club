@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0scripts\launch.cjs" %*
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  start "" "%~dp0index.html"
) else (
  node "%~dp0scripts\launch.cjs" %*
  if errorlevel 1 pause
)
