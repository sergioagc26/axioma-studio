import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_NAME, FONT_FAMILIES, applyVariant, motionGallery, reelScore } from '@axioma/schema';
import * as S from '@axioma/schema';
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

  tool('leer_pedidos', 'Pedidos de la carpeta «Para editar»: cada carpeta (o video suelto) es un video por hacer. Dice qué trajo cada uno (videos, pedido.txt, guion, referencia, logo, música) y si ya está listo. Es lo primero que se mira cuando la persona dice «hazme el video».', {}, async () => {
    const { inbox, ready } = await E.ensureInbox();
    const orders = await E.listOrders();
    const withText = await Promise.all(orders.map(async (o) => {
      const pedido = o.files.pedido ? (await readFile(o.files.pedido, 'utf8').catch(() => '')).trim() : '';
      const leido = pedido ? E.parseOrder(pedido) : null;
      return leido && Object.keys(leido.brief).length + (leido.client ? 1 : 0)
        ? `\n  lo que pide: ${[leido.client && `marca ${leido.client}`, ...Object.entries(leido.brief).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' · ')}`
        : '';
    }));
    const list = orders.length ? orders.map((o, i) => E.formatOrders([o]) + withText[i]).join('\n') : 'No hay pedidos todavía.';
    return `Carpeta de pedidos: ${inbox}\nVideos terminados: ${ready}\n\n${list}`;
  });

  tool('traer_de_enlace', 'Baja a un pedido de «Para editar» lo que la persona compartió por enlace (Google Drive: un archivo; Dropbox: archivo o carpeta entera; o un enlace directo). Es como entra el material cuando se trabaja sin instalar nada (en la nube no se pueden arrastrar archivos). Llámala una vez por enlace; después usa hacer_video con el mismo pedido.', {
    enlace: z.string().describe('El enlace tal como lo copió la persona'),
    pedido: z.string().describe('Nombre del pedido (carpeta). Si no existe, se crea.'),
  }, async ({ enlace, pedido }) => {
    const r = await E.fetchToOrder(enlace, pedido, { onProgress: log });
    const c = r.classified;
    const mb = (r.bytes / 1e6).toFixed(r.bytes > 1e8 ? 0 : 1);
    return [
      `Bajé ${r.files.length} archivo(s) (${mb} MB) al pedido «${r.pedido}»: ${r.files.join(', ')}.`,
      `El pedido tiene ahora: ${c.videos.length} video(s)${c.referencias.length ? `, ${c.referencias.length} referencia(s)` : ''}${c.pedido ? ', pedido' : ''}${c.guion ? ', guion' : ''}${c.logo ? ', logo' : ''}${c.musica ? ', música' : ''}.`,
    ].join('\n');
  });

  tool(
    'hacer_video',
    'UN PEDIDO → VIDEO TERMINADO, sin preguntar: toma un pedido de «Para editar», reconoce lo que hay (alguien hablando a cámara, varias partes habladas que se unen, o video sin voz que va como montaje), usa el pedido.txt, el guion (corta con él), la referencia (su estilo), el logo y la música si vienen, edita todo (corte, gancho, subtítulos, textos, música, efectos) y deja el MP4 en «Listos». Tarda de 3 a 15 minutos. "respuestas" agrega o corrige lo del pedido (claves del brief: objetivo, formato, duracion, ritmo, tono, publico, cta, notas).',
    {
      pedido: z.string().optional().describe('Nombre de la carpeta (o del video suelto). Vacío: el único pendiente.'),
      cliente: z.string().optional().describe('Marca o cliente; si no, el que diga el pedido o "personal"'),
      respuestas: z.record(z.string(), z.string()).optional(),
      exportar: z.boolean().default(true).describe('false: deja el proyecto editado sin exportar (para revisarlo antes)'),
    },
    async ({ pedido, cliente, respuestas, exportar }) => {
      const r = await E.makeOrder(pedido, { client: cliente, brief: respuestas, render: exportar, onProgress: log });
      const project = await E.readProject(r.dir);
      return [
        `Pedido «${r.order}» · ${r.kind === 'hablado' ? 'video hablado' : 'montaje sin voz'}`,
        r.out ? `Video listo: ${r.out}` : 'Editado, aún sin exportar (usa entregar_video).',
        '',
        'Lo que hice:',
        ...r.summary.map((x) => `- ${x}`),
        r.broll.length ? `\nVideos sin voz para apoyo (ponlos con usar_broll, archivo local, licencia "propia"): ${r.broll.join(', ')}` : '',
        '',
        E.summarize(project, r.dir),
      ].join('\n');
    },
  );

  tool('entregar_video', 'Vuelve a exportar el video de un pedido (después de pedir cambios) y lo deja en «Listos» con el nombre del pedido. El anterior se guarda con su fecha.', {
    pedido: z.string().describe('Nombre del pedido'),
    proyecto: z.string().optional().describe('Id del proyecto si no es el que hizo hacer_video'),
  }, async ({ pedido, proyecto }) => {
    const order = await E.findOrder(pedido);
    const dir = proyecto ? await resolveProject(proyecto) : order.state.dir;
    if (!dir) throw new Error(`El pedido «${order.name}» aún no tiene proyecto: usa hacer_video.`);
    const out = await E.deliverOrder(order.name, dir);
    return `Video listo: ${out}`;
  });

  tool(
    'crear_proyecto',
    'Crea un proyecto desde un video: copia el archivo, crea master y proxy, limpia y nivela la voz, transcribe con Whisper y aplica un primer corte automático. Tarda de 1 a 5 minutos según la duración. Devuelve el resumen y las frases numeradas para armar el storyboard.',
    {
      video: z.string().describe('Ruta absoluta del video'),
      cliente: z.string().optional().describe('Cliente (carpeta). Por defecto "personal".'),
      nombre: z.string().optional(),
      preset: z.string().default('rapido').describe('Preset inicial: rapido, con-ritmo, sobrio o uno del cliente'),
      forma: z.enum(['vertical', 'horizontal', 'cuadrado']).optional().describe('Forma del video: vertical (reels, por defecto), horizontal (YouTube) o cuadrado'),
      en_4k: z.boolean().optional().describe('Conservar el 4K del material (más lento y pesado)'),
    },
    async ({ video, cliente, nombre, preset, forma, en_4k }) => {
      const { dir } = await E.createProject({ input: video, name: nombre, client: cliente, presetId: preset, shape: forma, uhd: en_4k });
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

  tool(
    'crear_reel_creador',
    'UN SOLO PEDIDO → reel de creador completo (como los de «X + Claude»): guion a la duración pedida, voz, avatar que habla (o tu video), palabras gigantes al ritmo de la voz (también detrás de la persona), objetos según lo que se dice (chat, onda de voz, tarjetas, tachados, caja amarilla), grabaciones de la app flotando, acercamientos de golpe, música y efectos; exporta y revisa el resultado. Con avatar tarda ~1,5 min por segundo de video la primera vez (luego usa la caché). Escribe tú el guion (mejor que la IA local) y pásalo en «guion».',
    {
      guion: z.string().optional().describe('Lo que dice, ya escrito (recomendado). ~2,6 palabras por segundo.'),
      idea: z.string().optional().describe('Si no hay guion: de qué trata (la IA local lo escribe)'),
      referencia: z.string().optional().describe('Id de una referencia analizada (su estructura guía el guion)'),
      duracion: z.number().min(10).max(180).default(60),
      avatar: z.string().optional().describe('Avatar guardado (avatares_guardados). Por defecto, el primero.'),
      video: z.string().optional().describe('O un video tuyo hablando a cámara (ruta absoluta), en vez de avatar'),
      cliente: z.string().optional(),
      nombre: z.string().optional(),
      cta: z.string().optional().describe('Palabra que se pide comentar (sale en caja amarilla al final)'),
      proveedor_voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
      voz: z.string().optional(),
      musica: z.string().optional(),
      borrador: z.boolean().optional().describe('Borrador rápido (minutos): la cara quieta y exportación liviana, para revisar antes de la versión final (que reutiliza la voz)'),
    },
    async ({ guion, idea, referencia, duracion, avatar, video, cliente, nombre, cta, proveedor_voz, voz, musica, borrador }) => {
      const r = await E.createCreatorReel({ script: guion, idea, reference: referencia, duration: duracion, avatar, video, client: cliente, name: nombre, cta, provider: proveedor_voz, voice: voz, music: musica, preview: borrador, onProgress: (m) => log(m) });
      return [`Reel listo: ${r.file}`, `Proyecto: ${r.dir}`, r.warnings.length ? `Revisión automática:\n- ${r.warnings.join('\n- ')}` : 'Revisión automática: sin problemas.', '', `Guion:\n${r.script}`].join('\n');
    },
  );

  tool('etiquetar_biblioteca', 'Mira con la IA que ve imágenes las grabaciones nuevas de workspace/marca/pantallas y las etiqueta solas (lo que muestran), para que los reels las elijan.', {}, async () => {
    const l = await E.autoTagLibrary(log);
    return `Biblioteca: ${l.length} grabaciones.\n${l.map((c) => `${c.file}: ${c.tags.join(', ')}`).join('\n')}`;
  });

  tool('describir_tomas', 'Describe en una frase cada toma de un proyecto (qué se ve), con la IA que ve imágenes. Sirve para elegir qué toma va con cada frase.', { proyecto }, async ({ proyecto }) => {
    const d = await E.describeShots(await resolveProject(proyecto), log);
    return d.map((x) => `${x.id}: ${x.desc}`).join('\n') || 'El proyecto no tiene tomas.';
  });

  tool('movimiento_avatar', 'Guarda un video de una persona real hablando de frente (tu grabación o tu avatar de HeyGen) para que los avatares copien su movimiento de cabeza y sus parpadeos: se ven mucho menos robóticos. Solo videos tuyos o con permiso.', {
    video: z.string().describe('Ruta absoluta del video (de frente, hablando, 8 a 30 s)'),
  }, async (a) => `Guardado: los próximos reels con avatar se mueven como esa persona (${await E.saveMotionRef(a.video)}).`);

  tool('avatares_guardados', 'Avatares guardados para los reels (nombre, descripción y voz).', {}, async () => {
    const l = await E.listAvatars();
    return l.length ? l.map((a) => `${a.id} · ${a.name}${a.description ? ` · ${a.description}` : ''}${a.voice?.voice ? ` · voz ${a.voice.provider ?? ''} ${a.voice.voice}` : ''}`).join('\n') : 'No hay avatares guardados: crea uno con crear_avatar y guárdalo con guardar_avatar.';
  });

  tool(
    'guardar_avatar',
    'Guarda un avatar (persona ficticia o tú mismo con tu permiso) con su cara, su voz y sus fondos, para hacer reels con crear_reel_creador.',
    {
      nombre: z.string(),
      cara: z.string().describe('Foto de la cara (de crear_avatar)'),
      descripcion: z.string().optional(),
      proveedor_voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
      voz: z.string().optional(),
      fondos: z.object({ estudio: z.string().optional(), noche: z.string().optional(), claro: z.string().optional(), oscuro: z.string().optional(), pc: z.string().optional() }).optional().describe('Imágenes de fondo (rutas). Se pueden crear con el generador local.'),
      miniaturas: z.array(z.string()).optional().describe('Portadas de reels para el collage del inicio'),
    },
    async ({ nombre, cara, descripcion, proveedor_voz, voz, fondos, miniaturas }) => {
      const a = await E.saveAvatar({ name: nombre, face: cara, description: descripcion, voice: { provider: proveedor_voz, voice: voz }, backgrounds: fondos, thumbnails: miniaturas });
      return `Avatar «${a.name}» guardado (${a.id}) en ${a.dir}.`;
    },
  );

  tool(
    'etiquetar_material',
    'Agrega una grabación de la app a la biblioteca con lo que muestra (etiquetas): los reels la ponen cuando la voz habla de eso.',
    {
      archivo: z.string().describe('Ruta (absoluta o relativa a workspace/marca/pantallas)'),
      inicio: z.number().min(0).optional(),
      fin: z.number().min(0).optional(),
      etiquetas: z.array(z.string()).min(1),
      claro: z.boolean().optional().describe('Se ve mejor sobre fondo claro'),
    },
    async ({ archivo, inicio, fin, etiquetas, claro }) => `Biblioteca: ${(await E.tagLibraryClip({ file: archivo, start: inicio, end: fin, tags: etiquetas, light: claro })).length} grabaciones.`,
  );

  tool('heygen_avatares', 'Tus avatares de HeyGen (y fotos que hablan): id, nombre y vista previa. Necesita la clave de HeyGen en Claves.', {}, async () => {
    const list = await E.heygenAvatars();
    if (!list.length) return 'Tu cuenta de HeyGen no tiene avatares.';
    return list.map((a) => `${a.kind === 'foto' ? 'foto' : 'avatar'} · ${a.name} · id ${a.id}${a.preview ? ` · ${a.preview}` : ''}`).join('\n');
  });

  tool(
    'heygen_hablando',
    'Un avatar de HeyGen dice un guion: genera la voz con la app (ElevenLabs u otra) o usa una voz de HeyGen, HeyGen anima tu avatar y la app baja el video vertical, listo para editarlo con crear_proyecto. Gasta créditos de tu plan de HeyGen. Solo avatares con consentimiento (tu gemelo, de stock o autorizados); al publicar, márcalo como hecho con IA.',
    {
      avatar: z.string().describe('Id del avatar (de heygen_avatares)'),
      tipo: z.enum(['avatar', 'foto']).default('avatar'),
      guion: z.string().describe('Lo que dice el avatar'),
      salida: z.string().describe('Ruta absoluta del video (.mp4)'),
      voz_heygen: z.string().optional().describe('Id de una voz de HeyGen; sin esto, la voz la hace la app (proveedor_voz/voz)'),
      proveedor_voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
      voz: z.string().optional(),
    },
    async ({ avatar, tipo, guion, salida, voz_heygen, proveedor_voz, voz }) => {
      let audio: string | undefined;
      if (!voz_heygen) {
        audio = salida.replace(/\.mp4$/i, '') + '-voz.mp3';
        log('Generando la voz…');
        await E.synthesize(guion, audio, { provider: proveedor_voz, voice: voz });
      }
      const out = await E.heygenVideo({ avatarId: avatar, kind: tipo, out: salida, audio, text: voz_heygen ? guion : undefined, voiceId: voz_heygen, onProgress: log });
      return `Video de tu avatar de HeyGen listo: ${out}`;
    },
  );

  tool(
    'crear_avatar',
    'Crea la cara de un AVATAR DE IA: una persona ficticia, fotorrealista, en plano medio vertical mirando a cámara (lo que mejor se anima). Tarda unos 5 minutos. Nunca describas ni imites a una persona real. Después usa avatar_hablando.',
    {
      descripcion: z.string().describe('Cómo es: edad, pelo, ropa, fondo. Ej.: «mujer latina de 28 años, pelo castaño ondulado, camiseta verde petróleo, estudio oscuro con luces cálidas»'),
      archivo: z.string().describe('Ruta absoluta donde guardar la foto (.png)'),
      semilla: z.number().int().optional(),
    },
    async ({ descripcion, archivo, semilla }) => `Cara del avatar guardada en ${await E.createAvatarFace(descripcion, archivo, semilla)}. Mírala antes de usarla.`,
  );

  tool(
    'avatar_hablando',
    'Hace que un avatar de IA diga un guion: genera la voz y anima la cara (boca, parpadeo, gestos) en este computador. Tarda unos 30 segundos por segundo de voz. Devuelve un video vertical «hablando a cámara» que se edita con crear_proyecto como cualquier otro. Al publicar, márcalo como hecho con IA.',
    {
      cara: z.string().describe('Foto del avatar (de crear_avatar)'),
      guion: z.string().describe('Lo que dice el avatar'),
      salida: z.string().describe('Ruta absoluta del video (.mp4)'),
      proveedor_voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
      voz: z.string().optional(),
    },
    async ({ cara, guion, salida, proveedor_voz, voz }) => {
      if (!E.avatarReady()) return 'Falta el motor de avatares: corre scripts/instalar-avatares.sh una vez (unos 3 GB).';
      return `Video del avatar listo: ${await E.avatarVideo({ face: cara, text: guion, out: salida, provider: proveedor_voz, voice: voz, onProgress: log })}`;
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

  tool('guardar_brief', 'Guarda respuestas del brief (formato, objetivo, publico, ritmo, tono, duracion, cta, producto, canal, contacto, cierre, voz, prohibido, notas). Claves nuevas: producto = productos y precios reales; canal = dónde compra el cliente (' + S.CANALES.join(', ') + '); contacto = web, número o dirección que dio el usuario; cierre = ' + S.CIERRES.join(', ') + '; voz = ' + S.BRIEF_VOICES.map((v) => v.value).join(', ') + '; prohibido = separado por comas: ' + S.PROHIBIDOS.join(', ') + '.', {
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
    // Queda elegida en el brief: es la única referencia que manda al editar.
    p.brief.referencia = report.id;
    await E.writeProject(dir, p);
    if (aplicar) await E.applyPreset(dir, preset.id);
    return `Plantilla ${preset.id} guardada${aplicar ? ' y aplicada' : ''}. Referencia elegida en el brief.\n${E.summarize(await E.readProject(dir), dir)}`;
  });

  tool('elegir_referencia', 'Elige en el brief la referencia que manda al editar (su ritmo, subtítulos y textos). Con "ninguna" se edita sin referencia. Es la única que cuenta: sin elegir, no se usa ninguna.', {
    proyecto, referencia: z.string().describe('Id de listar_referencias, o "ninguna"'),
  }, async ({ proyecto, referencia }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.readProject(dir);
    if (referencia !== 'ninguna' && !(await E.listReferences(p.client)).some((r) => r.id === referencia)) throw new Error(`No existe la referencia ${referencia}.`);
    p.brief.referencia = referencia;
    await E.writeProject(dir, p);
    return referencia === 'ninguna' ? 'Listo: se editará sin referencia.' : `Listo: se editará siguiendo la referencia ${referencia}.`;
  });

  tool('renombrar_referencia', 'Cambia el nombre con el que se ve una referencia (su id no cambia).', {
    proyecto, referencia: z.string(), nombre: z.string(),
  }, async ({ proyecto, referencia, nombre }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const r = await E.renameReference(p.client, referencia, nombre);
    return `Referencia ${r.id} ahora se llama «${r.name}».`;
  });

  tool('quitar_referencia', 'Quita una referencia: va a la papelera (se puede recuperar) junto con los estilos guardados a partir de ella, y los videos que la tenían elegida quedan sin referencia.', {
    proyecto, referencia: z.string(),
  }, async ({ proyecto, referencia }) => {
    const p = await E.readProject(await resolveProject(proyecto));
    const rest = await E.deleteReference(p.client, referencia);
    return `Referencia ${referencia} quitada (está en la papelera). Quedan ${rest.length}.`;
  });

  tool('aplicar_cortes', 'Rehace el corte automático (borra el storyboard actual). Opcionalmente cambia de preset. Si el video se cortó con un guion, lo vuelve a cortar con ese guion; con olvidar_guion=true vuelve al corte automático.', {
    proyecto, preset: z.string().optional(), olvidar_guion: z.boolean().default(false),
  }, async ({ proyecto, preset, olvidar_guion }) => {
    const dir = await resolveProject(proyecto);
    const r = await E.cutProject(dir, preset, { ignoreScript: olvidar_guion });
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
    sin_audio: z.boolean().optional().describe('true = silencia el sonido original de esta escena (tomas de producto con ruido de fondo). Nunca lo uses en una escena donde se ve a alguien hablando: se vería mal.'),
    frases: z.array(z.string()).optional(),
    estilo_texto: textStyle.optional().describe('caja = recuadro de color · resaltado = clave en color y más grande · marcador = trazo de marcador detrás de la clave · gigante = la clave enorme y el resto pequeño · subrayado · neon = brillo · banda = franja de titular'),
    palabra_clave: z.string().optional().describe('Palabra del texto que se remarca. Sin valor se elige sola la más importante.'),
    posicion_texto: z.enum(['arriba', 'centro']).optional(),
    imagen: look.optional().describe('bn = blanco y negro · calido · frio · contraste'),
    camara: camera.optional().describe('Movimiento durante la escena. En fotos con profundidad (b-roll de imagen), orbita gira alrededor del sujeto y foco pasa el foco del fondo a lo cercano.'),
    subtitulos_y: z.number().min(0).max(1).optional().describe('Altura de los subtítulos en esta escena (0 arriba, 1 abajo); se limita a la zona segura de la red. Úsalo para ponerlos en la franja libre y no sobre el producto.'),
    texto_y: z.number().min(0).max(1).optional().describe('Altura del rótulo de esta escena (0 arriba, 1 abajo), dentro de la zona segura.'),
    distribucion_broll: z.enum(['completo', 'arriba', 'abajo', 'recuadro']).optional().describe('Con b-roll: completo · arriba (pantalla dividida, b-roll arriba y la persona abajo) · abajo · recuadro (la persona en una ventanita sobre el b-roll)'),
  }, async (a) => {
    const dir = await resolveProject(a.proyecto);
    const p = await E.editScene(dir, a.escena, {
      brollLayout: a.distribucion_broll,
      role: a.rol, title: a.titulo, onScreenText: a.texto_en_pantalla, textColor: a.color_texto, visual: a.visual, punchZoom: a.zoom, sinAudio: a.sin_audio, captionY: a.subtitulos_y, textY: a.texto_y, phrases: a.frases,
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

  tool('guardar_resultados', 'Anota cómo le fue a un reel publicado: vistas, me gusta, comentarios, compartidos y guardados (las cifras las da el usuario, nunca se inventan). Con 4 o más reels de un cliente, la app aprende qué le funciona (usa aprender_resultados).', {
    proyecto, red: z.enum(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin']).default('instagram'),
    fecha: z.string().optional().describe('Día en que se publicó, AAAA-MM-DD. Por defecto hoy.'),
    hora: z.string().optional().describe('Hora de publicación HH:MM, si se sabe.'),
    vistas: z.number().int().positive(), me_gusta: z.number().int().min(0).optional(), comentarios: z.number().int().min(0).optional(),
    compartidos: z.number().int().min(0).optional(), guardados: z.number().int().min(0).optional(),
  }, async (a) => {
    const p = await E.readProject(await resolveProject(a.proyecto));
    let entry = (await E.listEntries()).find((e) => e.projectId === p.id && e.network === a.red);
    if (!entry) {
      const list = await E.addEntry({ projectId: p.id, date: a.fecha ?? new Date().toISOString().slice(0, 10), time: a.hora, network: a.red });
      entry = list.find((e) => e.projectId === p.id && e.network === a.red)!;
    } else if (a.fecha || a.hora) await E.updateEntry(entry.id, { ...(a.fecha ? { date: a.fecha } : {}), ...(a.hora ? { time: a.hora } : {}) });
    await E.updateEntry(entry.id, { metrics: { views: a.vistas, likes: a.me_gusta, comments: a.comentarios, shares: a.compartidos, saves: a.guardados } });
    const i = await E.learnFromResults(p.client, true);
    return `Resultados guardados para «${p.name}» en ${a.red}.\n\n${E.formatInsights(i)}`;
  });

  tool('aprender_resultados', 'Dice qué le funciona a un cliente según los resultados reales de sus reels (diseño de subtítulos, textos, duración, música, hora y día) y lo deja como estilo por defecto de sus próximos reels.', {
    cliente: z.string().optional().describe('Cliente (carpeta). Por defecto "personal".'),
  }, async ({ cliente }) => E.formatInsights(await E.learnFromResults(cliente, true)));

  tool('revisar_publicacion', 'Antes de publicar: dice qué video se subiría, en qué cuenta, con qué texto, el cupo del día y si algo lo impide. No publica nada. Úsala para enseñarle todo al usuario y pedirle que confirme.', {
    proyecto, red: z.enum(['instagram', 'facebook']).default('instagram'),
    cuenta: z.string().optional().describe('Id de la cuenta (ig-… o fb-… para una página de Facebook), si hay varias conectadas.'),
  }, async (a) => {
    const r = await E.prePublish(await resolveProject(a.proyecto), a.red, a.cuenta);
    const acc = r.cuentas.find((c) => c.id === r.cuenta);
    return [
      `Video: ${r.archivo ?? '(ninguno)'}${r.archivo ? ` · ${(r.peso / 1e6).toFixed(1)} MB · ${Math.round(r.duracion)} s` : ''}`,
      `Cuenta: ${acc ? `@${acc.usuario}` : `(elige una: ${r.cuentas.map((c) => `${c.id} = @${c.usuario}`).join(', ') || 'ninguna conectada'})`}`,
      ...(r.cupo?.total ? [`Hoy: ${r.cupo.usadas} de ${r.cupo.total} publicaciones.`] : []),
      `Texto:\n${r.texto}`,
      ...r.avisos.map((x) => `Aviso: ${x}`),
      ...r.problemas.map((x) => `No se puede publicar: ${x}`),
      r.listo ? 'Listo para publicar si el usuario lo confirma.' : 'Todavía no se puede publicar.',
    ].join('\n');
  });

  tool('publicar_en_redes','Publica el último video vertical exportado del reel como Reel de Instagram o de una página de Facebook, en la cuenta conectada. ES PÚBLICO Y NO SE PUEDE DESHACER desde la app: úsala solo cuando el usuario pida explícitamente publicar ese reel en esa red, nunca por iniciativa propia ni como parte de «termina el video». Antes usa revisar_publicacion y dile en qué cuenta saldrá y con qué texto.', {
    proyecto, red: z.enum(['instagram', 'facebook']).default('instagram'),
    confirmado: z.boolean().describe('true solo si el usuario pidió explícitamente publicar este reel ahora.'),
    cuenta: z.string().optional().describe('Id de la cuenta (ig-… o fb-…), si hay varias conectadas.'),
    texto: z.string().optional().describe('Texto de la publicación. Por defecto, el texto para publicar del reel.'),
    repetir: z.boolean().optional().describe('Publicarlo aunque ya se haya publicado antes desde la app.'),
  }, async (a) => {
    if (!a.confirmado) return 'No se publicó nada: publicar es público y no se deshace, y hace falta que el usuario lo pida explícitamente.';
    const dir = await resolveProject(a.proyecto);
    const r = await E.publishReel(dir, { red: a.red, cuenta: a.cuenta, texto: a.texto, repetir: a.repetir }, (m) => log(m));
    return [`Publicado en ${a.red === 'facebook' ? `la página de Facebook «${r.cuenta}»` : `Instagram (@${r.cuenta})`}${r.url ? `: ${r.url}` : '.'}`, ...(r.aviso ? [r.aviso] : [])].join('\n');
  });

  tool('traer_resultados', 'Trae de Instagram las cifras reales (vistas, me gusta, comentarios, compartidos y guardados) de lo publicado desde la app y actualiza lo que le funciona al cliente. No inventa cifras: lo que Instagram aún no da queda pendiente. Úsala solo cuando el usuario pida ver o actualizar sus resultados.', {
    cliente: z.string().optional().describe('Cliente (carpeta). Por defecto, todos.'),
  }, async ({ cliente }) => {
    const r = await E.syncMetrics({ cliente, force: true });
    return [
      `Cifras actualizadas: ${r.actualizadas}. Sin datos todavía: ${r.pendientes}.`,
      ...r.errores.map((x) => `• ${x}`),
      ...(cliente ? ['', E.formatInsights(await E.learnFromResults(cliente, false))] : []),
    ].join('\n');
  });

  tool('actualizar_app','Revisa si hay una versión nueva de la app y, con aplicar=true, la instala (no pisa cambios hechos a mano). Después hay que reiniciar la app.', {
    aplicar: z.boolean().default(false),
  }, async ({ aplicar }) => {
    if (!aplicar) {
      const c = await E.checkUpdate();
      if (c.error) return c.error;
      return c.behind ? `Hay ${c.behind} cambio(s) nuevo(s):\n${c.changes.map((x) => `• ${x}`).join('\n')}` : `Ya tienes la última versión (${c.current}).`;
    }
    const r = await E.applyUpdate();
    return r.updated ? `${r.message} Reinicia la app (y Claude) para usar la versión nueva.` : r.message;
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

  tool('buscar_broll', 'Busca videos de stock para b-roll (verticales primero) en Pexels o Pixabay, el que tenga clave en .env (PEXELS_API_KEY o PIXABAY_API_KEY). Ambos permiten uso comercial gratuito.', {
    busqueda: z.string().describe('En inglés suele dar mejores resultados, p. ej. "person editing video on laptop"'),
  }, async ({ busqueda }) => {
    const list = await E.searchBroll(busqueda);
    return list.length ? list.map((v) => `${v.id} · ${v.source} · ${v.duration} s · ${v.width}×${v.height} · ${v.author} · ${v.url}`).join('\n') : 'Sin resultados.';
  });

  tool('usar_broll', 'Pone b-roll en una escena (la voz sigue sonando). Usa un id de buscar_broll o un archivo local con su licencia.', {
    proyecto,
    escena: z.string(),
    pexels_id: z.number().optional().describe('Id de un resultado de buscar_broll (Pexels o Pixabay)'),
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
    return E.summarize(await E.setBroll(dir, a.escena, file, { license: item.license, source: item.source, author: item.author, url: item.url }), dir);
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
    voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
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
      forma: z.enum(['vertical', 'horizontal', 'cuadrado']).optional().describe('Forma del video: vertical (reels, por defecto), horizontal (YouTube) o cuadrado'),
      en_4k: z.boolean().optional().describe('Conservar el 4K del material (más lento y pesado)'),
    },
    async ({ videos, cliente, nombre, preset, duracion, forma, en_4k }) => {
      const { dir } = await E.createMontage({ inputs: videos, name: nombre, client: cliente, presetId: preset, shape: forma, uhd: en_4k ? true : undefined });
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

  tool(
    'crear_pizarra',
    'Crea un video EXPLICATIVO DIBUJADO (estilo pizarra, como los reels de «haz estas tres cosas»): papel de fondo, una mano que dibuja con plumón cada ilustración y luego se colorea, título arriba con una *palabra* destacada, globos de cómic y subtítulos de cuaderno, con voz en off. Cada fila del guion es una escena que entra cuando la voz dice su frase. Las ilustraciones las crea el generador local (unos 5 minutos cada una): con 15 filas tarda más de una hora.',
    {
      nombre: z.string(),
      cliente: z.string().optional(),
      etiqueta: z.string().optional().describe('Etiqueta de la serie arriba, p. ej. «CASO 01 · REELS»'),
      filas: z.array(z.object({
        voz: z.string().describe('Lo que dice la voz en esta parte'),
        titulo: z.string().optional().describe('Título de arriba; *palabra* va destacada. Repetido = se queda quieto'),
        dibujo: z.string().describe('Qué se ve en la ilustración (mejor en inglés): personajes, objetos, acción'),
        globo: z.string().optional().describe('Globo de cómic al terminar el dibujo: ¡OJO!, ¡ÑAM!…'),
        dibujar: z.number().min(0).max(8).optional().describe('Segundos que tarda la mano en dibujar (0 = aparece ya coloreada)'),
      })).min(2),
      proveedor_voz: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
      voz: z.string().optional(),
      musica: z.string().optional().describe('Ruta de una música suave (opcional)'),
      brief: z.record(z.string(), z.string()).optional().describe('Respuestas del brief: objetivo, publico, tono, cta… (el proyecto queda con su brief)'),
    },
    async ({ nombre, cliente, etiqueta, filas, proveedor_voz, voz, musica, brief }) => {
      const { dir } = await E.createDrawnExplainer({ name: nombre, client: cliente, tag: etiqueta, rows: filas, provider: proveedor_voz, voice: voz, music: musica, brief, onProgress: (m) => log(m) });
      return E.summarize(await E.readProject(dir), dir);
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
      proveedor: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(),
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

  tool(
    'escribir_guion',
    'Escribe el guion del video (literario: lo que dice la voz; y técnico: fila por fila voz, imagen, toma, plano, movimiento, texto en pantalla, entrada y sonido) con la IA local, a partir del brief, la marca y lo que hay grabado. Estructuras: ' + S.SCRIPT_STRUCTURES.map((x) => `${x.id} (${x.name})`).join(', ') + '. No inventa precios, teléfonos ni promociones. Devuelve el guion en texto.',
    {
      proyecto,
      idea: z.string().optional().describe('De qué va el video, en una frase'),
      estructura: z.enum(S.SCRIPT_STRUCTURES.map((x) => x.id) as [string, ...string[]]).optional(),
      duracion: z.number().min(8).max(180).optional().describe('Segundos'),
      tono: z.string().optional(),
    },
    async ({ proyecto, idea, estructura, duracion, tono }) => S.guionMarkdown(await E.writeScript(await resolveProject(proyecto), { idea, estructura, duracion, tono })),
  );

  tool('leer_guion', 'Devuelve el guion guardado del proyecto (literario y técnico), en texto.', { proyecto }, async ({ proyecto }) => {
    const g = await E.readScript(await resolveProject(proyecto));
    return g ? S.guionMarkdown(g) : 'Este proyecto todavía no tiene guion. Usa escribir_guion o guardar_guion.';
  });

  tool(
    'cortar_con_guion',
    'Corta un video hablado a cámara según el guion que la persona pensaba decir: busca cada frase del guion en la transcripción palabra por palabra, se queda solo con lo que corresponde al guion, elige una toma cuando una frase se grabó varias veces (por defecto la última completa), quita lo dicho fuera del guion, muletillas y silencios, y arma las escenas en el orden del guion. Reemplaza el storyboard (guarda una versión antes). Devuelve qué frase quedó en cada escena y avisa las frases del guion que no están en la grabación. Sin «guion», usa la voz del guion guardado del proyecto.',
    {
      proyecto,
      guion: z.string().optional().describe('El texto del guion: una fila por línea (cada línea puede tener varias frases). Las acotaciones entre paréntesis o corchetes se ignoran.'),
      toma: z.enum(['ultima', 'mejor', 'primera']).default('ultima').describe('Qué toma se queda cuando una frase se grabó varias veces: la última completa (lo normal), la primera completa o la que dice más palabras del guion.'),
    },
    async ({ proyecto, guion, toma }) => {
      const dir = await resolveProject(proyecto);
      await E.saveVersion(dir, 'antes-del-corte-con-guion').catch(() => {});
      const r = await E.cutProjectToScript(dir, { text: guion, take: toma });
      return `${E.formatScriptCut(r)}\n\n${E.summarize(await E.readProject(dir), dir)}`;
    },
  );

  tool(
    'guardar_guion',
    'Guarda un guion técnico escrito o corregido por ti (Claude). Cada fila: seccion, voz (lo que se dice), imagen (qué se ve), toma (la toma exacta que debe verse, por su id como «t03», o una etiqueta de las tomas; míralas con leer_tomas; vacío si no aplica), plano, movimiento, texto (en pantalla, 1 a 4 palabras o vacío), transicion (corte, barrido, zoom, deslizar, destello, fundido, golpe) y sonido. La app revisa que no haya cifras fuera del brief y devuelve los avisos.',
    {
      proyecto,
      titulo: z.string(), idea: z.string().optional(), estructura: z.string().optional(), tono: z.string().optional(), duracion: z.number().optional(),
      voz: z.string().optional().describe('Voz sugerida: ' + S.AI_VOICES.map((v) => v.id).join(', ')),
      filas: z.array(z.object({ seccion: z.string(), voz: z.string(), imagen: z.string(), toma: z.string().optional(), plano: z.string().optional(), movimiento: z.string().optional(), texto: z.string().optional(), transicion: z.string().optional(), sonido: z.string().optional() })).min(2),
    },
    async ({ proyecto, ...g }) => {
      const saved = await E.saveScript(await resolveProject(proyecto), S.Guion.parse({ ...g, origen: 'manual' }));
      return `Guion guardado: ${saved.filas.length} filas, ${S.guionSeconds(saved).toFixed(0)} s.${saved.avisos.length ? ` Por revisar: ${saved.avisos.join(' ')}` : ''}`;
    },
  );

  tool(
    'guion_a_video',
    'Convierte el guion técnico guardado en el video (solo montajes de tomas): genera la voz del guion, corta al ritmo de la música y pone en cada fila la toma que el guion pide mientras la voz la dice, con su movimiento, su entrada, sus textos y sonidos. Después revisa con leer_proyecto y exporta con renderizar.',
    { proyecto, proveedor: z.enum(['elevenlabs', 'fish', 'qwen', 'piper', 'sistema']).optional(), voz: z.string().optional().describe('Con proveedor qwen: ' + S.AI_VOICES.map((v) => v.id).join(', ') + ' o una descripción de la voz en inglés') },
    async ({ proyecto, proveedor, voz }) => (await E.applyScript(await resolveProject(proyecto), { provider: proveedor, voice: voz })).summary.join('\n'),
  );

  tool('etiquetar_toma', 'Corrige a mano qué se ve en una toma del montaje (manda sobre la IA). Etiquetas de la lista: ' + Object.keys(E.TAG_NAMES).join(', ') + '; o una propia (p. ej. "pizza"), que se reconoce en la voz por esa palabra. Vacío = sin etiqueta. Después usa sincronizar_imagen_voz.', { proyecto, toma: z.string().describe('Id de la toma, p. ej. t03'), etiqueta: z.string() }, async ({ proyecto, toma, etiqueta }) => {
    const shots = await E.setShotTag(await resolveProject(proyecto), toma, etiqueta || null);
    return `Toma ${toma}: ${etiqueta || 'sin etiqueta'}. Tomas por etiqueta: ${[...new Set(shots.map((s) => s.tag ?? 'sin etiqueta'))].map((t) => `${t} (${shots.filter((s) => (s.tag ?? 'sin etiqueta') === t).length})`).join(', ')}.`;
  });

  tool('sincronizar_imagen_voz', 'Montaje con voz en off: reordena las tomas para que en pantalla salga lo que la voz nombra en cada momento (mira cada toma con el modelo de visión local y la etiqueta). Conserva cortes, textos y transiciones.', { proyecto }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    await E.tagShots(dir);
    const r = await E.resyncToVoice(dir);
    return r.length ? `Sincronizado: ${r.map((x) => `«${x.word}» → ${x.tag} (${x.at.toFixed(1)} s)`).join(', ')}.` : 'No encontré en la voz palabras que nombren lo que hay en las tomas (o el proyecto no es un montaje con voz en off).';
  });

  tool('quitar_voz_en_off', 'Quita la voz en off y devuelve el sonido original.', { proyecto }, async ({ proyecto }) => {
    await E.removeVoiceover(await resolveProject(proyecto));
    return 'Voz en off quitada.';
  });

  tool('voces_disponibles', 'Voces que se pueden usar (proveedor e id): ElevenLabs (prediseñadas y las tuyas si la clave lo permite), voces locales con acento mexicano o colombiano (gratis) y la del sistema.', {}, async () => {
    const list = await E.voiceCatalog();
    return list.length ? list.map((v) => `${v.provider}${v.voice ? ` · ${v.voice}` : ''} · ${v.name}`).join('\n') : 'No hay ningún proveedor de voz disponible.';
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

  tool('resolucion_entrega', 'Elige la resolución del video final: «full_hd» (1080 px de ancho, 1080×1920 en vertical: lo normal para redes, rápido y liviano) o «4k» (2160 px: más lento y pesado). Se aplica al siguiente renderizar o entregar_video. Sin resolución, solo dice cuál tiene el proyecto.', {
    proyecto, resolucion: z.enum(['full_hd', '4k']).optional(),
  }, async ({ proyecto, resolucion }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.readProject(dir);
    if (resolucion) {
      p.export.uhd = resolucion === '4k';
      await E.writeProject(dir, p);
    }
    return `Resolución de entrega: ${p.export.uhd ? '4K (2160 px de ancho)' : 'Full HD (1080 px de ancho)'}${resolucion ? ' · guardada' : ''}.`;
  });

  tool('plataforma_destino', 'Dice en qué red se va a publicar el video para respetar sus zonas seguras: subtítulos, rótulos, palabras y logo nunca van donde la propia app de la red los tapa (cuenta, descripción, música, botones, barra de respuesta). Redes: instagram_reels (por defecto), instagram_stories, tiktok, youtube_shorts, facebook_reels, whatsapp_estado, ninguna. Se aplica solo al renderizar; sin plataforma, muestra la actual y los márgenes.', {
    proyecto, plataforma: z.enum(S.PLATFORM_IDS).optional(),
  }, async ({ proyecto, plataforma }) => {
    const dir = await resolveProject(proyecto);
    const p = await E.readProject(dir);
    if (plataforma) { p.platform = plataforma; await E.writeProject(dir, p); }
    const info = S.PLATFORMS[p.platform ?? 'instagram_reels'];
    const pc = (v: number) => `${Math.round(v * 100)}%`;
    const moved = S.auditZones(p);
    return [`Red: ${info.label}${plataforma ? ' · guardada' : ''}.`, `Zona libre: no poner nada en el ${pc(info.top)} de arriba, el ${pc(info.bottom)} de abajo, ni en ${pc(info.left)} a la izquierda y ${pc(info.right)} a la derecha.`, info.note, moved.length ? `Al renderizar se mueven: ${moved.join('; ')}.` : 'Nada está fuera de la zona libre.'].join('\n');
  });

  tool('ubicar_textos', 'Busca en cada escena la franja LIBRE del cuadro (sin producto, cara ni cosas cargadas) dentro de la zona segura de la red y pone ahí los subtítulos y el rótulo, para que nunca tapen el producto. Mira fotogramas reales de cada toma. Devuelve, por escena, dónde puso cada texto y qué tan libre quedó; en escenas sin franja libre avisa para decidir (acortar el texto, quitar el rótulo o cambiar de toma). Revisa siempre los cuadros después.', {
    proyecto,
  }, async ({ proyecto }) => {
    const dir = await resolveProject(proyecto);
    const r = await E.placeTexts(dir);
    return r.join('\n');
  });

  tool('renderizar', 'Renderiza el reel a MP4. Formatos: 9:16 (1080×1920, por defecto), 4:5 (1080×1350) y 1:1 (1080×1080). Tarda aproximadamente lo que dura el video.', {
    proyecto, formato: z.enum(['9:16', '4:5', '3:4', '1:1', '16:9', '21:9']).optional().describe('Sin valor: la forma propia del proyecto'),
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
