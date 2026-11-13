@echo off
rem Doble clic para abrir Axioma Studio. Si ya esta abierta, solo abre el navegador.
cd /d "%~dp0"
curl -s -o nul --max-time 2 http://127.0.0.1:4747/ && (start "" http://127.0.0.1:4747/ & exit /b 0)
if not exist node_modules (echo Falta instalar la app: abre "Instalar Axioma Studio.bat". & pause & exit /b 1)
echo Abriendo Axioma Studio... (cierra esta ventana para apagarla)
npm run studio:red
