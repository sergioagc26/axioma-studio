import { existsSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_NAME, FONT_FAMILIES } from '@snz/schema';
import * as E from '@snz/engine';

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

export function createServer() {
  const server = new McpServer({ name: 'snz-studio', version: '0.2.0' });

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
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const p = await E.editScene(dir, a.escena, {
      role: a.rol, title: a.titulo, onScreenText: a.texto_en_pantalla, textColor: a.color_texto, visual: a.visual, punchZoom: a.zoom, phrases: a.frases,
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
    'Guarda las variantes que propones para una escena (2 a 4, distintas entre sí). Se identifican como a, b, c, d.',
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
        notas: z.string().optional(),
      })).min(2).max(4),
    },
    async ({ proyecto, escena, variantes }) => {
      const dir = await resolveProject(proyecto);
      const p = await E.setVariants(dir, escena, variantes.map((v) => ({
        label: v.etiqueta, visual: v.visual, onScreenText: v.texto_en_pantalla, textColor: v.color_texto,
        brollFile: v.broll, motionTemplate: v.motion, notes: v.notas,
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
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const patch = Object.fromEntries(Object.entries({
      mode: a.modo, wordsPerLine: a.palabras_por_linea, fontFamily: a.fuente, fontSize: a.tamano,
      color: a.color, highlightColor: a.color_resaltado, uppercase: a.mayusculas, y: a.posicion_y,
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
  }, async (a) => {
    const p = await E.readProject(await resolveProject(a.proyecto));
    const kit = await E.saveKit(p.client, {
      name: a.nombre, primary: a.color_primario, secondary: a.color_secundario, text: a.color_texto,
      heading: a.fuente_titulos, body: a.fuente_texto, logo: a.logo,
    });
    return `Kit guardado para ${p.client ?? 'personal'}:\n${JSON.stringify(kit, null, 2)}`;
  });

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

  tool('poner_motion', 'Convierte una escena en motion graphics a pantalla completa (la voz sigue sonando). Plantillas: barras {items:[{label,value}], unidad?} · contador {valor, prefijo?, sufijo?, etiqueta?} · lista {items:[texto]} · logo {texto?} · texto (usa el texto en pantalla). Usa solo datos que dio el usuario: lo que falte se muestra como [DATO].', {
    proyecto, escena: z.string(), plantilla: z.enum(['barras', 'contador', 'lista', 'logo', 'texto']), datos: z.record(z.string(), z.any()).default({}),
  }, async ({ proyecto, escena, plantilla, datos }) => {
    const dir = await resolveProject(proyecto);
    return E.summarize(await E.setMotion(dir, escena, plantilla, datos), dir);
  });

  tool('poner_logo', 'Guarda el logo del cliente en el proyecto para la plantilla "logo".', { proyecto, archivo: z.string() }, async ({ proyecto, archivo }) => {
    await E.setLogo(await resolveProject(proyecto), archivo);
    return 'Logo guardado.';
  });

  tool('ajustar_encuadre', 'Mueve el punto de interés horizontal al recortar un video horizontal a vertical (0 izquierda, 0.5 centro, 1 derecha).', {
    proyecto, foco_x: z.number().min(0).max(1),
  }, async ({ proyecto, foco_x }) => {
    await E.setFocus(await resolveProject(proyecto), foco_x);
    return `Encuadre: ${foco_x}`;
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
    proyecto, formato: z.enum(['9:16', '4:5', '1:1']).default('9:16'),
  }, async ({ proyecto, formato }) => {
    const dir = await resolveProject(proyecto);
    let last = -1;
    const { out } = await E.renderProject(dir, {
      format: formato,
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
