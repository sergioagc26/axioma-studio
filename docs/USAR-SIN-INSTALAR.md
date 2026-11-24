# Usar Axioma sin instalar nada en tu computador

Para quien quiere trabajar desde Claude pero **no quiere instalar la app localmente**. Hay tres vías. La app (cortes, transcripción, render) tiene que correr en *alguna* máquina; la pregunta es cuál.

| Vía | Dónde corre la app | Qué instala la persona | Alcance |
|---|---|---|---|
| 1. Usar el Mac de otra persona | Mac mini / Mac del dueño | Nada (solo un navegador) | Completo |
| 2. Claude Code en la nube | Contenedor Linux de Claude Code en la web | Nada en su computador | Casi completo |
| 3. Solo el chat de Claude | En ningún lado | Nada | Solo texto: guion, escaleta, revisión |

## Vía 1 · Entrar a la app de otro equipo desde el navegador

La app corre en un Mac (el del dueño o el Mac mini) y la persona solo abre un enlace.

1. En el Mac anfitrión: doble clic en **«Abrir Axioma Studio.command»** o `npm run studio:red`.
2. La ventana muestra un enlace `http://192.168.x.x:4747/?clave=…`. La persona lo abre en su navegador, en la misma red Wi-Fi.
3. Fuera de la red: instalar [Tailscale](https://tailscale.com/download) (gratis) en el Mac anfitrión y en el equipo de la persona, con la misma cuenta; la app muestra el enlace de Tailscale en Proyectos → **📱 Otros equipos**.

**Ojo**
- El Mac anfitrión debe estar encendido y con la app abierta.
- La clave está en `workspace/clave-red.txt`. Quien la tenga entra y ve todo el trabajo: se comparte solo con gente de confianza y se cambia borrando el archivo y reiniciando la app.
- Todo el material y los renders quedan en el Mac anfitrión.
- Verificado en la documentación y en el servidor local; falta probarlo desde un segundo dispositivo.

## Vía 2 · Claude Code en la nube (sin Mac propio)

La app se instala dentro de una máquina de Claude Code en la web (Linux). La prueba del 17 nov 2026 (ver [PRUEBA-NUBE.md](PRUEBA-NUBE.md)) mostró:

- Instalación completa en ~3 minutos (`npm ci` 38 s, whisper.cpp con modelo `small` 106 s).
- Transcripción, cortes, edición, montaje, exportación con las fuentes incluidas y las 106 herramientas MCP funcionan.

**Límites**
- No hay lo que es solo de Mac o de equipo propio: Ollama (IA local), avatares (SadTalker), generador de imágenes local (mflux) y voces IA locales.
- El material hay que subirlo a esa máquina; con videos pesados no está medido cuánto tarda ni cuánto cabe.
- La máquina es temporal: lo que importa se descarga al terminar.

**Pasos**
1. Abrir Claude Code en la web con el repositorio de la app.
2. Pedirle a Claude: «instala Axioma Studio» (skill `instalar-axioma`).
3. Subir los videos, pedir el reel con `/axioma` y descargar el MP4 final.

## Vía 3 · Solo el chat de Claude, sin la app

Con las skills de Claude (por ejemplo `crear-video`, `guion`, `brief`) se pueden preparar el guion, la escaleta, los textos en pantalla y la revisión con las reglas de edición. **No** corta, no transcribe ni renderiza: eso necesita la app corriendo en una de las vías anteriores.

## Cuál elegir

- ¿Trabaja con el dueño de la app y es de confianza? → **Vía 1**.
- ¿Trabaja por su cuenta y no tiene Mac? → **Vía 2**.
- ¿Solo necesita ideas y guiones? → **Vía 3**.
