@echo off
cd /d "%~dp0"
if not exist "%ProgramData%\NusaHMI" mkdir "%ProgramData%\NusaHMI"
"%~dp0python\python.exe" "%~dp0launcher.py" --service >> "%ProgramData%\NusaHMI\service.log" 2>&1
