#!/bin/bash
# Instalación de Axioma Studio en un Mac, de principio a fin. Se puede repetir sin problema:
# lo que ya está instalado se salta. La lanza «Instalar Axioma Studio.command» (doble clic).
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
LOG="$REPO/workspace/instalacion.log"
mkdir -p "$REPO/workspace"
: > "$LOG"

rosa=$'\033[38;5;204m'; verde=$'\033[32m'; gris=$'\033[90m'; neg=$'\033[1m'; fin=$'\033[0m'
paso() { echo; echo "${rosa}${neg}▸ $1${fin}"; }
ok() { echo "  ${verde}✓${fin} $1"; }
info() { echo "  ${gris}$1${fin}"; }
falla() {
  echo; echo "  ✗ $1"
  echo "  ${gris}El detalle quedó en workspace/instalacion.log. Puedes volver a abrir el instalador: retoma donde quedó.${fin}"
  exit 1
}
# Corre un comando largo guardando su salida en el registro (en pantalla solo el resumen).
corre() { "$@" >>"$LOG" 2>&1; }
tiene() { command -v "$1" >/dev/null 2>&1; }

echo "${neg}Axioma Studio · instalación${fin}"
info "Tarda entre 5 y 20 minutos la primera vez (descarga y compila). Puedes dejarlo solo."

# 1. Herramientas de Apple (compilador). Abren su propia ventana de instalación.
paso "1/6 · Herramientas de Apple"
if xcode-select -p >/dev/null 2>&1; then ok "Ya están."
else
  info "Se abre una ventana de Apple: pulsa «Instalar» y espera a que termine."
  xcode-select --install >/dev/null 2>&1 || true
  until xcode-select -p >/dev/null 2>&1; do sleep 10; done
  ok "Instaladas."
fi

# 2. Homebrew (instalador oficial de brew.sh). Pide la contraseña del Mac: la escribes tú.
paso "2/6 · Homebrew (instalador de programas)"
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
if tiene brew; then ok "Ya está."
else
  info "Te va a pedir la contraseña de este Mac (no se ve al escribirla) y que pulses Enter."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || falla "No se pudo instalar Homebrew."
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  tiene brew || falla "Homebrew no quedó disponible."
  ok "Instalado."
fi

# 3. Node, FFmpeg y cmake.
paso "3/6 · Node, FFmpeg y cmake"
faltan=()
tiene node || faltan+=(node)
{ tiene ffmpeg && tiene ffprobe; } || faltan+=(ffmpeg)
tiene cmake || faltan+=(cmake)
if [ ${#faltan[@]} -eq 0 ]; then ok "Ya están ($(node -v), FFmpeg y cmake)."
else
  info "Instalando: ${faltan[*]}…"
  corre brew install "${faltan[@]}" || falla "No se pudo instalar ${faltan[*]}."
  ok "Instalados."
fi
v=$(node -p 'process.versions.node.split(".")[0]')
[ "$v" -ge 20 ] || { info "Node $v es viejo: actualizando…"; corre brew upgrade node || falla "No se pudo actualizar Node."; }

# 4. IA local (opcional, ~5 GB): editar por chat, ganchos y textos sin internet.
paso "4/6 · IA local (opcional)"
if tiene ollama; then
  ok "Ollama ya está."
  ollama list 2>/dev/null | grep -q '^qwen3:8b' && ok "Modelo qwen3:8b listo." || info "Falta el modelo: se descarga con «ollama pull qwen3:8b» cuando quieras."
else
  resp="n"
  if [ -t 0 ] && [ "${AXIOMA_SIN_PREGUNTAS:-}" != "1" ]; then
    read -r -p "  ¿Instalar la IA local? Ocupa unos 5 GB. [s/N] " resp
  fi
  if [[ "$resp" =~ ^[sS] ]]; then
    info "Instalando Ollama y el modelo (puede tardar)…"
    corre brew install ollama && corre brew services start ollama && sleep 3 && corre ollama pull qwen3:8b && ok "IA local lista." || info "No se pudo instalar la IA local; la app funciona igual sin ella."
  else
    info "Saltado. La app funciona sin ella (usa Claude si está conectado)."
  fi
fi

# 5. La app: dependencias, interfaz, whisper (transcripción) y conexión con Claude.
paso "5/6 · Axioma Studio"
info "Dependencias…";            corre npm install || falla "Falló «npm install»."
info "Interfaz…";                corre npm run build:studio || falla "No se pudo compilar la interfaz."
info "Transcripción (whisper)…"; corre npm run se -- setup || falla "No se pudo preparar whisper.cpp."
corre npm run se -- instalar-claude || info "Claude no quedó conectado; se puede hacer después."
corre npm run se -- doctor || true
ok "Lista."

# 6. Ícono en el Escritorio que abre la app.
paso "6/6 · Ícono en el Escritorio"
chmod +x "$REPO/Abrir Axioma Studio.command" "$REPO/Instalar Axioma Studio.command" 2>/dev/null || true
APP="$HOME/Desktop/Axioma Studio.app"
rm -rf "$APP"
esc=${REPO//\"/\\\"}
osacompile -o "$APP" -e "do shell script \"open \" & quoted form of \"$esc/Abrir Axioma Studio.command\"" >>"$LOG" 2>&1 || falla "No se pudo crear el ícono."
# Ícono propio si se pudo generar.
if [ -f "$REPO/scripts/icono/AxiomaStudio.icns" ]; then
  cp "$REPO/scripts/icono/AxiomaStudio.icns" "$APP/Contents/Resources/applet.icns" && touch "$APP"
fi
ok "«Axioma Studio» en el Escritorio. Doble clic para abrirla."

echo
echo "${verde}${neg}Listo.${fin} Abriendo Axioma Studio…"
[ "${AXIOMA_NO_ABRIR:-}" = "1" ] || open "$APP"
