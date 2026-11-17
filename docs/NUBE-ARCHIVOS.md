# Nube: cómo entra el material y cómo sale el video

Medición del 17-11-2026 en una máquina de Claude Code en la web (la de `docs/PRUEBA-NUBE.md`).
Objetivo: saber cómo **entran** los videos del cliente (100–500 MB, de celular) y cómo **sale** el
MP4 terminado (20–100 MB) cuando el cliente usa Axioma Studio «sin instalar nada».
Solo se usó material de dominio público y videos sintéticos (`testsrc2`), nunca material de nadie.

## Cómo es la red de esta máquina

- Toda la salida HTTPS pasa por un **proxy de la sesión** (`HTTPS_PROXY=127.0.0.1:…`). curl, git y
  npm lo usan solos. En esta sesión no filtra por dominio (`selective: false`): todos los sitios
  probados abrieron el túnel.
- La IP de salida es **compartida** con otras máquinas en la nube. Por eso algunos sitios la
  limitan (ver Wikimedia).
- `bash scripts/setup-nube.sh` dejó la app lista en **168 s** (Node 22, ffmpeg 6.1, whisper.cpp
  compilado, Studio compilado, 16 GB de RAM, 27 GB libres).

## Entrada (cliente → máquina)

`curl -I` a la raíz de cada dominio. Un 404/302/301 significa que **se llega** al servidor; el
código lo pone el sitio, no el proxy.

| Opción | ¿Se llega? (`curl -I`) | Prueba real | Velocidad | Límites | Privacidad |
|---|---|---|---|---|---|
| Google Drive (`drive.google.com`, `drive.usercontent.google.com`) | Sí (302 / 404) | No medida: no había un video público de prueba | — | El archivo tiene que ser «Cualquier persona con el enlace». Drive no baja carpetas: un enlace por video. Drive puede cortar archivos muy bajados (cuota de descargas). | El enlace queda abierto mientras no se cambie el permiso. |
| Dropbox (`www.dropbox.com`, `dl.dropboxusercontent.com`) | Sí (200 / 404) | No medida | — | Baja archivo o carpeta entera (.zip, la app la descomprime). | Igual: enlace público mientras exista. |
| Enlace directo (archive.org) | Sí | **Sí**, con `fetchToOrder` de la app: video de dominio público de **172 MB** (`DuckandC1951_edit.mp4`, Prelinger, archive.org) | **61 s → 2,8 MB/s** | — | Depende del sitio. |
| Wikimedia Commons (`upload.wikimedia.org`) | Sí (301) | **Falla**: responde `429 Too many requests` con `retry-after: 600` a cualquier user-agent | — | Limita la IP compartida de la nube. | — |

**Estimación** con los 2,8 MB/s medidos (puede variar con Drive/Dropbox): un video de 100 MB entra
en ~35 s, uno de 500 MB en ~3 min.

Hallazgo para `enlaces.ts` (hecho, no hipótesis; **ya corregido**, ver abajo): cuando un sitio responde 429 con
`retry-after: 600`, el `--retry 2` de curl espera **10 min por intento** sin escribir nada; la
primera prueba quedó colgada más de 10 min. Conviene limitarlo (p. ej. `--retry-max-time 60`) y
mostrar un error claro («el sitio está limitando las descargas, prueba con Drive o Dropbox»).

## Salida (máquina → cliente)

Se usó un MP4 sintético de 30 MB (1280×720, `testsrc2`) y otro de 95 MB para el límite.

| Opción | ¿Funciona? | Velocidad | Límites | Privacidad | Para el cliente |
|---|---|---|---|---|---|
| **Adjunto de la sesión** (Claude envía el archivo a la conversación) | **Sí**: 30 MB y 95 MB entregados sin error | Inmediato | No se vio límite hasta 95 MB. **Confirmado por el dueño (17-11-2026):** los dos videos (30 y 95 MB) se ven bien. | Queda en la conversación del cliente, privada. | Lo más simple: aparece en el chat. |
| **Git** (commit del MP4 a una rama y push) | Sí | 30 MB en **5,9 s (~5 MB/s)** | Sin avisos con 30 MB. GitHub avisa desde 50 MB y **rechaza archivos de más de 100 MB**. Cada video queda en el historial para siempre (el repo crece). El proxy **no deja borrar ramas** remotas (`git push --delete` se corta). | El repo es privado (404 sin sesión): solo lo ve quien tenga acceso al repo. | Malo: el cliente necesita acceso al repo de GitHub. |
| **Releases de GitHub** | **No** | — | `gh` está instalado pero su token (`GH_TOKEN`) es inválido; en esta sesión `gh` solo se permite para búsquedas y las herramientas de GitHub disponibles no crean releases ni suben archivos a un release. No se probó por otra vía para no pedir permisos nuevos. | — | — |
| **Almacenamiento privado** (solo `curl -I`, sin subir nada) | La red llega a todos | — | `s3.amazonaws.com` 405, `content.dropboxapi.com` 404, `www.googleapis.com` 404 (responde el servidor). `example.r2.cloudflarestorage.com`: el proxy abre el túnel pero Cloudflare corta el TLS porque esa cuenta no existe; con una cuenta R2 real debería responder (hipótesis). | Privado si se usa enlace firmado con vencimiento. | Requiere guardar una clave en la sesión (no se probó). |
| Vista previa de un puerto | Desconocido | — | La sesión puede avisar a la app qué puerto mirar, pero **desde dentro no se puede saber** si la persona puede bajar un archivo por ahí. | — | Sin verificar. |
| Artefactos de claude.ai | No sirve para el video | — | Máximo 15 MB por archivo binario. | — | Sirve solo para una vista previa liviana. |

## Recomendación: cómo entregar el video

1. **Ahora (cero configuración): adjunto de la sesión.** Al terminar, Claude envía el MP4 a la
   conversación y el cliente lo baja desde ahí. Funcionó hasta 95 MB, cubre los 20–100 MB que
   salen de la app y queda privado en la conversación del cliente.
   ✅ **Confirmado por el dueño: es el camino oficial.** Las herramientas `hacer_video` y
   `entregar_video` ahora se lo recuerdan a Claude cuando corren en la nube
   (`CLAUDE_CODE_REMOTE=true`): «envíale este MP4 como archivo adjunto en el chat».
2. **Si el adjunto falla o hace falta un enlace para compartir:** subir a almacenamiento propio
   (Cloudflare R2 o S3) con un enlace firmado que venza en 7 días. La red lo permite; hace falta
   crear la cuenta, guardar la clave como secreto del entorno y agregar a la app un paso «subir y
   dar enlace». Es más trabajo: no construirlo hasta que el paso 1 falle.
3. **No usar git ni releases** para entregar videos: pide acceso al repo, se rompe con archivos de
   más de 100 MB, llena el historial y en esta sesión no se pueden borrar ramas ni crear releases.

Para la entrada, seguir con **enlace de Google Drive o Dropbox** (`fetchToOrder`), que ya existe y
llega bien. Falta medir una bajada real desde Drive y Dropbox con un archivo de prueba propio del
dueño (no se tenía uno público).

## Pendiente de limpieza

- La rama remota `prueba-salida-tmp` **no se pudo borrar** desde la sesión (el proxy corta el
  borrado). Se la dejó apuntando a un commit viejo de `main`, así que ya **no contiene el MP4**,
  pero hay que borrarla a mano en GitHub (Branches › `prueba-salida-tmp` › borrar).

## Corrección aplicada

`fetchToOrder` ahora usa `--retry-max-time 60`: si un sitio pide esperar más, curl no reintenta y
la app responde en segundos «El sitio está limitando las descargas desde esta máquina: sube el
video a Google Drive o Dropbox y comparte ese enlace». Prueba nueva en
`packages/engine/test/enlaces.test.ts` (429 con `Retry-After: 600`); falla con el código anterior.
