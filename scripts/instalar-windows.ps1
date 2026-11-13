# Instalación de Axioma Studio en Windows 10/11, de principio a fin. Se puede repetir:
# lo que ya está instalado se salta. La lanza «Instalar Axioma Studio.bat» (doble clic).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$Repo = (Get-Location).Path
New-Item -ItemType Directory -Force -Path (Join-Path $Repo 'workspace') | Out-Null
$Log = Join-Path $Repo 'workspace\instalacion.log'
'' | Set-Content $Log

function Paso($t) { Write-Host ''; Write-Host "> $t" -ForegroundColor Magenta }
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Info($t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Falla($t) {
  Write-Host ''; Write-Host "  X  $t" -ForegroundColor Red
  Write-Host '  El detalle quedo en workspace\instalacion.log. Puedes abrir el instalador otra vez: retoma donde quedo.' -ForegroundColor DarkGray
  Read-Host 'Pulsa Enter para cerrar'; exit 1
}
function Tiene($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
# Vuelve a leer el PATH del sistema: lo recien instalado se usa sin cerrar la ventana.
function RefrescarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Corre([string]$cmd) {
  cmd /c "$cmd >> `"$Log`" 2>&1"
  return $LASTEXITCODE -eq 0
}

Write-Host 'Axioma Studio - instalacion' -ForegroundColor White
Info 'Tarda entre 5 y 20 minutos la primera vez. Puedes dejarlo solo.'

Paso '1/5 - Instalador de programas (winget)'
if (-not (Tiene 'winget')) { Falla 'Falta winget. Instala «App Installer» desde Microsoft Store y abre este instalador otra vez.' }
Ok 'Listo.'

Paso '2/5 - Node y FFmpeg'
if (-not (Tiene 'node')) {
  Info 'Instalando Node.js...'
  if (-not (Corre 'winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements')) { Falla 'No se pudo instalar Node.js.' }
  RefrescarPath
}
if (-not (Tiene 'ffmpeg') -or -not (Tiene 'ffprobe')) {
  Info 'Instalando FFmpeg...'
  if (-not (Corre 'winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements')) { Falla 'No se pudo instalar FFmpeg.' }
  RefrescarPath
}
if (-not (Tiene 'node') -or -not (Tiene 'ffmpeg')) { Falla 'Node o FFmpeg no quedaron disponibles. Cierra esta ventana y abre el instalador otra vez.' }
Ok "Node $(node -v) y FFmpeg."

Paso '3/5 - IA local (opcional, unos 5 a 11 GB)'
if (Tiene 'ollama') { Ok 'Ollama ya esta.' }
else {
  $r = if ($env:AXIOMA_SIN_PREGUNTAS -eq '1') { 'n' } else { Read-Host '  ¿Instalar la IA local? [s/N]' }
  if ($r -match '^[sS]') {
    Info 'Instalando Ollama y el modelo (puede tardar)...'
    if ((Corre 'winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements')) {
      RefrescarPath; Start-Sleep 5
      if (Corre 'ollama pull qwen3:8b') { Ok 'IA local lista.' } else { Info 'No se pudo bajar el modelo; la app funciona igual.' }
      # Con 16 GB o mas, tambien la IA que ve imagenes (elige la tipografia de las referencias).
      $ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
      if ($ramGb -ge 15) { Info 'Bajando la IA que ve imagenes (6 GB)...'; if (Corre 'ollama pull qwen3-vl:8b') { Ok 'IA de vision lista.' } }
    } else { Info 'No se pudo instalar; la app funciona igual sin ella.' }
  } else { Info 'Saltado. La app funciona sin ella.' }
}

Paso '4/5 - Axioma Studio'
Info 'Dependencias...';            if (-not (Corre 'npm install')) { Falla 'Fallo «npm install».' }
Info 'Interfaz...';                if (-not (Corre 'npm run build:studio')) { Falla 'No se pudo compilar la interfaz.' }
Info 'Transcripcion (whisper)...'; if (-not (Corre 'npm run se -- setup')) { Falla 'No se pudo preparar whisper.' }
if (-not (Corre 'npm run se -- instalar-claude')) { Info 'Claude no quedo conectado; se puede hacer despues.' }
Corre 'npm run se -- doctor' | Out-Null
Ok 'Lista.'

Paso '5/5 - Acceso directo en el Escritorio'
$Desk = [Environment]::GetFolderPath('Desktop')
$Sh = New-Object -ComObject WScript.Shell
$Lnk = $Sh.CreateShortcut((Join-Path $Desk 'Axioma Studio.lnk'))
$Lnk.TargetPath = Join-Path $Repo 'Abrir Axioma Studio.bat'
$Lnk.WorkingDirectory = $Repo
$Lnk.Description = 'Abrir Axioma Studio'
$Lnk.Save()
Ok '«Axioma Studio» en el Escritorio. Doble clic para abrirla.'

Write-Host ''; Write-Host 'Listo. Abriendo Axioma Studio...' -ForegroundColor Green
if ($env:AXIOMA_NO_ABRIR -ne '1') { Start-Process (Join-Path $Repo 'Abrir Axioma Studio.bat') }
