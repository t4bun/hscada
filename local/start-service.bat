@echo off
cd /d "%~dp0"
if not exist "%ProgramData%\ScadaT4bun" mkdir "%ProgramData%\ScadaT4bun"
"%~dp0python\python.exe" "%~dp0launcher.py" --service >> "%ProgramData%\ScadaT4bun\service.log" 2>&1
