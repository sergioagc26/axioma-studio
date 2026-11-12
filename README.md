# SNZ Studio (nombre provisional)

Editor de reels 9:16 con IA para videos hablando a cámara. Claude (tu suscripción) dirige la edición; el trabajo pesado corre en tu computador con herramientas gratuitas (FFmpeg, whisper.cpp, Remotion).

## Instalación (Mac o Windows)

```bash
npm run setup
```

Instala dependencias, compila whisper.cpp, descarga el modelo `small` y corre `doctor`.

- **Mac**: necesitas Homebrew, `ffmpeg`, `cmake` y las herramientas de Xcode (`xcode-select --install`).
- **Windows**: el script instala FFmpeg con winget y usa los binarios oficiales de whisper.cpp.

## Uso

```bash
npm run se -- doctor                      # revisa que todo esté instalado
npm run se -- edit video.mp4 -c CRE       # flujo completo → renders/*.mp4
npm run se -- edit video.mp4 -p sobrio    # otro preset: rapido, con-ritmo, sobrio
npm run se -- cut <carpeta> -p con-ritmo  # volver a cortar con otro preset
npm run se -- render <carpeta>            # volver a renderizar
npm run se -- check archivo.mp4           # tamaño, fps, duración y LUFS
```

Cada proyecto vive en `workspace/clientes/<cliente>/proyectos/<fecha-nombre>/`.

| Archivo | Qué es |
| --- | --- |
| `project.json` | Fuente de verdad: escenas, estilo de subtítulos, pacing |
| `transcript.json` | Palabras con tiempos (DTW + ajuste a silencios) |
| `analysis.json` | Silencios detectados |
| `media/master.mp4` | Master a fps constante (lo que usa el render) |
| `media/voz.wav` | Voz limpia y nivelada a -16 LUFS |
| `proxies/proxy.mp4` | Vista previa liviana para el studio |
| `renders/` | Exportaciones |

## Usarlo desde Claude (Fase 2)

`npm run setup` ya conecta el plugin. Para repetirlo a mano:

```bash
npm run se -- instalar-claude
```

Luego abre Claude Code (o el Code tab de la app de Claude) en esta carpeta, acepta el plugin `snz-studio` y escribe, por ejemplo:

> edita este video para CRE: /ruta/al/video.mp4

Claude hace el brief, crea el proyecto, arma el storyboard con las frases del video y renderiza.

- **Skills** (`plugin/skills/`): `editar-reel`, `brief`, `variantes`, `crear-preset`, `reglas-edicion`.
- **Servidor MCP** (`packages/mcp`): 37 herramientas. Las principales son `crear_proyecto`, `leer_transcripcion`, `armar_storyboard`, `editar_escena`, `generar_variantes`, `elegir_variante`, `aplicar_preset`, `guardar_preset` y `renderizar`.
- Claude nunca recibe el video. Trabaja con frases numeradas (`f01`, `f02`…) que ya vienen marcadas como muletilla o toma descartada.
- `plugin/.mcp.json` se genera con rutas absolutas de este computador (la app de escritorio no hereda el PATH de la terminal), por eso no está en git.

## Studio (Fase 3)

```bash
npm run studio
```

Abre la interfaz en `http://127.0.0.1:4747`. Desde Claude se abre con la herramienta `abrir_studio`.

- **Proyectos**: arrastra un video para crear un reel nuevo.
- **Brief**: las 7 preguntas. El ritmo cambia el preset.
- **Storyboard**: tarjetas arrastrables; la línea de tiempo se actualiza sola.
- **Editor**: vista previa real (Remotion Player), presets, subtítulos, inspector de escena, línea de tiempo y zonas seguras.
- **Variantes**: elegir entre las versiones que propone Claude y dejarle peticiones.
- Tema oscuro y claro, deshacer y rehacer (⌘Z / ⇧⌘Z), espacio para reproducir y flechas para cambiar de escena.
- Lo que cambia Claude aparece en vivo (Server-Sent Events) y lo que cambias tú se guarda validado en `project.json`. Si los dos editan a la vez, gana el último guardado.
- Solo escucha en `127.0.0.1` y rechaza escrituras desde otras páginas.

## Estilos, kits y referencias (Fase 4)

- **Presets base**: Rápido, Con ritmo, Sobrio, Testimonio, Antes/después y Oferta con CTA. Cada cliente puede guardar los suyos en `workspace/clientes/<cliente>/presets/`.
- **Kit de marca** (`kit.json` del cliente): colores, fuentes y logo. Su color primario y su fuente mandan sobre cualquier preset.
- **Fuentes de subtítulos** (Google Fonts): Montserrat, Inter, Space Grotesk, Poppins, Anton, Bebas Neue, Oswald, Archivo Black y DM Sans.
- **Plantilla desde referencia**: en la pantalla Referencias del studio, o con la herramienta `analizar_referencia`. Saca:
  - el ritmo de cortes (FFmpeg `scene`);
  - el tempo aproximado (autocorrelación de los ataques del audio, 60–180 BPM);
  - la paleta dominante;
  - 8 fotogramas, para que Claude describa los subtítulos y elija la fuente más parecida.

  Solo se guarda el estilo: el video de referencia no se conserva.

## Recursos y extras (Fase 5)

- **Música**: `poner_musica` con un archivo local y su licencia. Baja sola bajo la voz y la mezcla final se nivela a -16 LUFS.
- **B-roll**: una escena puede mostrar otro video mientras sigue la voz.
  - Con clave de Pexels en `.env` (`PEXELS_API_KEY=…`): `buscar_broll` y `usar_broll`.
  - Sin clave: `usar_broll` con un archivo local y su licencia.
- **Motion graphics** (`poner_motion`): barras, contador, lista, logo y tarjeta de texto. Los datos los pones tú; lo que falte se ve como `[DATO]`.
- **Formatos**: 9:16, 4:5 y 1:1, desde `renderizar`, el studio o `se render -f 4:5`.
- **Encuadre**: `ajustar_encuadre` mueve el recorte de un video horizontal. Es manual: no hay seguimiento automático de la cara.
- **Versiones**: guardar, listar, comparar y restaurar. Estados `borrador → en_revision → aprobado`.
- **Lote**: `npm run se -- lote <carpeta>` edita todos los videos de una carpeta.
- Cada recurso externo queda registrado con su licencia en `project.json` (`assets`).

No incluido todavía: voz en off (Piper o ElevenLabs) y seguimiento automático de la cara.

## Cómo funciona el corte automático

1. whisper.cpp 1.9.5 transcribe con alineación DTW (`-nfa`, porque la atención flash desactiva DTW).
2. FFmpeg `silencedetect` marca los silencios sobre la voz nivelada. Las palabras se ajustan a la voz real.
3. Se quitan:
   - muletillas ("eh", "em"…);
   - frases cortas de confianza muy baja, que suelen ser un "eh" mal transcrito;
   - tomas repetidas (se queda la última);
   - silencios más largos que `pacing.maxPause`.
4. Las frases se agrupan en escenas de 2,5–7 s. La primera es el gancho y la última el cierre.

## Estructura

- `packages/schema`: tipos y validación (zod), línea de tiempo y presets.
- `packages/engine`: CLI `se`, FFmpeg, whisper, cortes, render.
- `packages/remotion`: composición `Reel`, con subtítulos palabra por palabra, texto en pantalla y zoom de golpe.
- `packages/mcp`: servidor MCP que expone el engine a Claude.
- `packages/studio`: interfaz web (Vite + React).
- `plugin/`: plugin de Claude Code con las skills.
- `scripts/`: setup para Mac y Windows.

```bash
npm test
npm run typecheck
```

## Licencias

- **Remotion**: gratis para uso individual y para equipos de hasta 3 personas, también en uso comercial. No se puede vender Remotion en sí. Ver remotion.dev/license.
- **Codecs**: H.264/AAC tienen patentes de terceros que la licencia de Remotion no cubre.

## Guía

Paso a paso sin tecnicismos: `docs/TU-PRIMER-REEL.md`.

## Cambiar el nombre

El nombre visible sale de `APP_NAME` en `packages/schema/src/project.ts`. El nombre del plugin y del servidor MCP (`snz-studio`) está en `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `packages/engine/src/claude.ts` y `packages/mcp/src/server.ts`.

El objetivo completo y la definición de terminado están en `docs/PROMPT-OBJETIVO.md`.
