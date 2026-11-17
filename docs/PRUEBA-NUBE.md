# Prueba: Axioma Studio en una máquina de Claude en la nube

**Fecha:** 17 nov 2026 · **Máquina:** Claude Code en la web (contenedor Linux, Ubuntu 24.04)
**Objetivo:** saber si la app corre *tal cual* en la nube, sin instalar nada en el computador del cliente. Esto es una medición, no un rediseño.

## Veredicto corto

**Sí, con el arreglo de fuentes ya aplicado.** Todo el motor funciona en la nube (instalación, transcripción, cortes, edición, MCP). En la prueba original lo único que falló fue exportar: Remotion bajaba las fuentes de Google en cada render y aquí su navegador no acepta el certificado de la salida a internet.

> **Actualización:** las tipografías ya viven dentro de la app (`packages/remotion/src/fonts/`, 3 MB). Exportar ya no necesita internet: el pedido hablado se volvió a exportar en esta misma máquina, sin ningún parche, y salió idéntico.

| Parte | Resultado |
|---|---|
| Instalar (npm, ffmpeg, whisper.cpp + modelo, Studio) | ✅ Funciona, ~3 min la primera vez |
| `doctor` | ✅ Todo en verde (opcionales en aviso) |
| Pedido hablado (preparar → transcribir → cortar con guion → editar) | ✅ Funciona |
| Pedido montaje (3 clips + música) | ✅ Funciona, también con clips sin pista de audio |
| Exportar con Remotion | ✅ Con las fuentes dentro de la app (antes ❌ por las fuentes de Google) |
| Herramientas MCP (`estado_sistema`, `leer_pedidos`) | ✅ Responden (106 herramientas) |

---

## 1. Instalación desde cero (tiempos medidos)

| Paso | Comando | Tiempo | Notas |
|---|---|---|---|
| Dependencias de Node | `npm ci` | 38 s | 1,8 GB en `node_modules` |
| FFmpeg | `apt-get install ffmpeg` | 0 s | Ya venía instalado (6.1.1). También cmake, make y g++ |
| Voz del sistema (Linux) | `apt-get install espeak-ng` | 8 s | Es la "voz del computador" en Linux |
| Interfaz (Studio) | `npm run build:studio` | 6 s | |
| whisper.cpp 1.9.5 + modelo `small` | `npm run se -- setup` | 106 s | Compila en `.whisper/` (121 MB) + modelo (466 MB) |
| Plugin de Claude | `npm run se -- instalar-claude` | <2 s | Crea `plugin/.mcp.json` |
| Navegador de Remotion | (se baja solo en el primer render) | ~5 s | Chrome Headless Shell, 102 MB, bajó sin problema |
| Modelo de visión (CLIP) | (se baja solo en el primer pedido) | ~5 s | ~150 MB en `.modelos/` |
| Revisión | `npx tsx packages/engine/src/cli.ts doctor` | 26 s | 20 s son la espera a Ollama (ver límites) |

**Total primera vez: ~3 min.** Se saltó lo que es solo de Mac/PC propio: Homebrew, Ollama, avatares (SadTalker), generador de imágenes local (mflux, solo Apple Silicon), voces IA locales (`.venv-*`).

Salida de `doctor`:

```
✓ Node.js: 22.23.4
✓ ffmpeg: ffmpeg version 6.1.1-3ubuntu5
✓ ffprobe: ffprobe version 6.1.1-3ubuntu5
✓ whisper.cpp: .../.whisper/whisper.cpp-1.9.5/build/bin/whisper-cli
✓ Modelo Whisper (small): ok
✓ Memoria RAM: 16 GB
✓ Espacio libre: 27 GB
✓ Studio compilado: ok
✓ Plugin de Claude conectado: ok
✓ Clave de videos de stock (opcional: Pexels o Pixabay): sin clave: usa b-roll de archivos locales
✓ IA local (opcional: Ollama): no está abierta: sin Claude, la edición por chat no funciona
✓ Bajar referencias desde un link (opcional: yt-dlp): no instalado: solo se pueden subir archivos
✓ Voz IA natural (opcional: Qwen local o ElevenLabs): solo la voz del computador (más robótica)
✓ IA que mira las tomas (opcional): sin modelo de visión: la sincronía usa el modelo CLIP (menos preciso)
✓ Claude (opcional: escribe los mejores guiones): instalado (conéctalo con tu cuenta para usarlo)
```

## 2. Material de prueba

> ⚠ **Es sintético.** No había forma de conseguir un video real de una persona hablando dentro de la máquina.

- **Pedido "reel-hablado":** voz en español generada con espeak-ng (52 s, 8 frases sobre ofertas) sobre un fondo de barras de color de ffmpeg a 1080×1920, con `pedido.txt` (marca, duración 40 s, ritmo dinámico, llamado a la acción) y `guion.txt` con el texto exacto.
- **Pedido "montaje-clips":** 3 clips de 6 s sin voz (fractal, "juego de la vida", degradado en movimiento) a 1080×1920, una música generada de 20 s (`musica.mp3`) y un `pedido.txt`.

## 3. Prueba de punta a punta (`makeOrder`, sin Claude)

Con `SE_WORKSPACE` en una carpeta temporal y un script `npx tsx` que llama `makeOrder` y mide cada mensaje de progreso.

### Pedido hablado — 52 s de grabación → reel de 36 s

| Fase | Tiempo |
|---|---|
| Preparar (master de edición + proxy + cara + "qué se ve" + limpiar voz) | 56 s |
| Transcribir (whisper.cpp `small`, CPU) | 17 s |
| Cortar con el guion | <1 s (9 de 9 frases encontradas) |
| Editar (brief, gancho, textos, gráficos, transiciones) | 20 s ← casi todo era la espera a Ollama (ya resuelto: <0,5 s) |
| Exportar con Remotion | 159 s |
| **Total** | **4 min 12 s** |

Resultado: `Listos/reel-hablado.mp4` · **1080×1920, H.264 + AAC, 30 fps, 35,8 s, 32 MB.** Transcripción casi perfecta (errores menores por la voz robótica: "hablan entregables", "subida" en vez de "su vida").

### Pedido montaje — 3 clips (18 s) + música → reel de 17 s

| Fase | Tiempo |
|---|---|
| Escuchar si los clips tienen voz | 17 s |
| Preparar (montaje + proxy + cara + "qué se ve") | 26 s |
| Editar | 20 s ← espera a Ollama (ya resuelto: <0,5 s) |
| Exportar con Remotion | 92 s |
| **Total** | **2 min 36 s** |

Resultado: `Listos/montaje-clips.mp4` · **1080×1920, H.264 + AAC, 17,3 s, 71 MB**, 9 cortes, la música del cliente, gancho en pantalla.

### Fotogramas revisados

- Hablado, segundo 2: gancho "SOY **SERGIO** Y HOY" grande arriba y subtítulo "VOY A **CONTAR**" con la palabra clave en color. Bien encuadrado.
- Hablado, segundo 20: subtítulo "HABLAN DE **TRANSFORMACIÓN**". Correcto.
- Montaje, segundo 1: título "**MONTAJE** de fondos con música" sobre el fractal. Correcto.
- Montaje, segundo 9: degradado con la barra de progreso arriba. Correcto.

**Exportar ocupa ~60 % del tiempo total.** En esta máquina (4 núcleos, sin GPU) el render va a unas **4–5× la duración del video** (36 s de reel ≈ 2,5 min).

## 4. Herramientas MCP

Arrancado exactamente como dice `plugin/.mcp.json` (`node packages/mcp/bin/server.mjs` con `SE_FFMPEG`, `SE_FFPROBE` y `PATH`) y probado por JSON-RPC:

- Arranca en 1,6 s y expone **106 herramientas**.
- `estado_sistema` ✅ devuelve lo mismo que `doctor` (tarda 20 s por la espera a Ollama).
- `leer_pedidos` ✅ instantáneo: lista los dos pedidos como "listo", con sus archivos (videos, pedido, guion, música) y lo que pide cada uno.

## 5. Límites y errores encontrados

### Máquina

| | |
|---|---|
| CPU | 4 núcleos Intel Xeon 2,1 GHz |
| RAM | 15–16 GB |
| GPU | No hay |
| Disco libre | ~30 GB al empezar (es un cupo fijo por sesión) |
| Ocupa la app instalada | ~2,8 GB (`node_modules` 2,1 GB + whisper 0,6 GB + modelos 0,15 GB) |
| Ocupan los 2 pedidos de prueba | ~0,5 GB (master, proxy, audios) + 103 MB en `Listos/` |
| Chromium de Remotion | Se bajó y abrió sin problema |

**Tamaño práctico de archivo (estimación, no medido con videos reales):** con ~27 GB útiles, el disco no es el límite para reels de 1–3 min. El límite real será **cómo sube el cliente su video y cómo descarga el resultado** (ver "qué falta"), y el tiempo: un video de 3 min tardaría ~12–15 min en procesar.

### ✅ Bloqueo 1 (resuelto) — Exportar fallaba por las fuentes de Google

- **Qué pasa:** la plantilla de Remotion carga ~80 tipografías con `@remotion/google-fonts`, que las baja de `fonts.gstatic.com` *durante el render*. Remotion abre su navegador saltándose el proxy de la máquina (`--no-proxy-server`); la salida directa a internet presenta un certificado de la propia nube que ese navegador no reconoce → `ERR_CERT_AUTHORITY_INVALID` → el render se queda esperando la fuente "Sora" y se cae a los 58 s.
- **Cómo lo comprobé:** para terminar la prueba hice un arreglo **temporal y no subido**: un mini-servidor local que entrega las fuentes pasando por el proxy oficial, y apunté las fuentes ahí. Con eso los dos videos se exportaron perfecto. No desactivé la verificación de certificados ni toqué la confianza de la máquina.
- **Arreglo recomendado (en la app):** llevar las tipografías *dentro* de la app (archivos `.woff2` en el repo, cargados con `staticFile`) en vez de bajarlas en cada render. Así exportar no necesita internet, y además es más rápido y más robusto también en Mac/PC.
- **Hecho:** las 80 tipografías (125 archivos `.woff2`, 3 MB) están en `packages/remotion/src/fonts/files/` y se cargan desde ahí, tanto al exportar como en Studio. La lista vive en `fonts/spec.ts`; si se cambia, `npm run fuentes` baja los archivos y regenera el índice. Un test comprueba que cada letra elegible tenga sus archivos y que la plantilla no vuelva a usar Google Fonts. Pendiente menor: el manual de marca (`brandbook.ts`) aún pide sus letras a Google.
- **Alternativa (en la máquina, no en la app):** que el entorno de la nube agregue su certificado de salida al almacén del navegador. No lo pude probar (requiere un permiso que esta sesión no tenía) y depende de cada entorno: no lo recomiendo como solución de producto.

### ✅ Fallo 2 (resuelto) — Clips sin pista de audio rompían el pedido (no era de la nube)

Si un clip **no traía pista de audio** (grabaciones de pantalla, stock, clips generados), el motor no podía "escucharlo", lo trataba como hablado y el nivelador de voz (`loudnorm`) se caía con `Value -inf for parameter 'measured_I'`. Pasaba igual en Mac.

**Arreglado:** un clip sin pista de audio ahora cuenta como "sin voz" (sin gastar tiempo en transcribirlo), un solo video sin audio va directo a montaje, y limpiar la voz o nivelar la mezcla ya no fallan si el audio es silencio total. Probado con el pedido original de 3 clips mudos + música: sale como montaje en 2 min 40 s, y la fase "revisar lo que grabaste" pasó de 17 s a 0,3 s. Un test (`packages/engine/test/clips-sin-audio.test.ts`) cubre los tres casos.

### ✅ Lentitud 3 (resuelta) — 20 s perdidos esperando a Ollama

En la nube no hay IA local, pero el motor intentaba abrir Ollama y esperaba 20 s (40 intentos × 0,5 s) antes de seguir sin ella: en `doctor`, en `estado_sistema` y en la fase "Editar" de cada pedido.

**Arreglado:** si Ollama no está instalado, el motor lo sabe al instante y sigue sin esperar. Además, `AXIOMA_SIN_IA_LOCAL=1` la desactiva del todo (útil en la nube aunque alguien la instale). En un computador con Ollama instalado no cambia nada: sigue abriéndolo si está cerrado. Medido aquí: fase "Editar" de 20 s → <0,5 s; `estado_sistema` de 20 s → 0,1 s; `doctor` de 26 s → 8 s; pedido hablado completo de 4 min 37 s → 3 min 42 s. Test: `packages/engine/test/ollama-ausente.test.ts`.

### Avisos sin importancia

- Remotion avisa "Detected differing memory amounts" (el contenedor reporta memoria rara). Usa el valor correcto y sigue.
- npm avisa que hay una versión nueva. Sin efecto.

## 6. Qué funciones no sirven sin instalar nada (modo nube)

| Función | En la nube | Por qué / alternativa |
|---|---|---|
| Ganchos, títulos y guiones con IA local (Ollama) | ❌ | No hay Ollama ni GPU. En modo nube, **Claude** hace ese trabajo por MCP (es la idea del modo) |
| Edición por chat dentro de Studio | ❌ | Depende de Ollama (lo dice el propio `doctor`) |
| IA que mira las tomas (modelo de visión de Ollama) | ⚠ Parcial | Queda el modelo CLIP, menos preciso |
| Avatares (SadTalker) | ❌ | Instalación local pesada; no se probó |
| Generador de imágenes local (mflux) | ❌ | Solo Mac con Apple Silicon |
| Voz IA natural local (Qwen, `.venv-*`) | ❌ | Queda espeak-ng (robótica) o ElevenLabs con clave |
| Música automática (Freesound) y stock (Pexels/Pixabay) | ⚠ Con clave | Necesitan su clave API; sin ella, solo la música/videos que traiga el cliente |
| Bajar referencias desde un link (yt-dlp) | ⚠ No probado | No viene instalado; depende de qué sitios deje salir la red de la nube |
| Studio (interfaz web) | ⚠ No probado | Corre en `localhost` de la máquina; el cliente no lo ve salvo que la app de Claude muestre la vista previa del puerto |
| Transcribir, cortar, subtítulos, gráficos, transiciones, efectos, exportar | ✅ | Funciona (exportar, con el arreglo de fuentes) |

## 7. Pasos exactos para dejar lista una máquina nueva

Automatizado en **`scripts/setup-nube.sh`** (solo Linux, idempotente: la segunda corrida no reinstala nada). Probado aquí: 63 s con whisper ya compilado; desde cero son ~3 min.

```bash
bash scripts/setup-nube.sh
```

Lo que hace, en orden:

1. Revisa que haya Node 20+.
2. Instala con `apt` lo que falte: `ffmpeg`, `cmake`, `make`, `g++`, `espeak-ng`.
3. `npm ci` (solo si falta `node_modules` o cambió el `package-lock.json`).
4. `npm run build:studio` (solo si no está compilado).
5. `npm run se -- setup` → compila whisper.cpp en `.whisper/` y baja el modelo `small`.
6. `npx remotion browser ensure` → baja el navegador de Remotion.
7. `npm run se -- instalar-claude` → crea `plugin/.mcp.json`; y crea la carpeta `workspace`.
8. `npm run se -- doctor`.


## 8. Qué falta para el modo nube

1. ~~**Fuentes dentro de la app**~~ ✅ hecho.
2. **Entrada y salida de archivos** (no probado, crítico para el producto): cómo sube el cliente sus videos a la máquina y cómo se lleva el MP4 final. Es el verdadero cuello de botella del modo nube; hay que definirlo y probarlo con videos reales de celular (1–3 min, 100–500 MB).
3. ~~**Modo "sin IA local"**~~ ✅ hecho.
4. ~~**Clips sin pista de audio**~~ ✅ hecho.
5. **Instalación automática por sesión**: cada sesión en la nube empieza limpia; conviene guardar `setup-nube.sh` como script de arranque del entorno para no gastar ~3 min (y créditos) cada vez.
6. Probar con un **video real** de una persona hablando (esta prueba usó voz sintética).
