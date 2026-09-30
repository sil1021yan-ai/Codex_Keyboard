@echo off
rem One real TTS attempt for the confirmed S3 task, generation 1 only.
rem The PowerShell script checks the current summary and creates an atomic
rem attempt marker before any cloud request. Never run a second time on error.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0synthesize-once-windows.ps1" -Slot 3 -ExpectedGeneration 1 -ExpectedTaskId "01a0e02a-e727-7043-b80f-fa553cbd498c"
echo.
pause
