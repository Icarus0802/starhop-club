@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0scripts\launch.cjs" --stop
) else (
  where node >nul 2>nul
  if not errorlevel 1 node "%~dp0scripts\launch.cjs" --stop
)
