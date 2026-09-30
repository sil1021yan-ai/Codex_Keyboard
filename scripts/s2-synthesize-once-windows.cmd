@echo off
rem One real TTS attempt for the confirmed S2 task, generation 1 only.
rem The PowerShell script checks the current summary and creates an atomic
rem attempt marker before any cloud request. Never run a second time on error.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0synthesize-once-windows.ps1" -Slot 2 -ExpectedGeneration 1 -ExpectedTaskId "01a0e95d-147f-7bb0-bb87-9d6f27b75dcc"
echo.
pause
