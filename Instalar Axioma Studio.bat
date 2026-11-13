@echo off
rem Doble clic para instalar (o reparar) Axioma Studio en Windows.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\instalar-windows.ps1"
pause
