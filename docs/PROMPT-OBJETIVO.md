# Prompt objetivo: construir SNZ Studio completo y funcional

> Copia todo lo que está debajo de la línea en una sesión nueva de Claude Code abierta en la carpeta `programa de edicion`.

---

## Rol y objetivo

Eres el desarrollador principal de **SNZ Studio** (nombre provisional, constante `APP_NAME`), un editor de reels e historias 9:16 con IA para videos hablando a cámara. Tu objetivo es dejar la aplicación **completa y funcional**: recibe un video grabado con el celular y entrega un reel editado listo para revisar y exportar en unos 10 minutos de trabajo humano.

Trabaja de forma autónoma, fase por fase, hasta cumplir **toda** la definición de terminado de abajo. No te detengas a pedir permiso entre pasos. Pregunta solo si una decisión es de verdad mía y no se puede resolver con el plan ni con un valor por defecto sensato.

## Contexto que ya existe (léelo antes de empezar)

- `README.md`: cómo funciona lo construido.
- Plan aprobado: `/Users/sergiog26/.claude/plans/crea-un-plan-completo-linked-rose.md` (6 fases).
- Mockups de las pantallas: https://claude.ai/artifact/WzpS5TPFnEqawDBu47SjRw. Son 5 pantallas, en tema oscuro y claro:
  - Brief con preguntas
  - Storyboard
  - Editor
  - Variantes de escena
  - Plantilla desde referencia
- Código hecho (commit `a224cda`, fases 0 y 1):
  - `packages/schema`: Project, Scene, Preset, BrandKit, `buildTimeline`.
  - `packages/engine`: CLI `se`, FFmpeg, whisper.cpp 1.9.5 con DTW (`-nfa`), silencios, `autoCut`, render.
  - `packages/remotion`: composición `Reel`.
- Referencia de producto: pocket-editor.com/acceso. Imita su idea (Claude como editor dentro de la app de escritorio de Claude, presets, presets desde referencias). No copies su marca, textos ni diseño.

## Decisiones fijas (no las cambies)

1. **El cerebro es Claude con mi suscripción**, mediante un servidor MCP local y skills de un plugin de Claude Code. **Nada de API de pago** en el flujo principal.
2. **Remotion** renderiza. FFmpeg y whisper.cpp hacen el resto, todo local y gratis.
3. **Mac y Windows.**
   - Rutas siempre con `path`.
   - Procesos con `spawn` sin shell.
   - Nada que dependa solo de macOS.
4. **`project.json` es la única fuente de verdad.**
   - Se valida con zod.
   - Se escribe de forma atómica.
   - Claude y el studio lo editan y se ven en vivo.
5. **Claude nunca recibe el video.** Recibe la transcripción compacta, los silencios y el análisis. Fotogramas solo para analizar referencias (6–10 como máximo). Ahorra tokens.
6. **Nada se publica sin aprobación.** El estado `aprobado` lo marco yo.
7. **Datos reales o marcadores.** Nunca inventes cifras, testimonios ni datos en motion graphics. Usa `[DATO]`.
8. **Licencias.**
   - Fuentes: solo Google Fonts o archivos que yo suba.
   - B-roll y música: con la licencia registrada por clip.

## Lo que falta construir (en este orden)

### Fase 2 · Cerebro Claude

`packages/mcp`: servidor MCP stdio con `@modelcontextprotocol/sdk` que expone el engine. Herramientas:
- Proyecto: `listar_proyectos`, `crear_proyecto`.
- Análisis: `transcribir`, `leer_transcripcion` (compacta), `aplicar_cortes`.
- Escenas: `armar_storyboard`, `editar_escena`, `reordenar_escenas`, `generar_variantes`, `elegir_variante`.
- Estilo: `aplicar_preset`, `guardar_preset`, `analizar_referencia`.
- Studio y salida: `leer_peticiones`, `responder_peticion`, `abrir_studio`, `renderizar`, `guardar_version`, `marcar_estado`.

Cada herramienta valida su entrada con zod y devuelve errores claros en español.

`plugin/`: plugin de Claude Code con `.mcp.json` y estas skills:
- `brief`: 5–7 preguntas. Se salta las que ya responde el kit del cliente.
- `editar-reel`: flujo completo.
  1. Elegir las mejores tomas.
  2. Dividir en escenas por rol (gancho, problema, beneficio, demostración, prueba, CTA).
  3. Escribir el texto en pantalla.
  4. Aplicar el preset.
  5. Abrir el studio.
- `variantes`: 4 opciones distintas por escena (texto con color, texto sobrio, b-roll, motion graphics).
- `crear-preset`: desde comentarios o desde una referencia.
- `reglas-edicion`:
  - gancho en los primeros 1,5 s;
  - zonas seguras de Instagram;
  - nada se publica sin aprobación.

**Terminado cuando:** en Claude escribo "edita este video para CRE", respondo el brief y recibo un storyboard coherente y un MP4 renderizado, sin tocar la terminal.

### Fase 3 · Studio

`packages/studio`: Vite + React + TypeScript, servido por el engine en `localhost`. Debe replicar los mockups:
- Las 5 pantallas.
- Temas oscuro y claro con los tokens (`#FE2C55`, `#25F4EE`, etc.).
- Vista previa con `@remotion/player` sobre el proxy.
- Storyboard arrastrable (dnd-kit) con la línea de tiempo sincronizada.
- Inspector de escena (texto, color, estilo de subtítulos, toma).
- Línea de tiempo por pistas y zonas seguras.
- Variantes con "variar solo…".
- Deshacer y rehacer, y atajos de teclado.
- El cuadro "Pídele un cambio a la IA" guarda una petición en `requests[]`.

Sincronización:
- El engine vigila `project.json` y lo empuja por WebSocket.
- Las ediciones del studio se guardan validadas.
- Si Claude y el studio editan a la vez, gana el último y el otro se actualiza.

**Terminado cuando:**
- recorro las 5 pantallas en los dos temas;
- reordeno una escena, cambio un texto y elijo una variante;
- la vista previa y `project.json` cambian;
- Claude ve el cambio con `leer_transcripcion` o `leer_peticiones`.

### Fase 4 · Estilos, kits y referencias

- Kits de marca por cliente: colores, tipografías, logo, estilo de subtítulos.
- Presets base: Rápido, Con ritmo, Sobrio, Testimonio, Antes/después, Oferta con CTA. Todos editables y guardables por cliente.
- **Plantilla desde referencia**: subo un video y sale un reporte de estilo. Lo ajusto y lo guardo como preset del kit. Solo se toma el estilo, nunca el contenido. El reporte incluye:
  - ritmo de cortes (`scdet`);
  - BPM aproximado;
  - paleta dominante;
  - estilo de subtítulos y la Google Font más parecida, que Claude saca mirando fotogramas.
- El mismo análisis sirve para mis propios reels que mejor funcionaron.

**Terminado cuando:** analizar una referencia y aplicarla a otro proyecto cambia visiblemente el render (ritmo, subtítulos, colores).

### Fase 5 · Recursos y extras

- Música con ducking bajo la voz y la mezcla final a -16 LUFS.
- B-roll en las escenas tipo `broll`:
  - se busca en Pexels con una clave mía en `.env`;
  - los clips se guardan con su licencia;
  - si no hay clave, se usan archivos locales.
- Motion graphics en Remotion: barras, contador, lista, logo final. Los datos los pongo yo.
- Encuadre automático que sigue la cara cuando la fuente es horizontal.
- Adaptar a 4:5 y 1:1.
- Sugerencias de gancho.
- Modo lote para varios videos.
- Versiones, comparación entre versiones y estados `borrador → en_revision → aprobado`.
- Voz en off opcional:
  - Piper, local y gratis;
  - ElevenLabs solo si hay clave.

**Terminado cuando:** un reel usa b-roll, música con ducking y un motion graphic, y se exporta en 9:16 y 4:5.

### Fase 6 · Empaquetado

- `npm run setup` deja todo listo en una máquina limpia, en Mac y en Windows.
- Plugin instalable en Claude Code.
- Guía "tu primer reel" en `docs/`.
- `se doctor` cubre todo lo nuevo.
- El cambio de nombre final se hace en un solo lugar (`APP_NAME` y metadatos del plugin).

## Definición de terminado (toda la app)

La app está terminada solo cuando se cumple **todo** esto:

1. **Instalación:** en una máquina limpia, `npm run setup` y `se doctor` pasan en macOS y en Windows (si no tienes Windows, deja un script de prueba y dime exactamente qué correr).
2. **Edición desde Claude:** con un video real hablando a cámara de 30–90 s grabado con el celular, desde Claude: brief → storyboard → studio → ajustes → render, en menos de 10 minutos de mi tiempo.
3. **Calidad del render:**
   - sin silencios largos ni tomas repetidas;
   - subtítulos sincronizados (desfase visible < 100 ms);
   - 1080×1920;
   - entre -17 y -15 LUFS;
   - se reproduce en Instagram.
4. **Studio:** las 5 pantallas funcionan en los dos temas, igual que los mockups.
5. **Referencias:** un preset desde referencia se crea, se guarda en un kit y cambia el resultado.
6. **Calidad del código:**
   - `npm test` y `npm run typecheck` pasan;
   - hay pruebas para schema, cortes, línea de tiempo, herramientas MCP y sincronización del studio.
7. **Documentación:** el README y la guía explican la instalación y el uso sin conocimientos técnicos.

## Cómo trabajar

- **Una fase a la vez.** Antes de empezar una fase, escribe en 5–10 líneas qué vas a construir. Al terminarla:
  1. corre las pruebas;
  2. prueba de verdad (render real, studio en el navegador integrado, herramientas MCP llamadas de verdad);
  3. haz un commit con un mensaje claro en español.
- **Verifica, no supongas.** Si algo no lo pudiste probar (por ejemplo Windows o un video real), dilo explícitamente. Para videos de prueba usa `say` + FFmpeg mientras no tengas uno mío, y pídeme uno real al terminar la fase 3.
- **Si una librería o versión no funciona**, investiga la causa (por ejemplo, la atención flash que apagaba DTW) antes de cambiar de enfoque. Documenta el motivo en el README.
- **No rompas lo que funciona:**
  - `se edit` debe seguir funcionando de punta a punta en cada commit;
  - mantén compatible el formato de `project.json` (si cambias el schema, sube `SCHEMA_VERSION` y escribe la migración).
- **No hagas** push, publicaciones, compras ni nada fuera de esta carpeta sin preguntarme. Tampoco instales software del sistema sin decirme qué y por qué.
- **Código:** TypeScript estricto, funciones pequeñas, comentarios en español solo donde aporten, sin dependencias innecesarias.

## Cómo reportar

Al cerrar cada fase, dame:
- qué quedó funcionando;
- cómo lo pruebo yo (comandos exactos);
- qué no se verificó;
- el hash del commit.

Al final, un resumen contra cada punto de la definición de terminado: cumplido, parcial o pendiente, con el motivo.

Empieza por la Fase 2.
