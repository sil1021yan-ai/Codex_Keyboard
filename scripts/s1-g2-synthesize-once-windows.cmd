@echo off
rem One authorized TTS attempt for slot 1, summary generation 2 only.
rem The PowerShell script checks current state and prevents a second request.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0synthesize-once-windows.ps1" -Slot 1 -ExpectedGeneration 2
echo.
pause
