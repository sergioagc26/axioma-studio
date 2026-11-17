#!/usr/bin/env bash
# Deja lista una máquina Linux en la nube (p. ej. Claude Code en la web) para usar Axioma Studio
# sin instalar nada en el computador del cliente. Idempotente: se puede correr las veces que sea;
# lo que ya está instalado se salta. Uso: bash scripts/setup-nube.sh
#
# No instala lo que solo sirve en un computador propio: Ollama (IA local), avatares, voces IA
# locales (.venv-*), Homebrew. Ver docs/PRUEBA-NUBE.md.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Linux" ]; then
  echo "✗ Este script es solo para Linux. En Mac/Windows usa: npm run setup" >&2; exit 1
fi

need() { command -v "$1" >/dev/null 2>&1; }
paso() { echo; echo "▸ $1"; }
t0=$(date +%s)

# 1. Node 20+
if ! need node || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "✗ Falta Node.js 20 o superior en esta máquina." >&2; exit 1
fi

# 2. Programas del sistema: FFmpeg, herramientas para compilar whisper.cpp y la voz del sistema.
faltan=()
need ffmpeg   || faltan+=(ffmpeg)
need ffprobe  || faltan+=(ffmpeg)
need cmake    || faltan+=(cmake)
need make     || faltan+=(make)
need g++      || faltan+=(g++)
need espeak-ng || faltan+=(espeak-ng)
if [ ${#faltan[@]} -gt 0 ]; then
  paso "Instalando con apt: ${faltan[*]}"
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get install -y "${faltan[@]}" || { $SUDO apt-get update -qq && $SUDO apt-get install -y "${faltan[@]}"; }
fi

# 3. Dependencias de Node (solo si faltan o cambió el package-lock).
sello="node_modules/.axioma-lock"
if [ ! -d node_modules ] || ! cmp -s package-lock.json "$sello" 2>/dev/null; then
  paso "Instalando dependencias (npm ci)…"
  npm ci --no-fund --no-audit
  cp package-lock.json "$sello"
fi

# 4. Interfaz (Studio).
if [ ! -f packages/studio/dist/index.html ]; then
  paso "Compilando Studio…"
  npm run build:studio
fi

# 5. whisper.cpp (se compila en .whisper/) y su modelo. Ya instalado → no hace nada.
paso "Revisando whisper.cpp y su modelo…"
npm run se -- setup

# 6. Navegador de Remotion para exportar (≈100 MB, solo la primera vez).
paso "Revisando el navegador de Remotion…"
npx remotion browser ensure

# 7. Plugin de Claude (servidor MCP) y carpeta de trabajo.
paso "Conectando el plugin de Claude…"
npm run se -- instalar-claude
mkdir -p "${SE_WORKSPACE:-workspace}"

# La IA local (Ollama) no existe en la nube: sin esto, cada edición espera ~20 s a que abra.
# (Aviso solamente; ver docs/PRUEBA-NUBE.md.)

paso "Revisión final"
npm run se -- doctor || true
echo
echo "✓ Máquina lista en $(( $(date +%s) - t0 )) s."
echo "⚠ Exportar necesita que el navegador de Remotion pueda bajar las fuentes de Google."
echo "  En algunas máquinas en la nube eso falla (certificado del proxy). Ver docs/PRUEBA-NUBE.md."
