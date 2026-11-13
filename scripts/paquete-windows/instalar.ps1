# Axioma Studio para Windows: baja la app desde tu repositorio privado de GitHub y la instala.
# Se puede repetir: si ya está instalada, la pone al día y repara lo que falte.
$ErrorActionPreference = 'Stop'
$RepoUrl = 'https://github.com/sergioagc26/axioma-studio.git'
$Destino = if ($env:AXIOMA_CARPETA) { $env:AXIOMA_CARPETA } else { Join-Path $env:USERPROFILE 'Axioma Studio' }

function Paso($t) { Write-Host ''; Write-Host "> $t" -ForegroundColor Magenta }
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Info($t) { Write-Host "  $t" -ForegroundColor DarkGray }
function Falla($t) { Write-Host ''; Write-Host "  X  $t" -ForegroundColor Red; Read-Host 'Pulsa Enter para cerrar'; exit 1 }
function Tiene($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefrescarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

Write-Host 'Axioma Studio para Windows' -ForegroundColor White
Info "Se instala en: $Destino"
Info 'Tarda entre 10 y 30 minutos la primera vez. Puedes dejarlo solo salvo cuando te pida iniciar sesion en GitHub.'

Paso 'Instalador de programas (winget)'
if (-not (Tiene 'winget')) { Falla 'Falta winget. Instala «App Installer» desde Microsoft Store y abre este instalador otra vez.' }
Ok 'Listo.'

Paso 'Git (para bajar la app y sus actualizaciones)'
if (-not (Tiene 'git')) {
  Info 'Instalando Git...'
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements | Out-Null
  RefrescarPath
  foreach ($p in @("$env:ProgramFiles\Git\cmd", "${env:ProgramFiles(x86)}\Git\cmd")) { if (Test-Path "$p\git.exe") { $env:Path += ";$p" } }
}
if (-not (Tiene 'git')) { Falla 'Git no quedo disponible. Cierra esta ventana y abre el instalador otra vez.' }
Ok (git --version)

Paso 'Bajando Axioma Studio desde tu GitHub privado'
if (Test-Path (Join-Path $Destino '.git')) {
  Info 'Ya estaba: poniendola al dia...'
  git -C "$Destino" pull --ff-only
  if ($LASTEXITCODE -ne 0) { Falla 'No se pudo poner al dia. Revisa tu internet y abre el instalador otra vez.' }
} else {
  Info 'Se abrira una ventana para iniciar sesion en GitHub (cuenta sergioagc26): pulsa «Sign in with your browser» y acepta.'
  git clone $RepoUrl "$Destino"
  if ($LASTEXITCODE -ne 0) { Falla 'No se pudo bajar la app. Inicia sesion en GitHub con la cuenta sergioagc26 cuando te lo pida y abre el instalador otra vez.' }
}
Ok 'Codigo de la app listo.'

# Claves de servicios (Pixabay, Freesound, ElevenLabs): si vienen junto al instalador, se copian.
$Claves = Join-Path $PSScriptRoot 'claves.env'
if ((Test-Path $Claves) -and -not (Test-Path (Join-Path $Destino '.env'))) { Copy-Item $Claves (Join-Path $Destino '.env'); Ok 'Claves de servicios copiadas.' }

# Tu trabajo (clientes, proyectos, marcas, musica, calendario) desde la copia de seguridad de iCloud.
$Copia = @("$env:USERPROFILE\iCloudDrive\Axioma Studio · copia de seguridad", "$env:USERPROFILE\iCloud Drive\Axioma Studio · copia de seguridad") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Copia) {
  Paso 'Tu trabajo desde iCloud'
  $r = if ($env:AXIOMA_SIN_PREGUNTAS -eq '1') { 'n' } else { Read-Host '  Encontre tu copia de seguridad en iCloud. ¿Traer tus clientes y proyectos a este PC? (unos 8 GB) [S/n]' }
  if ($r -notmatch '^[nN]') {
    Info 'Copiando (si iCloud tiene los archivos solo en la nube, primero los baja)...'
    robocopy "$Copia" (Join-Path $Destino 'workspace') /E /XO /XF fuentes-del-sistema.json /R:2 /W:5 /NFL /NDL /NJH /NP | Out-Null
    if ($LASTEXITCODE -lt 8) { Ok 'Tu trabajo quedo en la app.' } else { Info 'No se copio todo; puedes abrir el instalador otra vez para terminar.' }
  } else { Info 'Saltado.' }
} else {
  Info 'No encontre la copia de iCloud en este PC (instala «iCloud para Windows» si quieres traer tus proyectos). La app funciona igual.'
}

Paso 'Instalando todo lo demas (Node, FFmpeg, IA local, transcripcion)'
& (Join-Path $Destino 'scripts\instalar-windows.ps1')
