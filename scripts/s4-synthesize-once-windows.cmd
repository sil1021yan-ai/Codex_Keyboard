@echo off
rem One real TTS attempt for slot 4, generation 1 only.
rem The PowerShell script verifies the current summary and creates an atomic
rem attempt marker before any cloud request. Never rerun after an error.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0synthesize-once-windows.ps1" -Slot 4 -ExpectedGeneration 1
echo.
pause
