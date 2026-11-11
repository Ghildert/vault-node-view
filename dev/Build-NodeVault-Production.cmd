@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-nodevault-test.ps1" -BuildOnly
if errorlevel 1 (
    pause
    exit /b 1
)
call npm.cmd --prefix "%~dp0..\apps\desktop" run pack:node
if errorlevel 1 (
    pause
    exit /b 1
)
echo Production build complete.
pause
