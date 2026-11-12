import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { renderStill, selectComposition } from '@remotion/renderer';
import { effectiveRanges, shortPhrases, speechOf, type Project } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { readKit } from './kit.ts';
import { llmHook, llmJson, llmReady } from './llm.ts';
import { P } from './paths.ts';
import { brandFor, getBundle, retryBrowser } from './render.ts';
import { serveFolder } from './server.ts';
import { readProject, readTranscript } from './store.ts';

export type ImageKind = 'carrusel' | 'post' | 'historia';

interface SlideText { kind: 'portada' | 'punto' | 'cierre'; title: string; body?: string; sceneIndex: number }

/** El modelo a veces añade «Escena 3» al final del texto: se quita. */
const noScene = (s: string) => s.replace(/\s*\(?escena\s*\d+\)?\.?\s*$/i, '').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => s.replace(/["«»“”]/g, '').replace(/[.,;:]+$/, '').trim();

/**
 * Crea imágenes para redes a partir del reel, como hacen las apps de contenido:
 * - carrusel (4:5): portada con el gancho, de 3 a 5 puntos clave y un cierre con llamado a la acción;
 * - post (4:5): una portada con el gancho;
 * - historia (9:16): portada con el gancho y un botón de llamado a la acción, sin tapar la barra de respuesta.
 * El fondo son fotogramas del propio video y los colores son los de la marca.
 */
export async function createImages(dir: string, kind: ImageKind, onProgress: (msg: string) => void = () => {}): Promise<{ files: string[]; ai: boolean }> {
  const project = await readProject(dir);
  const transcript = await readTranscript(dir).catch(() => null);
  if (!project.scenes.length) throw new Error('El proyecto no tiene escenas todavía.');
  const kit = await readKit(project.client);
  const ctaBrief = /digo en el video/i.test(project.brief.cta ?? '') ? '' : (project.brief.cta ?? '').trim();
  const cta = ctaBrief || (kind === 'historia' ? 'Respóndeme esta historia' : kind === 'carrusel' ? 'Guárdalo para después' : 'Escríbeme por DM');
  const scenes = project.scenes;
  const speech = scenes.map((s) => speechOf(s, transcript));
  const hook = clean(scenes[0]?.onScreenText || shortPhrases(speech[0] ?? '')[0] || project.name);

  // 1. Textos
  let slides: SlideText[] = [];
  let ai = false;
  if (kind === 'carrusel' && (await llmReady())) {
    onProgress('La IA local está escribiendo el carrusel…');
    try {
      const r = await llmJson<{ portada: { titulo: string; subtitulo: string }; puntos: { titulo: string; texto: string; escena: number }[]; cierre: { titulo: string; texto: string } }>(
        'Eres creador de carruseles de Instagram en español. A partir de lo que dice la persona en su video (dividido en escenas numeradas), escribe un carrusel: una portada con un título de máximo 7 palabras que enganche y un subtítulo de máximo 12; de 3 a 5 puntos, cada uno con un título de máximo 6 palabras, un texto de máximo 22 palabras y el número de la escena de donde sale; y un cierre con un título de máximo 6 palabras y un texto corto. Fiel a lo que se dice: no inventes cifras, nombres ni promesas. Responde solo JSON.',
        speech.map((s, i) => `Escena ${i + 1}: ${s}`).join('\n').slice(0, 4000),
        { type: 'object', properties: { portada: { type: 'object', properties: { titulo: { type: 'string' }, subtitulo: { type: 'string' } }, required: ['titulo', 'subtitulo'] }, puntos: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' }, escena: { type: 'integer' } }, required: ['titulo', 'texto', 'escena'] } }, cierre: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' } }, required: ['titulo', 'texto'] } }, required: ['portada', 'puntos', 'cierre'] },
        { temperature: 0.5, timeoutMs: 180_000 },
      );
      const at = (n: number) => Math.max(0, Math.min(scenes.length - 1, Math.round(n) - 1));
      slides = [
        { kind: 'portada', title: clean(r.portada.titulo), body: clean(r.portada.subtitulo), sceneIndex: 0 },
        ...r.puntos.slice(0, 5).map((x) => ({ kind: 'punto' as const, title: clean(x.titulo), body: noScene(x.texto), sceneIndex: at(x.escena) })),
        { kind: 'cierre', title: clean(r.cierre.titulo), body: noScene(r.cierre.texto), sceneIndex: scenes.length - 1 },
      ];
      ai = slides.length >= 4;
    } catch { slides = []; }
  }
  if (!slides.length) {
    if (kind === 'carrusel') {
      // Sin IA: un punto por cada tramo del reel con su frase más clara.
      const n = Math.min(5, Math.max(3, scenes.length - 2));
      const picks = Array.from({ length: n }, (_, k) => 1 + Math.floor(((k + 0.5) * Math.max(1, scenes.length - 2)) / n));
      slides = [
        { kind: 'portada', title: hook, sceneIndex: 0 },
        ...picks.map((i) => { const ph = shortPhrases(speech[i] ?? ''); return { kind: 'punto' as const, title: clean(cap(scenes[i]?.onScreenText || ph[0] || hook)), body: ph[1] ? cap(ph[1]) : undefined, sceneIndex: i }; }),
        { kind: 'cierre', title: 'Guárdalo para después', body: 'Y compártelo con quien lo necesita', sceneIndex: scenes.length - 1 },
      ];
    } else {
      // Post o historia: una portada con el gancho, escrito por la IA local si está.
      let title = hook;
      if (await llmReady()) { try { title = (await llmHook(speech[0] ?? hook)) ?? hook; ai = title !== hook; } catch { /* queda el gancho del video */ } }
      slides = [{ kind: 'portada', title, sceneIndex: 0 }];
    }
  }

  // 2. Fondos: un fotograma de la escena de cada imagen (el centro del primer tramo).
  const frames = new Map<number, string>();
  await mkdir(path.join(dir, 'proxies', 'fotos'), { recursive: true });
  for (const sl of slides) {
    if (frames.has(sl.sceneIndex)) continue;
    const r = effectiveRanges(scenes[sl.sceneIndex], project.source.duration)[0];
    const at = r ? (r.start + r.end) / 2 : 0;
    const rel = path.join('proxies', 'fotos', `foto-${sl.sceneIndex}-${Math.round(at * 10)}.jpg`);
    await ffmpeg(['-ss', at.toFixed(2), '-i', path.join(dir, P.master), '-frames:v', '1', '-q:v', '2', path.join(dir, rel)]);
    frames.set(sl.sceneIndex, rel);
  }

  // 3. Render de cada imagen.
  const size = kind === 'historia' ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(dir, P.renders, 'imagenes', `${stamp}-${kind}`);
  await mkdir(outDir, { recursive: true });
  const server = await serveFolder(dir);
  try {
    const brand = await brandFor(project, server.url, dir);
    const font = scenes[0]?.textFont || kit?.fonts?.heading || project.captions.fontFamily || 'Anton';
    const serveUrl = await getBundle();
    const files: string[] = [];
    for (const [i, sl] of slides.entries()) {
      onProgress(`Creando la imagen ${i + 1} de ${slides.length}…`);
      const props = {
        ...size, kind: sl.kind, title: sl.title, body: sl.body ?? '', index: i, total: slides.length,
        bg: server.url(frames.get(sl.sceneIndex)!.split(path.sep).join('/')),
        cta: sl.kind === 'portada' && kind !== 'carrusel' ? cta : sl.kind === 'cierre' ? cta : '',
        story: kind === 'historia', carousel: kind === 'carrusel', brand: { primary: brand.primary, secondary: brand.secondary, name: brand.name ?? '', logoSrc: brand.logoSrc ?? '' }, font,
      };
      const composition = await retryBrowser(() => selectComposition({ serveUrl, id: 'Imagen', inputProps: props, timeoutInMilliseconds: 120_000 }));
      const out = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${sl.kind}.png`);
      await retryBrowser(() => renderStill({ serveUrl, composition, inputProps: props, output: out, imageFormat: 'png', timeoutInMilliseconds: 120_000 }));
      files.push(path.relative(dir, out).split(path.sep).join('/'));
    }
    return { files, ai };
  } finally {
    await server.close();
  }
}
