#!/bin/bash
# Doble clic para instalar (o reparar) Axioma Studio en este Mac.
cd "$(dirname "$0")"
bash scripts/instalar-mac.sh
echo
read -r -p "Pulsa Enter para cerrar esta ventana. " _
