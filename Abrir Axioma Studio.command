#!/bin/zsh
# Doble clic para abrir Axioma Studio en este Mac y dejarlo disponible para el portátil (misma Wi-Fi).
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run studio:red
