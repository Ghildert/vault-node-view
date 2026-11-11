@echo off
if /i "%~1"=="rebuild" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-nodevault-test.ps1" -Development -Rebuild
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-nodevault-test.ps1" -Development
)
if errorlevel 1 (
    pause
    exit /b 1
)
