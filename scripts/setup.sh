#!/usr/bin/env bash
# Setup para macOS / Linux. Uso: bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1; }

if ! need node; then echo "✗ Falta Node.js 20+. Instálalo desde https://nodejs.org" >&2; exit 1; fi
if ! need ffmpeg || ! need ffprobe; then
  if need brew; then brew install ffmpeg; else echo "✗ Falta FFmpeg. Instala Homebrew (https://brew.sh) y corre: brew install ffmpeg" >&2; exit 1; fi
fi
if ! need cmake; then
  if need brew; then brew install cmake; else echo "✗ Falta cmake: brew install cmake" >&2; exit 1; fi
fi
if ! need make || ! need cc; then
  echo "✗ Faltan las herramientas de compilación. Corre: xcode-select --install" >&2; exit 1
fi

npm install
npm run se -- setup
npm run se -- instalar-claude
mkdir -p workspace
npm run se -- doctor
