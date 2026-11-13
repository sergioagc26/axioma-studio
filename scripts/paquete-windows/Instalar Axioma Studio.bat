@echo off
rem Doble clic para instalar Axioma Studio en este PC (o ponerlo al dia).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
pause
