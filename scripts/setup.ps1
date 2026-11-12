# Setup para Windows 10/11. Uso (PowerShell): powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Need($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Need 'node')) { Write-Error 'Falta Node.js 20+. Instalalo con: winget install OpenJS.NodeJS.LTS' }
if (-not (Need 'ffmpeg') -or -not (Need 'ffprobe')) {
  if (Need 'winget') {
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    Write-Host 'FFmpeg instalado. Cierra y vuelve a abrir la terminal, y corre este script otra vez.'
    exit 0
  } else { Write-Error 'Falta FFmpeg. Instalalo desde https://www.gyan.dev/ffmpeg/builds/' }
}

npm install
npm run se -- setup
npm run se -- instalar-claude
New-Item -ItemType Directory -Force -Path workspace | Out-Null
npm run se -- doctor
