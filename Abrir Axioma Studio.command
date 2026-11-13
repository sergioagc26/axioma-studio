#!/bin/zsh
# Doble clic para abrir Axioma Studio en este Mac y dejarlo disponible para el portátil (misma Wi-Fi).
# Si ya está abierta, solo abre el navegador.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:4747/; then
  open http://127.0.0.1:4747/
  echo "Axioma Studio ya estaba abierta: abrí el navegador."
  exit 0
fi
if [ ! -d node_modules ]; then
  echo "Falta instalar la app: abre «Instalar Axioma Studio.command»."
  read -r "?Pulsa Enter para cerrar. " _
  exit 1
fi
echo "Abriendo Axioma Studio… (cierra esta ventana para apagarla)"
npm run studio:red
