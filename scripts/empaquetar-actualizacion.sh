#!/bin/bash
# Arma el archivo de actualización (.zip) con la versión actual de la app, para mandarlo a otra
# persona que no usa GitHub: lo sube en Proyectos › Ajustes › «Actualizar desde archivo».
# Solo lleva el código (lo que está en git): nada de proyectos, claves ni modelos.
set -e
cd "$(dirname "$0")/.."
HASH=$(git rev-parse --short HEAD)
OUT="${1:-$HOME/Downloads}/Axioma-Studio-actualizacion-$(date +%Y-%m-%d)-$HASH.zip"
git archive --format=zip -o "$OUT" HEAD
echo "Listo: $OUT"
