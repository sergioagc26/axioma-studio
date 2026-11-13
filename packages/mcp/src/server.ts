import { existsSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_NAME, FONT_FAMILIES, applyVariant, motionGallery, reelScore } from '@axioma/schema';
import * as E from '@axioma/engine';

const log = (msg: string) => console.error(`[${APP_NAME}] ${msg}`);
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (e: unknown) => ({ ...text(`Error: ${e instanceof Error ? e.message : String(e)}`), isError: true });

/** Acepta carpeta del proyecto o su id; sin valor, usa el más reciente. */
async function resolveProject(ref?: string): Promise<string> {
  if (ref && path.isAbsolute(ref) && existsSync(path.join(ref, 'project.json'))) return ref;
  const all = await E.listProjects();
  if (!all.length) throw new Error('No hay proyectos todavía. Usa crear_proyecto con la ruta de un video.');
  if (!ref) return all[0].dir;
  const hit = all.find((p) => p.project.id === ref || path.basename(p.dir) === ref);
  if (!hit) throw new Error(`No encontré el proyecto "${ref}". Usa listar_proyectos.`);
  return hit.dir;
}

const proyecto = z.string().optional().describe('Id o carpeta del proyecto. Si se omite, el más reciente.');
const role = z.enum(['gancho', 'problema', 'beneficio', 'demostracion', 'prueba', 'cta', 'otro']);
const visual = z.enum(['original', 'broll', 'motion', 'texto']);
const textStyle = z.enum(['caja', 'resaltado', 'marcador', 'gigante', 'subrayado', 'neon', 'banda', 'contorno', 'degradado', 'sombra', 'etiqueta', 'cinta', 'sello', 'glitch', 'trazo', 'apilado', 'tresd', 'fuego', 'cromado', 'burbuja', 'retro', 'resplandor']);
const look = z.enum(['normal', 'bn', 'calido', 'frio', 'contraste']);
const camera = z.enum(['ninguno', 'acercar', 'alejar', 'izquierda', 'derecha', 'arriba', 'abajo', 'pulso', 'temblor', 'orbita', 'foco']);

export function createServer() {
  const server = new McpServer({ name: 'axioma-studio', version: '0.2.0' });

  /** Registra una herramienta con manejo de errores uniforme. */
  const tool = <S extends z.ZodRawShape>(
    name: string, description: string, shape: S, fn: (a: z.infer<z.ZodObject<S>>) => Promise<string>,
  ) =>
    server.registerTool(name, { description, inputSchema: shape }, (async (a: z.infer<z.ZodObject<S>>) => {
      try {
        return text(await fn(a));
      } catch (e) {
        log(`${name}: ${e instanceof Error ? e.stack : e}`);
        return fail(e);
      }
    }) as any);

  tool('estado_sistema', 'Revisa que FFmpeg, whisper.cpp y el modelo estén instalados.', {}, async () => {
    const { checks } = await E.doctor();
    return checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}${c.ok ? '' : ` → ${c.fix}`}`).join('\n');
  });

  tool('listar_proyectos', 'Lista los proyectos, más recientes primero.', { limite: z.number().int().min(1).max(50).default(10) }, async ({ limite }) => {
    const all = await E.listProjects();
    if (!all.length) return 'No hay proyectos.';
    return all.slice(0, limite).map((p) => `${p.project.id} · ${p.project.client ?? 'personal'} · ${p.project.approval} · ${p.project.scenes.length} escenas · ${p.dir}`).join('\n');
  });

  tool(
    'crear_proyecto',
    'Crea un proyecto desde un video: copia el archivo, crea master y proxy, limpia y nivela la voz, transcribe con Whisper y aplica un primer corte automático. Tarda de 1 a 5 minutos según la duración. Devuelve el resumen y las frases numeradas para armar el storyboard.',
    {
      video: z.string().describe('Ruta absoluta del video'),
      cliente: z.string().optional().describe('Cliente (carpeta). Por defecto "personal".'),
      nombre: z.string().optional(),
      preset: z.string().default('rapido').describe('Preset inicial: rapido, con-ritmo, sobrio o uno del cliente'),
    },
    async ({ video, cliente, nombre, preset }) => {
      const { dir } = await E.createProject({ input: video, name: nombre, client: cliente, presetId: preset });
      log(`Proyecto creado en ${dir}`);
      await E.prepareMedia(dir, log);
      await E.transcribeProject(dir, log);
      const report = await E.cutProject(dir);
      const project = await E.readProject(dir);
      return [
        E.summarize(project, dir),
        `Corte automático: ${report.sourceDuration.toFixed(1)} s → ${report.outputDuration.toFixed(1)} s (muletillas ${report.removedFillers}, palabras de tomas repetidas ${report.removedRetakeWords}).`,
        '',
        'Frases (usa sus ids en armar_storyboard):',
        E.formatPhrases(await E.getPhrases(dir)),
      ].join('\n');
    },
  );

  tool('leer_proyecto', 'Resumen del proyecto: brief, escenas, variantes, estado.', { proyecto }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.readProject(dir), dir);
  });

  tool(
    'leer_transcripcion',
    'Transcripción compacta en frases numeradas (f01, f02…) con tiempos y marcas de muletilla o toma descartada.',
    { proyecto },
    async ({ proyecto }) => E.formatPhrases(await E.getPhrases(await resolveProject(proyecto))),
  );

  tool('guardar_brief', 'Guarda respuestas del brief (formato, objetivo, público, ritmo, tono, material, cta…).', {
    proyecto, respuestas: z.record(z.string(), z.string()),
  }, async ({ proyecto, respuestas }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.setBrief(dir, respuestas), dir);
  });

  tool('aplicar_brief', 'Arma la edición completa a partir del brief guardado: ritmo (preset y corte), duración máxima, tono (estilo de textos, subtítulos, imagen y cámara), gancho, llamado a la acción, transiciones y efectos. Es el primer paso después de guardar_brief. Rehace el storyboard (guarda una versión antes). Después afina a mano lo que haga falta.', { proyecto }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    const { project, summary } = await E.applyBrief(dir);
    return `${summary.map((x) => `- ${x}`).join('\n')}\n\n${E.summarize(project, dir)}`;
  });

  tool('recortar_escena', 'Recorta la duración de una escena quitando segundos del inicio o del final. No borra material: con 0 y 0 se recupera entera.', {
    proyecto, escena: z.string(), inicio: z.number().min(0).optional().describe('Segundos a quitar del inicio'), final: z.number().min(0).optional().describe('Segundos a quitar del final'),
  }, async ({ proyecto, escena, inicio, final }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.editScene(dir, escena, { trimStart: inicio, trimEnd: final }), dir);
  });

  tool('guardar_referencia', 'Guarda como plantilla el estilo completo detectado en una referencia ya analizada (ritmo, subtítulos, textos, imagen, transiciones, efectos) y lo aplica al proyecto. No hace falta describir nada a mano.', {
    proyecto, referencia: z.string().describe('Id de analizar_referencia o listar_referencias'), nombre: z.string().optional(), aplicar: z.boolean().default(true),
  }, async ({ proyecto, referencia, nombre, aplicar }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.readProject(dir);
    const report = (await E.listReferences(p.client)).find((r) => r.id === referencia);
    if (!report) throw new Error(`No existe la referencia ${referencia}.`);
    const preset = await E.savePreset(p.client, E.presetFromReference(report, nombre));
    if (aplicar) await E.applyPreset(dir, preset.id);
    return `Plantilla ${preset.id} guardada${aplicar ? ' y aplicada' : ''}.\n${E.summarize(await E.readProject(dir), dir)}`;
  });

  tool('aplicar_cortes', 'Rehace el corte automático (borra el storyboard actual). Opcionalmente cambia de preset.', {
    proyecto, preset: z.string().optional(),
  }, async ({ proyecto, preset }) => {
    const dir = await resolveProject(proyecto);
    const r = await E.cutProject(dir, preset);
    return `Corte: ${r.sourceDuration.toFixed(1)} s → ${r.outputDuration.toFixed(1)} s\n\n${E.summarize(await E.readProject(dir), dir)}`;
  });

  tool(
    'armar_storyboard',
    'Reemplaza las escenas. Cada escena usa frases por id, en el orden indicado. Omite las frases marcadas como muletilla o toma descartada salvo que quieras usarlas.',
    {
      proyecto,
      escenas: z.array(z.object({
        rol: role.default('otro'),
        titulo: z.string().default(''),
        frases: z.array(z.string()).min(1),
        texto_en_pantalla: z.string().optional().describe('Texto corto grande arriba (máx. ~6 palabras). Vacío = sin texto.'),
        color_texto: z.string().optional(),
        visual: visual.default('original'),
      })).min(1),
    },
    async ({ proyecto, escenas }) => {
      const dir = await resolveProject(proyecto);
      const p = await E.buildStoryboard(dir, escenas.map((s) => ({
        role: s.rol, title: s.titulo, phrases: s.frases, onScreenText: s.texto_en_pantalla, textColor: s.color_texto, visual: s.visual,
      })));
      return E.summarize(p, dir);
    },
  );

  tool('editar_escena', 'Cambia campos de una escena. "frases" reemplaza el audio/video de la escena.', {
    proyecto,
    escena: z.string().describe('Id de la escena, p. ej. s02'),
    rol: role.optional(),
    titulo: z.string().optional(),
    texto_en_pantalla: z.string().optional().describe('"" para quitarlo'),
    color_texto: z.string().optional(),
    visual: visual.optional(),
    zoom: z.boolean().optional(),
    frases: z.array(z.string()).optional(),
    estilo_texto: textStyle.optional().describe('caja = recuadro de color · resaltado = clave en color y más grande · marcador = trazo de marcador detrás de la clave · gigante = la clave enorme y el resto pequeño · subrayado · neon = brillo · banda = franja de titular'),
    palabra_clave: z.string().optional().describe('Palabra del texto que se remarca. Sin valor se elige sola la más importante.'),
    posicion_texto: z.enum(['arriba', 'centro']).optional(),
    imagen: look.optional().describe('bn = blanco y negro · calido · frio · contraste'),
    camara: camera.optional().describe('Movimiento durante la escena. En fotos con profundidad (b-roll de imagen), orbita gira alrededor del sujeto y foco pasa el foco del fondo a lo cercano.'),
    distribucion_broll: z.enum(['completo', 'arriba', 'abajo', 'recuadro']).optional().describe('Con b-roll: completo · arriba (pantalla dividida, b-roll arriba y la persona abajo) · abajo · recuadro (la persona en una ventanita sobre el b-roll)'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const p = await E.editScene(dir, a.escena, {
      brollLayout: a.distribucion_broll,
      role: a.rol, title: a.titulo, onScreenText: a.texto_en_pantalla, textColor: a.color_texto, visual: a.visual, punchZoom: a.zoom, phrases: a.frases,
      textStyle: a.estilo_texto, textKeyword: a.palabra_clave, textPosition: a.posicion_texto, look: a.imagen, camera: a.camara,
    });
    return E.summarize(p, dir);
  });

  tool('reordenar_escenas', 'Cambia el orden de las escenas. Incluye todos los ids.', {
    proyecto, orden: z.array(z.string()).min(1),
  }, async ({ proyecto, orden }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.reorderScenes(dir, orden), dir);
  });

  tool('eliminar_escena', 'Quita una escena del reel.', { proyecto, escena: z.string() }, async ({ proyecto, escena }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.deleteScene(dir, escena), dir);
  });

  tool(
    'generar_variantes',
    'Guarda las variantes que propones para una escena (2 a 4). Cada variante debe ser una IDEA completa y distinta —texto, forma del texto, palabra clave, imagen, cámara— que tenga sentido para lo que se dice; no un ajuste suelto como "otra transición". Se identifican como a, b, c, d.',
    {
      proyecto,
      escena: z.string(),
      variantes: z.array(z.object({
        etiqueta: z.string().describe('p. ej. "Texto con color"'),
        visual,
        texto_en_pantalla: z.string().optional(),
        color_texto: z.string().optional(),
        broll: z.string().optional().describe('Archivo o búsqueda de b-roll'),
        motion: z.string().optional().describe('Plantilla de motion graphics'),
        estilo_texto: textStyle.optional(),
        palabra_clave: z.string().optional(),
        imagen: look.optional(),
        camara: camera.optional(),
        zoom: z.boolean().optional(),
        transicion: z.string().optional(),
        notas: z.string().optional().describe('Una frase: por qué esta idea le va a la escena'),
      })).min(2).max(4),
    },
    async ({ proyecto, escena, variantes }) => {
      const dir = await resolveProject(proyecto);
      const p = await E.setVariants(dir, escena, variantes.map((v) => ({
        label: v.etiqueta, visual: v.visual, onScreenText: v.texto_en_pantalla, textColor: v.color_texto,
        brollFile: v.broll, motionTemplate: v.motion, notes: v.notas,
        textStyle: v.estilo_texto, textKeyword: v.palabra_clave, look: v.imagen, camera: v.camara, punchZoom: v.zoom, transition: v.transicion,
      })));
      return E.summarize(p, dir);
    },
  );

  tool('elegir_variante', 'Aplica una variante a su escena ("original" para volver al original).', {
    proyecto, escena: z.string(), variante: z.string(),
  }, async ({ proyecto, escena, variante }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.chooseVariant(dir, escena, variante === 'original' ? null : variante), dir);
  });

  tool('listar_presets', 'Presets disponibles (base y del cliente del proyecto).', { proyecto }, async ({ proyecto }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    return (await E.allPresets(p.client)).map((x) => `${x.id} · ${x.name}: ${x.description}`).join('\n');
  });

  tool('aplicar_preset', 'Cambia ritmo y subtítulos según un preset sin rehacer el storyboard.', {
    proyecto, preset: z.string(),
  }, async ({ proyecto, preset }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.applyPreset(dir, preset), dir);
  });

  tool('ajustar_subtitulos', 'Cambia el estilo de subtítulos del proyecto.', {
    proyecto,
    modo: z.enum(['word', 'phrase']).optional(),
    palabras_por_linea: z.number().int().min(1).max(8).optional(),
    fuente: z.enum(FONT_FAMILIES).optional(),
    tamano: z.number().min(30).max(140).optional(),
    color: z.string().optional(),
    color_resaltado: z.string().optional(),
    mayusculas: z.boolean().optional(),
    posicion_y: z.number().min(0.1).max(0.9).optional().describe('0 arriba, 1 abajo. Zona segura: 0.2–0.75'),
    efecto: z.enum(['color', 'caja', 'pop', 'subrayado']).optional().describe('Cómo se marca la palabra que suena: color · caja detrás · pop (crece) · subrayado'),
    remarcar_clave: z.boolean().optional().describe('Remarca siempre la palabra más importante de cada línea'),
    diseno: z.string().optional().describe('clasico = básico; los demás son llamativos: impacto (enormes e inclinadas), bloque (línea en bloque de color), cinta (cada palabra en su tira), neon, elegante (cursiva fina)'),
    emojis: z.boolean().optional().describe('Emojis automáticos encima de los subtítulos cuando suena una palabra con emoji claro (dinero 💰, idea 💡, gym 💪…)'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const patch = Object.fromEntries(Object.entries({
      mode: a.modo, wordsPerLine: a.palabras_por_linea, fontFamily: a.fuente, fontSize: a.tamano,
      color: a.color, highlightColor: a.color_resaltado, uppercase: a.mayusculas, y: a.posicion_y, effect: a.efecto, emphasis: a.remarcar_clave, design: a.diseno, emojis: a.emojis,
    }).filter(([, v]) => v !== undefined));
    await E.setCaptions(dir, patch);
    return E.summarize(await E.readProject(dir), dir);
  });

  tool('guardar_preset', 'Guarda un preset del cliente a partir de uno existente y de ajustes.', {
    proyecto,
    nombre: z.string(),
    descripcion: z.string().optional(),
    base: z.string().optional(),
    pausa_maxima: z.number().min(0).max(2).optional(),
    zoom_cada: z.number().min(0).max(30).optional(),
    subtitulos: z.object({
      modo: z.enum(['word', 'phrase']).optional(),
      palabras_por_linea: z.number().int().optional(),
      fuente: z.enum(FONT_FAMILIES).optional(),
      tamano: z.number().min(30).max(140).optional(),
      color: z.string().optional(),
      color_resaltado: z.string().optional(),
      mayusculas: z.boolean().optional(),
      posicion_y: z.number().min(0.1).max(0.9).optional(),
    }).optional(),
    referencia: z.string().optional().describe('Id de la referencia analizada de la que sale el preset'),
    paleta: z.array(z.string()).optional(),
  }, async (a) => {
    const p = await E.readProject(await resolveProject(a.proyecto));
    const s = a.subtitulos ?? {};
    const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    const preset = await E.savePreset(p.client, {
      name: a.nombre, description: a.descripcion, base: a.base,
      pacing: clean({ maxPause: a.pausa_maxima, punchZoomEvery: a.zoom_cada }),
      captions: clean({ mode: s.modo, wordsPerLine: s.palabras_por_linea, fontFamily: s.fuente, fontSize: s.tamano, color: s.color, highlightColor: s.color_resaltado, uppercase: s.mayusculas, y: s.posicion_y }),
      palette: a.paleta, reference: a.referencia,
    });
    return `Preset guardado: ${preset.id} (${preset.name}) para ${p.client ?? 'personal'}.`;
  });

  tool(
    'analizar_referencia',
    'Analiza el ESTILO de un video de referencia (ritmo de cortes, tempo, paleta) y extrae 8 fotogramas. Después mira 3–4 fotogramas con tu herramienta de lectura de imágenes para describir subtítulos (posición, mayúsculas, palabras por línea, color de resaltado) y elegir la fuente más parecida de la lista disponible. Luego guarda el estilo con guardar_preset. Nunca copies el contenido (textos, clips, música) de la referencia.',
    { video: z.string().describe('Ruta absoluta del video de referencia'), proyecto, nombre: z.string().optional() },
    async ({ video, proyecto, nombre }) => {
      const p = await E.readProject(await resolveProject(proyecto));
      const { dir, report } = await E.analyzeReference(video, { client: p.client, name: nombre });
      return `${E.formatReport(report, dir)}\n\nFuentes disponibles: ${FONT_FAMILIES.join(', ')}.`;
    },
  );

  tool('listar_referencias', 'Referencias ya analizadas del cliente del proyecto.', { proyecto }, async ({ proyecto }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const list = await E.listReferences(p.client);
    return list.length ? list.map((r) => `${r.id} · ${r.name} · plano medio ${r.avgShot.toFixed(2)} s · ${r.palette.join(' ')}`).join('\n') : 'No hay referencias analizadas.';
  });

  tool('leer_kit', 'Kit de marca del cliente del proyecto (colores, fuentes, logo).', { proyecto }, async ({ proyecto }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const kit = await E.readKit(p.client);
    return kit ? JSON.stringify(kit, null, 2) : `El cliente ${p.client ?? 'personal'} no tiene kit. Créalo con guardar_kit.`;
  });

  tool('guardar_kit', 'Crea o actualiza el kit de marca del cliente. Sus colores y fuente se imponen sobre cualquier preset en los proyectos nuevos y al aplicar presets.', {
    proyecto,
    nombre: z.string().optional(),
    color_primario: z.string().optional().describe('Color de acento y de resaltado de subtítulos'),
    color_secundario: z.string().optional(),
    color_texto: z.string().optional(),
    fuente_titulos: z.enum(FONT_FAMILIES).optional(),
    fuente_texto: z.enum(FONT_FAMILIES).optional(),
    logo: z.string().optional().describe('Ruta absoluta del logo (PNG o SVG)'),
    sector: z.enum(['gimnasio', 'comida-rapida', 'restaurante', 'moda', 'tecnologia', 'educacion', 'salud', 'negocios', 'inmobiliaria', 'entretenimiento', 'servicios', 'otro']).optional().describe('A qué se dedica la marca: decide el estilo de subtítulos, títulos, imagen y efectos'),
    personalidad: z.enum(['energica', 'divertida', 'elegante', 'cercana', 'seria', 'rebelde']).optional(),
    aplicar: z.boolean().default(true).describe('Vestir el proyecto con el estilo de la marca'),
  }, async (a) => {
    const p = await E.readProject(await resolveProject(a.proyecto));
    const kit = await E.saveKit(p.client, {
      name: a.nombre, primary: a.color_primario, secondary: a.color_secundario, text: a.color_texto,
      heading: a.fuente_titulos, body: a.fuente_texto, logo: a.logo, sector: a.sector, personality: a.personalidad,
    });
    const applied = a.aplicar ? await E.applyBrandStyle(await resolveProject(a.proyecto)) : null;
    if (applied) return `Kit guardado y estilo de marca aplicado (${applied.why}).\n${JSON.stringify(kit, null, 2)}`;
    return `Kit guardado para ${p.client ?? 'personal'}:\n${JSON.stringify(kit, null, 2)}`;
  });

  tool('sugerir_variantes', 'Genera al instante 3 variantes para una escena con reglas (sin pensar tú): salen de lo que se dice, del papel de la escena y del estilo. Úsala para algo rápido; para variantes más creativas usa generar_variantes con tus propias ideas.', {
    proyecto, escena: z.string(), ronda: z.number().int().min(0).default(0).describe('Sube el número para obtener otras 3'),
  }, async ({ proyecto, escena, ronda }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.suggestSceneVariants(dir, escena, ronda);
    const s = p.scenes.find((x) => x.id === escena)!;
    return s.variants.map((v) => `${v.id} · ${v.label} (${v.visual})${v.onScreenText ? ` · texto: "${v.onScreenText}"` : ''} — ${v.notes ?? ''}`).join('\n');
  });

  tool('corregir_audio', 'Corrige la voz grabada de un video hablado: limpieza de ruido (suave, media o fuerte) y realce de voz (más presencia y volumen parejo). Vuelve a procesar el audio; tarda unos segundos.', {
    proyecto,
    limpiar_ruido: z.boolean().optional(),
    nivel: z.enum(['suave', 'media', 'fuerte']).optional().describe('fuerte quita más ruido pero puede sonar metálico'),
    realzar_voz: z.boolean().optional(),
  }, async ({ proyecto, limpiar_ruido, nivel, realzar_voz }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.correctAudio(dir, { denoise: limpiar_ruido, level: nivel, enhance: realzar_voz });
    return `Audio corregido: limpieza ${p.audio.denoise ? p.audio.denoiseLevel : 'apagada'} · realce ${p.audio.enhance ? 'activado' : 'apagado'} · ${p.audio.targetLufs} LUFS.`;
  });

  tool('listar_efectos', 'Efectos de sonido incluidos.', {}, async () => E.formatSfx());

  tool('poner_efecto', 'Añade un efecto de sonido a una escena. "momento" son segundos desde el inicio de la escena. Úsalos con medida: uno en un cambio fuerte o al entrar un texto clave, no en cada corte.', {
    proyecto, escena: z.string(), efecto: z.enum(['whoosh', 'pop', 'clic', 'ding', 'impacto', 'subida']),
    momento: z.number().min(0).default(0), volumen: z.number().min(0).max(1).default(0.6),
  }, async ({ proyecto, escena, efecto, momento, volumen }) => {
    const dir = await resolveProject(proyecto);
    await E.addSfx(dir, escena, efecto, { offset: momento, volume: volumen });
    return `Efecto ${efecto} en ${escena} a los ${momento} s.`;
  });

  tool('quitar_efectos', 'Quita los efectos de sonido de una escena, o de todas si no indicas escena.', { proyecto, escena: z.string().optional() }, async ({ proyecto, escena }) => {
    await E.clearSfx(await resolveProject(proyecto), escena);
    return escena ? `Efectos quitados de ${escena}.` : 'Efectos quitados de todas las escenas.';
  });

  tool('efectos_automaticos', 'Activa o desactiva los efectos automáticos: un barrido en cada transición (impacto si es un destello) y un "pop" al entrar cada texto en pantalla.', { proyecto, activar: z.boolean() }, async ({ proyecto, activar }) => {
    await E.setAutoSfx(await resolveProject(proyecto), activar);
    return `Efectos automáticos: ${activar ? 'activados' : 'desactivados'}.`;
  });

  tool('listar_transiciones', 'Transiciones disponibles: las incluidas y las propias del cliente.', { proyecto }, async ({ proyecto }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    return E.formatTransitions(await E.allTransitions(p.client));
  });

  tool('recomendar_transiciones', 'Pone en todas las escenas la transición recomendada según el estilo del reel (rápido: casi todo corte seco con golpes de energía; con ritmo: transiciones cortas en los cambios de idea; sobrio: fundidos). Devuelve el motivo de cada una. Después puedes ajustar escenas sueltas con poner_transicion.', { proyecto }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    const { advice } = await E.applyRecommendedTransitions(dir);
    return advice.map((a) => `${a.sceneId}: ${a.transition ?? 'corte'} — ${a.reason}`).join('\n');
  });

  tool('poner_transicion', 'Pone la transición de ENTRADA de una escena (cómo se pasa de la anterior a esta). "corte" la quita. Úsalas con medida: en un reel rápido, la mayoría de cambios deben ser corte seco.', {
    proyecto, escena: z.string(), transicion: z.string().describe('Id de listar_transiciones, o "corte"'), duracion: z.number().min(0.1).max(1.5).optional(),
  }, async ({ proyecto, escena, transicion, duracion }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.setTransition(dir, escena, transicion === 'corte' ? null : transicion, duracion), dir);
  });

  const capa = z.object({
    opacidad: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin] entre 0 y 1'),
    x: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin] en % del ancho; 100 = fuera por la derecha'),
    y: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin] en % del alto; 100 = fuera por abajo'),
    escala: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin]; 1 = tamaño normal'),
    giro: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin] en grados'),
    desenfoque: z.tuple([z.number(), z.number()]).optional().describe('[inicio, fin] en píxeles'),
  });
  tool(
    'crear_transicion',
    'Crea una transición NUEVA para el cliente a partir de una descripción. Una transición es un dato: cómo ENTRA la escena nueva, cómo SALE la anterior (ambas van de [inicio, fin] durante la transición) y un destello opcional. La escena nueva debe terminar en su estado normal (opacidad 1, x 0, y 0, escala 1, giro 0, desenfoque 0). Ejemplo "cortina": entra {y:[-100,0]}, sale {escala:[1,0.9], opacidad:[1,0.4]}. Después aplícala con poner_transicion.',
    {
      proyecto,
      nombre: z.string(),
      descripcion: z.string().describe('Para qué sirve y cuándo usarla'),
      duracion: z.number().min(0.1).max(1.5).default(0.35),
      curva: z.enum(['lineal', 'suave', 'rebote']).default('suave'),
      entra: capa.default({}),
      sale: capa.default({}),
      destello: z.object({ color: z.string().default('#FFFFFF'), pico: z.number().min(0).max(1).default(0.9) }).optional(),
    },
    async (a) => {
      const p = await E.readProject(await resolveProject(a.proyecto));
      const spec = await E.saveTransition(p.client, { name: a.nombre, description: a.descripcion, duration: a.duracion, easing: a.curva, entra: a.entra, sale: a.sale, destello: a.destello });
      return `Transición creada: ${spec.id} (${spec.name}) para ${p.client ?? 'personal'}. Aplícala con poner_transicion.`;
    },
  );

  tool('leer_peticiones', 'Peticiones de cambio escritas en el studio.', { proyecto, todas: z.boolean().default(false) }, async ({ proyecto, todas }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const list = p.requests.filter((r) => todas || r.status === 'pendiente');
    return list.length ? list.map((r) => `${r.id} [${r.status}]${r.sceneId ? ` escena ${r.sceneId}` : ''}: ${r.text}`).join('\n') : 'No hay peticiones pendientes.';
  });

  tool('responder_peticion', 'Marca una petición del studio como hecha o descartada.', {
    proyecto, peticion: z.string(), estado: z.enum(['hecha', 'descartada']),
  }, async ({ proyecto, peticion, estado }) => {
    await E.resolveRequest(await resolveProject(proyecto), peticion, estado);
    return `Petición ${peticion}: ${estado}.`;
  });

  tool('guardar_version', 'Guarda una copia del estado actual del proyecto.', { proyecto, etiqueta: z.string().optional() }, async ({ proyecto, etiqueta }) => {
    return `Versión guardada: ${await E.saveVersion(await resolveProject(proyecto), etiqueta)}`;
  });

  tool('marcar_estado', 'Cambia el estado. "aprobado" solo cuando el usuario lo diga explícitamente.', {
    proyecto, estado: z.enum(['borrador', 'en_revision', 'aprobado']),
  }, async ({ proyecto, estado }) => {
    const dir = await resolveProject(proyecto);
    await E.setStatus(dir, estado);
    return `Estado: ${estado}.`;
  });

  tool('abrir_studio', 'Abre la interfaz visual (storyboard, editor, variantes) en el navegador y devuelve la dirección. Los cambios hechos allí se ven con leer_proyecto.', {
    proyecto, pantalla: z.enum(['brief', 'storyboard', 'editor', 'variantes', 'referencias']).default('storyboard'),
  }, async ({ proyecto, pantalla }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const url = E.studioUrl(await E.startStudio(), pantalla, p.id);
    E.openBrowser(url);
    return `Studio abierto: ${url}`;
  });

  tool('poner_musica', 'Pone música de fondo desde un archivo local. Baja sola bajo la voz (ducking) y la mezcla final queda a -16 LUFS. La licencia es obligatoria. Con archivo "" se quita la música.', {
    proyecto,
    archivo: z.string().describe('Ruta absoluta del audio, o "" para quitar la música'),
    licencia: z.string().optional().describe('p. ej. "propia", "Artlist", "YouTube Audio Library"'),
    volumen: z.number().min(0).max(1).optional().describe('Volumen bajo la voz (por defecto 0,18)'),
  }, async ({ proyecto, archivo, licencia, volumen }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.setMusic(dir, archivo || null, { license: licencia, volume: volumen });
    return p.audio.music ? `Música: ${p.audio.music} · volumen ${p.audio.musicVolume}` : 'Música quitada.';
  });

  tool('buscar_broll', 'Busca b-roll vertical en Pexels (licencia Pexels, uso comercial gratuito). Necesita PEXELS_API_KEY en .env.', {
    busqueda: z.string().describe('En inglés suele dar mejores resultados, p. ej. "person editing video on laptop"'),
  }, async ({ busqueda }) => {
    const list = await E.searchBroll(busqueda);
    return list.length ? list.map((v) => `${v.id} · ${v.duration} s · ${v.width}×${v.height} · ${v.author} · ${v.url}`).join('\n') : 'Sin resultados.';
  });

  tool('usar_broll', 'Pone b-roll en una escena (la voz sigue sonando). Usa un id de buscar_broll o un archivo local con su licencia.', {
    proyecto,
    escena: z.string(),
    pexels_id: z.number().optional(),
    busqueda: z.string().optional().describe('La misma búsqueda con la que encontraste el id'),
    archivo: z.string().optional().describe('Ruta absoluta de un video local'),
    licencia: z.string().optional().describe('Obligatoria para archivos locales'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    if (a.archivo) return E.summarize(await E.setBroll(dir, a.escena, a.archivo, { license: a.licencia ?? '' }), dir);
    if (!a.pexels_id || !a.busqueda) throw new Error('Indica un archivo local, o pexels_id junto con la búsqueda.');
    const item = (await E.searchBroll(a.busqueda, 15)).find((v) => v.id === a.pexels_id);
    if (!item) throw new Error(`El video ${a.pexels_id} no aparece en la búsqueda "${a.busqueda}".`);
    const file = await E.downloadBroll(dir, item);
    return E.summarize(await E.setBroll(dir, a.escena, file, { license: 'Pexels License', source: 'Pexels', author: item.author, url: item.url }), dir);
  });

  tool('buscar_material', 'Busca en el material propio del cliente (todos sus reels y b-rolls): lo que SE VE (modelo de visión local) y lo que SE DICE (transcripciones). Devuelve momentos numerados para usar con usar_material. Prefiere esto a Pexels cuando el cliente ya grabó algo parecido.', {
    proyecto,
    busqueda: z.string().describe('Lo que se quiere ver o una frase dicha, p. ej. "manos escribiendo en el portátil"'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const { hits, english } = await E.searchLibrary({ query: a.busqueda, near: dir });
    if (!hits.length) return `Nada parecido en el material (búsqueda visual: "${english}").`;
    return hits.map((h, i) => `${i + 1}. ${h.kind === 'se-dice' ? `dice «${h.text}»` : 'se ve'} · proyecto ${h.projectId} · archivo ${h.file} · segundo ${h.t}${h.duration ? ` · dura ${h.duration.toFixed(1)} s` : ''}`).join('\n');
  });

  tool('usar_material', 'Pone un momento de buscar_material como b-roll de una escena (corta el tramo del video original, sin audio).', {
    proyecto, escena: z.string(),
    proyecto_origen: z.string(), archivo: z.string(), segundo: z.number(),
    segundos: z.number().min(1).max(10).optional().describe('Duración del tramo; por defecto unos 3,5 s'),
    fondo: z.boolean().optional().describe('Ponerlo detrás de la persona recortada en vez de en su lugar'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    return E.summarize(await E.useLibraryHit(dir, a.escena, { projectId: a.proyecto_origen, file: a.archivo, t: a.segundo }, { seconds: a.segundos, asBackdrop: a.fondo }), dir);
  });

  tool('manual_marca', 'Crea el manual de marca del cliente en PDF (colores con HEX/RGB/CMYK y contraste, tipografías, logo y usos, cómo se ven sus reels y tono de voz), desde su kit. Queda en clientes/<cliente>/marca/manual-de-marca.pdf.', {
    proyecto,
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = await E.createBrandbook((await E.readProject(dir)).client);
    return `Manual de marca listo: ${r.pdf}${r.hasKit ? '' : '\n(El cliente aún no tiene marca guardada: salió con colores de ejemplo.)'}`;
  });

  tool('dividir_en_partes', 'Divide un reel largo en una serie «Parte 1, 2, 3» (cada parte un proyecto nuevo, en cambios de escena), con «Sigue en la parte N →» al final y «Parte N:» al inicio.', {
    proyecto, max_segundos: z.number().min(30).max(300).default(60),
  }, async (a) => {
    const r = await E.splitIntoParts(await resolveProject(a.proyecto), a.max_segundos);
    return `Serie creada:\n${r.ids.map((id, i) => `${id} · ${r.names[i]}`).join('\n')}`;
  });

  tool('musica_biblioteca', 'Biblioteca de música propia (workspace/musica): sin archivo, la app elige la canción que mejor va con el reel por tempo y energía; con archivo, pone esa. agregar suma una canción (con licencia).', {
    proyecto, archivo: z.string().optional().describe('Nombre en la biblioteca (ver listado) para usar esa'),
    agregar: z.string().optional().describe('Ruta absoluta de una canción para sumarla a la biblioteca'),
    licencia: z.string().optional(),
  }, async (a) => {
    if (a.agregar) {
      const t = await E.addTrack(a.agregar, { license: a.licencia ?? '' });
      return `Agregada: ${t.name} (${t.mood}${t.bpm ? `, ${t.bpm} BPM` : ''}).`;
    }
    const dir = await resolveProject(a.proyecto);
    const tracks = await E.listTracks();
    if (!tracks.length) return 'La biblioteca está vacía. Agrega canciones con agregar + licencia.';
    const r = await E.useLibraryTrack(dir, a.archivo);
    return `${r.why ?? `Música: ${r.track.name}.`}\nBiblioteca: ${tracks.map((t) => `${t.file} (${t.mood})`).join(', ')}`;
  });

  tool('puntaje_reel', 'Puntaje del reel (0–100) con lo que más pesa en la retención: gancho, ritmo, movimiento en pantalla, subtítulos, duración, cierre y audio, y qué hacer para subirlo.', { proyecto }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = reelScore(await E.readProject(dir), await E.readTranscript(dir));
    return `Puntaje: ${r.score}/100 (${r.grade})\n${r.parts.map((x) => `- ${x.label}: ${x.points}/${x.max}${x.tip ? ` → ${x.tip}` : ''}`).join('\n')}`;
  });

  tool('rotulo', 'Pone (o quita) un rótulo con nombre y cargo, como en entrevistas, unos segundos al inicio.', {
    proyecto, nombre: z.string().describe('"" para quitarlo'), cargo: z.string().optional(),
    segundo: z.number().min(0).default(0.8), duracion: z.number().min(1).max(15).default(4),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const p = await E.readProject(dir);
    p.finish.lowerThird = a.nombre.trim() ? { name: a.nombre.trim(), role: a.cargo?.trim() || undefined, at: a.segundo, duration: a.duracion } : undefined;
    return E.summarize(await E.writeProject(dir, p), dir);
  });

  tool('enlace_revision', 'Crea (o muestra) el enlace de revisión del cliente: ve el último video exportado, comenta en el segundo exacto y aprueba. Los comentarios llegan como peticiones (leer_peticiones). Funciona en la misma red con la app abierta en modo red.', {
    proyecto, nuevo: z.boolean().default(false).describe('true cambia el enlace (el anterior deja de funcionar)'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const token = a.nuevo ? await E.resetReviewToken(dir) : await E.ensureReviewToken(dir);
    const ips = E.lanAddresses();
    return `Enlace de revisión:\n${(ips.length ? ips : ['localhost']).map((ip) => `http://${ip}:${E.STUDIO_PORT}/r/${token}`).join('\n')}`;
  });

  tool('marca_de_agua', 'Pone (o quita) el logo de la marca fijo en una esquina del reel. Si la marca no tiene logo, usa su nombre. Sube el logo con logo_marca.', {
    proyecto, on: z.boolean().default(true),
    esquina: z.enum(['arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der']).default('arriba-der'),
    tamano: z.number().min(0.06).max(0.3).default(0.13).describe('Ancho del logo respecto al video'),
    opacidad: z.number().min(0.2).max(1).default(0.85),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const p = await E.readProject(dir);
    p.finish.watermark = a.on ? { corner: a.esquina, size: a.tamano, opacity: a.opacidad } : undefined;
    return E.summarize(await E.writeProject(dir, p), dir);
  });

  tool('logo_marca', 'Guarda el logo en la marca del cliente del proyecto (sirve para todos sus reels: marca de agua, cierre e imágenes). Mejor PNG con fondo transparente.', {
    proyecto, archivo: z.string().describe('Ruta absoluta de la imagen del logo'),
  }, async (a) => {
    const p = await E.readProject(await resolveProject(a.proyecto));
    const kit = await E.saveClientLogo(p.client, a.archivo);
    return `Logo guardado en la marca «${kit.name}».`;
  });

  tool('crear_imagenes', 'Crea imágenes para redes a partir del reel: portada (mejor fotograma + gancho, 9:16), carrusel (4:5), post (4:5) o historia (9:16).', {
    proyecto, tipo: z.enum(['portada', 'carrusel', 'post', 'historia']),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = await E.createImages(dir, a.tipo);
    return `Imágenes creadas:\n${r.files.map((f) => path.join(dir, f)).join('\n')}`;
  });

  tool('idioma_subtitulos', 'Pone los subtítulos en otro idioma sin doblar la voz (en, pt, fr, it, de), traducidos con la IA local y sincronizados frase por frase. idioma vacío vuelve al idioma del video.', {
    proyecto, idioma: z.enum(['', 'en', 'pt', 'fr', 'it', 'de']),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    return E.summarize(await E.setCaptionLanguage(dir, a.idioma || null), dir);
  });

  tool('calidad_video', 'En videos de baja resolución (WhatsApp, capturas), rehace el video de edición desde el original: quita los bloques de compresión y agranda a 1080 con escalado fino (normal), o además le da nitidez (nitido). Cortes y textos no cambian.', {
    proyecto, calidad: z.enum(['normal', 'nitido']),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    return E.summarize(await E.setVideoQuality(dir, a.calidad), dir);
  });

  tool('camara_lenta', 'Pone una escena en cámara lenta suave (crea los fotogramas intermedios siguiendo el movimiento): velocidad 0.5 (2×), 0.33 (3×) o 0.25 (4×); 1 la devuelve a normal. La voz de esa escena no suena: úsala en montajes con música o tomas sin diálogo. Tarda unos 20 s por cada segundo de video en 4K.', {
    proyecto, escena: z.string(), velocidad: z.number().min(0.2).max(1),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    return E.summarize(await E.setSlowMotion(dir, a.escena, a.velocidad), dir);
  });

  tool('igualar_color_referencia', 'Iguala el color del reel a una imagen (o video) de referencia: mide los colores de ambos y crea un LUT a la medida, con fuerza ajustable. Los textos no cambian. Para quitarlo, usa el LUT "sin LUT" en el studio.', {
    proyecto, imagen: z.string().describe('Ruta absoluta de la imagen o video de referencia'),
    fuerza: z.number().min(0.1).max(1).default(0.85),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = await E.matchToReference(dir, a.imagen, { strength: a.fuerza });
    return `Color igualado (${r.project.finish.lut?.name}, fuerza ${r.project.finish.lut?.strength}).`;
  });

  tool('seguir_hablante', 'En videos horizontales con dos o más personas (pódcast, entrevista), el recorte vertical pasa a quien está hablando: detecta las caras y quién mueve la boca mientras hay voz. on=false vuelve al encuadre normal.', {
    proyecto, on: z.boolean().default(true),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = await E.setFollowSpeaker(dir, a.on);
    if (!a.on) return 'Encuadre normal.';
    return `${r.report?.tracks.length ?? 0} personas. Turnos: ${(r.report?.turns ?? []).map((t) => `${t.start}-${t.end} s → persona ${t.track + 1}`).join(', ') || 'ninguno (una sola persona)'}.`;
  });

  tool('montaje_al_ritmo', 'En un montaje con música, pone cada corte justo en un golpe de la canción (detecta tempo, compás y dónde sube la energía). densidad: auto (más cortes donde la música es fuerte), pulso, medio (cada 2) o compas (cada 4).', {
    proyecto, densidad: z.enum(['auto', 'pulso', 'medio', 'compas']).default('auto'),
    duracion: z.number().optional().describe('Segundos; por defecto lo que dura la voz en off o hasta 30 s'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const r = await E.montageToBeat(dir, { density: a.densidad, duration: a.duracion });
    return `${r.cuts} cortes en los golpes (${r.bpm} BPM), ${r.duration.toFixed(1)} s${r.drop != null ? `, destello en ${r.drop.toFixed(1)} s` : ''}.\n` + E.summarize(r.project, dir);
  });

  tool('doblar', 'Crea una copia del reel doblada a otro idioma (en, pt, fr, it, de): traduce cada frase con la IA local, genera la voz, la ajusta al tiempo de cada frase y traduce subtítulos y textos en pantalla. El reel original no cambia. Hacerlo cuando el corte esté terminado.', {
    proyecto, idioma: z.enum(['en', 'pt', 'fr', 'it', 'de']),
    voz: z.enum(['elevenlabs', 'piper', 'sistema']).optional(),
  }, async (a) => {
    const r = await E.dubProject(await resolveProject(a.proyecto), a.idioma, { provider: a.voz });
    return `Copia doblada: ${r.id} (${r.lines} frases, voz ${r.provider}${r.voice ? ` ${r.voice}` : ''}${r.tight ? `; ${r.tight} frases quedaron justas de tiempo` : ''}).`;
  });

  tool('sugerir_motion', 'Lista todos los motion graphics que se pueden armar SOLOS con lo que se dice en una escena (pregunta, porcentaje, número, antes y después, pasos, lista con vistos, palabras en movimiento, frase destacada…), ya llenos con las cifras y frases reales. Aplica uno con `aplicar`.', {
    proyecto, escena: z.string(), aplicar: z.string().optional().describe('Id de la idea a aplicar, p. ej. m2'),
  }, async ({ proyecto, escena, aplicar }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.readProject(dir);
    const s = p.scenes.find((x) => x.id === escena);
    if (!s) throw new Error(`No existe la escena ${escena}.`);
    const ideas = motionGallery(p, s, await E.readTranscript(dir));
    if (aplicar) {
      const v = ideas.find((x) => x.id === aplicar);
      if (!v) throw new Error(`No existe la idea ${aplicar}. Ideas: ${ideas.map((x) => x.id).join(', ')}.`);
      applyVariant(s, v);
      s.chosenVariant = undefined;
      return E.summarize(await E.writeProject(dir, p), dir);
    }
    return ideas.map((v) => `${v.id} · ${v.label} — ${v.notes}${v.motionData ? ` · datos: ${JSON.stringify(v.motionData)}` : ''}`).join('\n');
  });

  tool('poner_motion', 'Convierte una escena en motion graphics a pantalla completa (la voz sigue sonando). Antes prueba sugerir_motion, que los arma solos. Plantillas: barras {items:[{label,value}], unidad?} · contador {valor, prefijo?, sufijo?, etiqueta?} · porcentaje {valor, etiqueta?} · lista {items:[texto]} · checklist {items} · pasos {items} · comparacion {izquierda, derecha, tituloIzquierda?, tituloDerecha?} · pregunta {pregunta} · cita {texto, autor?} · palabras (cada palabra enorme cuando se dice) · logo {texto?} · texto (usa el texto en pantalla). Usa solo datos que dio el usuario: lo que falte se muestra como [DATO].', {
    proyecto, escena: z.string(), plantilla: z.enum(['barras', 'contador', 'porcentaje', 'lista', 'checklist', 'pasos', 'comparacion', 'pregunta', 'cita', 'palabras', 'logo', 'texto']), datos: z.record(z.string(), z.any()).default({}),
  }, async ({ proyecto, escena, plantilla, datos }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.setMotion(dir, escena, plantilla, datos), dir);
  });

  tool('poner_logo', 'Guarda el logo del cliente en el proyecto para la plantilla "logo".', { proyecto, archivo: z.string() }, async ({ proyecto, archivo }) => {
    await E.setLogo(await resolveProject(proyecto), archivo);
    return 'Logo guardado.';
  });

  tool('ajustar_encuadre', 'Encuadre del recorte. Por defecto es automático y sigue la cara. Con foco_x se fija a mano (0 izquierda, 0.5 centro, 1 derecha); con automatico=true vuelve a seguir la cara.', {
    proyecto, foco_x: z.number().min(0).max(1).optional(), automatico: z.boolean().optional(),
  }, async ({ proyecto, foco_x, automatico }) => {
    const dir = await resolveProject(proyecto);
    if (automatico || foco_x === undefined) {
      await E.setFocus(dir, 'auto');
      const n = (await E.readFaces(dir)).length;
      return n ? `Encuadre automático: sigue la cara (detectada en ${n} momentos).` : 'Encuadre automático, pero no se detectó ninguna cara: queda centrado.';
    }
    await E.setFocus(dir, foco_x);
    return `Encuadre fijo: ${foco_x}`;
  });

  tool(
    'crear_montaje',
    'Crea un proyecto de MONTAJE para videos sin voz (gimnasio, comida, producto, cortes rápidos): une uno o varios videos, detecta las tomas y arma cortes cortos repartidos entre ellas. Con música, los cortes van al compás. Tarda 1–5 minutos. Devuelve el resumen y las tomas con una miniatura de cada una para que las mires.',
    {
      videos: z.array(z.string()).min(1).describe('Rutas absolutas de videos o de una carpeta'),
      cliente: z.string().optional(),
      nombre: z.string().optional(),
      preset: z.string().default('rapido').describe('rapido = cortes de ~0,8 s; con-ritmo = ~1,2 s; sobrio = ~2 s'),
      duracion: z.number().min(3).max(180).optional().describe('Duración del montaje en segundos (por defecto 15)'),
    },
    async ({ videos, cliente, nombre, preset, duracion }) => {
      const { dir } = await E.createMontage({ inputs: videos, name: nombre, client: cliente, presetId: preset });
      await E.prepareMedia(dir, log);
      const shots = await E.detectShots(dir);
      const m = await E.buildMontage(dir, { duration: duracion });
      return [
        E.summarize(m.project, dir),
        `Montaje: ${m.project.scenes.length} cortes de ~${m.clip.toFixed(2)} s · ${m.duration.toFixed(1)} s`,
        '',
        'Tomas (mira las miniaturas para elegir las mejores con armar_montaje):',
        E.formatShots(shots, await E.shotThumbnails(dir, shots)),
      ].join('\n');
    },
  );

  tool('leer_tomas', 'Tomas detectadas en un montaje, con la ruta de una miniatura de cada una.', { proyecto }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    const shots = await E.detectShots(dir);
    return E.formatShots(shots, await E.shotThumbnails(dir, shots));
  });

  tool(
    'armar_montaje',
    'Rehace los cortes de un montaje. Sin "tomas", reparte cortes automáticamente (al compás si hay música; con voz en off dura lo que la voz). Con "tomas", usa exactamente las que elijas y en ese orden.',
    {
      proyecto,
      duracion: z.number().min(2).max(180).optional(),
      largo_corte: z.number().min(0.3).max(10).optional().describe('Segundos por corte'),
      tomas: z.array(z.object({
        toma: z.string().describe('Id de la toma, p. ej. t03'),
        inicio: z.number().min(0).optional().describe('Segundos desde el inicio de la toma (por defecto, el centro)'),
        duracion: z.number().min(0.2).optional(),
      })).optional(),
    },
    async ({ proyecto, duracion, largo_corte, tomas }) => {
      const dir = await resolveProject(proyecto);
      const m = await E.buildMontage(dir, { duration: duracion, clipLength: largo_corte, picks: tomas });
      return `${E.summarize(m.project, dir)}\nCortes de ~${m.clip.toFixed(2)} s${m.beat ? ' al compás de la música' : ''} · ${m.duration.toFixed(1)} s`;
    },
  );

  tool(
    'poner_voz_en_off',
    'Genera una voz en off con el texto dado, la subtitula y la pone desde el inicio del reel. Proveedores: elevenlabs (mejor; necesita ELEVENLABS_API_KEY en .env), piper (local) y sistema (voz del computador, gratis, más robótica). Sin proveedor usa el mejor disponible. En un video hablado silencia la voz original; en un montaje deja el ambiente bajo. El texto lo escribe o lo aprueba el usuario.',
    {
      proyecto,
      texto: z.string().min(2),
      proveedor: z.enum(['elevenlabs', 'piper', 'sistema']).optional(),
      voz: z.string().optional().describe('Nombre o id de la voz (p. ej. "Paulina" o "Mónica" en Mac)'),
      volumen_original: z.number().min(0).max(1).optional(),
    },
    async ({ proyecto, texto, proveedor, voz, volumen_original }) => {
      const dir = await resolveProject(proyecto);
      const p = await E.setVoiceover(dir, texto, { provider: proveedor, voice: voz, originalVolume: volumen_original });
      const v = p.audio.voiceover!;
      const extra = p.kind === 'montaje' ? ' Vuelve a llamar armar_montaje para que el montaje dure lo que la voz.' : '';
      return `Voz en off lista: ${v.provider}${v.voice ? ` (${v.voice})` : ''} · ${v.duration.toFixed(1)} s · sonido original a ${p.audio.originalVolume}.${extra}`;
    },
  );

  tool('quitar_voz_en_off', 'Quita la voz en off y devuelve el sonido original.', { proyecto }, async ({ proyecto }) => {
    await E.removeVoiceover(await resolveProject(proyecto));
    return 'Voz en off quitada.';
  });

  tool('voces_disponibles', 'Proveedores de voz en off disponibles en este computador.', {}, async () => {
    const list = await E.ttsProviders();
    return list.length ? `Disponibles (del mejor al más básico): ${list.join(', ')}` : 'No hay ningún proveedor de voz disponible.';
  });

  tool('ajustar_sonido_original', 'Volumen del sonido original del video (0 = silenciado, 1 = normal).', { proyecto, volumen: z.number().min(0).max(1) }, async ({ proyecto, volumen }) => {
    await E.setOriginalVolume(await resolveProject(proyecto), volumen);
    return `Sonido original: ${volumen}`;
  });

  tool('listar_versiones', 'Versiones guardadas del proyecto, más recientes primero.', { proyecto }, async ({ proyecto }) => {
    const v = await E.listVersions(await resolveProject(proyecto));
    return v.length ? v.join('\n') : 'No hay versiones guardadas.';
  });

  tool('comparar_version', 'Compara una versión guardada con el estado actual.', { proyecto, version: z.string() }, async ({ proyecto, version }) =>
    E.compareVersion(await resolveProject(proyecto), version));

  tool('restaurar_version', 'Vuelve a una versión guardada. Antes guarda la actual como respaldo.', { proyecto, version: z.string() }, async ({ proyecto, version }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.restoreVersion(dir, version), dir);
  });

  tool('renderizar', 'Renderiza el reel a MP4. Formatos: 9:16 (1080×1920, por defecto), 4:5 (1080×1350) y 1:1 (1080×1080). Tarda aproximadamente lo que dura el video.', {
    proyecto, formato: z.enum(['9:16', '4:5', '1:1', '16:9']).default('9:16'),
    calidad: z.enum(['maxima', 'alta', 'ligera']).optional().describe('Por defecto, la del proyecto (alta)'),
  }, async ({ proyecto, formato, calidad }) => {
    const dir = await resolveProject(proyecto);
    let last = -1;
    const { out } = await E.renderProject(dir, {
      format: formato,
      quality: calidad,
      onProgress: (p) => {
        const pct = Math.floor(p * 4) * 25;
        if (pct !== last) log(`render ${(last = pct)}%`);
      },
    });
    const info = await E.probe(out);
    const lufs = await E.measureLufs(out);
    return `Render listo: ${out}\n${info.width}×${info.height} · ${info.duration.toFixed(1)} s · ${lufs.toFixed(1)} LUFS`;
  });

  return server;
}

/** Arranca el servidor por stdio (lo usa bin/server.mjs). */
export async function main() {
  await createServer().connect(new StdioServerTransport());
  log('servidor MCP listo');
}
