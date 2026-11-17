import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkCancelled } from './cancel.ts';
import { ffmpeg, run } from './exec.ts';
import { generateImageLocal, imageEngineName, localImageReady, LOCAL_PY } from './imagegen.ts';
import { createMontage } from './montage.ts';
import { setVoiceover } from './ops.ts';
import { rowStarts } from './script.ts';
import { readProject, writeProject } from './store.ts';

/**
 * Videos explicativos en estilo «pizarra»: cada frase del guion tiene su ilustración, que una mano
 * dibuja con plumón sobre papel y luego se colorea, con un título arriba (una *palabra* destacada),
 * globos de cómic y subtítulos en nota de cuaderno. Las ilustraciones las crea el generador local.
 */
export interface DrawnRow {
  /** Lo que dice la voz en esta parte. */
  voz: string;
  /** Título de arriba; *palabra* va destacada. Si se repite el de la fila anterior, se queda quieto. */
  titulo?: string;
  /** Qué se ve en la ilustración (en palabras simples; mejor en inglés para el generador). */
  dibujo: string;
  /** Globo de cómic al terminar el dibujo (¡OJO!, ¡ÑAM!…). */
  globo?: string;
  /** Segundos que tarda la mano en dibujarla (0 = aparece ya coloreada). */
  dibujar?: number;
}

/** Cómo se ven las ilustraciones: cómic de línea negra sobre papel, sin texto. */
const STYLE = 'detailed hand-drawn comic book illustration, bold black ink outlines, soft cel shading with small halftone dots, expressive cartoon characters, warm colors, like an animated explainer video, centered composition, isolated on plain off-white paper background, no frame, no text, no letters, no words';

/** La mano con el plumón: se genera una vez por proyecto. */
const HAND_PROMPT = 'realistic photo of a right human hand holding a black marker pen as if drawing, hand entering from the right side, pen tip pointing down to the lower left, wrist and dark navy sleeve at the right edge, isolated on a pure white background, studio light, sharp focus';

/** La ilustración en líneas (para dibujarla) a partir de la coloreada: efecto lápiz sobre los bordes. */
const LINES_PY = String.raw`
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageOps
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('L')
g = np.asarray(im).astype(np.float32)
blur = np.asarray(ImageOps.invert(im).filter(ImageFilter.GaussianBlur(10))).astype(np.float32)
dodge = np.clip(g * 255.0 / np.maximum(1.0, 255.0 - blur), 0, 255)
# Líneas más negras y papel limpio.
lines = np.where(dodge > 236, 255, np.clip((dodge - 120) * 1.9, 0, 255))
Image.fromarray(lines.astype(np.uint8)).filter(ImageFilter.SMOOTH).convert('RGB').save(out)
`;

/** El fondo de papel del generador (crema o gris) pasa a blanco puro: así se funde con el papel del video. */
const WHITEN_PY = String.raw`
import sys
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
light = a.min(axis=2); spread = a.max(axis=2) - light
# Cuánto se parece al fondo: claro y sin color. Se lleva a blanco con una transición suave.
k = np.clip((light - 200) / 30, 0, 1) * np.clip((40 - spread) / 25, 0, 1)
a = a + (255 - a) * k[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(out)
`;

/** Quita el fondo blanco de la mano y da la punta del plumón (abajo a la izquierda), de 0 a 1. */
const HAND_PY = String.raw`
import sys, json
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.int16)
light = a.min(axis=2)
spread = a.max(axis=2) - light
bg = (light > 232) & (spread < 18)
m = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
rgba = np.dstack([np.asarray(im), np.asarray(m)])
ys, xs = np.nonzero(np.asarray(m) > 128)
h, w = bg.shape
i = int(np.argmin(xs))  # la punta del plumón es lo que está más a la izquierda
Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(out)
# Dónde sale el brazo del cuadro (borde de abajo y de la derecha): ahí se prolonga la manga.
al = np.asarray(m) > 128
edge = np.zeros_like(al); edge[-4:, :] = al[-4:, :]; edge[:, -4:] |= al[:, -4:]
ey, ex = np.nonzero(edge)
arm = {}
if len(ex):
    col = np.asarray(im)[ey, ex].mean(axis=0)
    arm = {'armX': round(float(ex.mean()) / w, 4), 'armY': round(float(ey.mean()) / h, 4), 'armW': round(float(max(ex.max() - ex.min(), ey.max() - ey.min())) / w, 4), 'armColor': '#%02x%02x%02x' % tuple(int(c) for c in col)}
print(json.dumps({'tipX': round(xs[i] / w, 4), 'tipY': round(ys[i] / h, 4), **arm}))
`;

/** Una ilustración: la coloreada y su versión en líneas, guardadas en media/dibujos/. */
export async function makeDrawing(dir: string, idea: string, name: string, seed?: number): Promise<{ color: string; lines: string }> {
  if (!localImageReady()) throw new Error('Para el estilo pizarra hace falta el generador de imágenes local (Z-Image Turbo).');
  const raw = await generateImageLocal(`${idea.trim()}, ${STYLE}`, { width: 1024, height: 1024 }, seed);
  await mkdir(path.join(dir, 'media', 'dibujos'), { recursive: true });
  const color = `media/dibujos/${name}.png`, lines = `media/dibujos/${name}-lineas.png`;
  await run(LOCAL_PY, ['-I', '-c', WHITEN_PY, raw, path.join(dir, color)], { quiet: true });
  await run(LOCAL_PY, ['-I', '-c', LINES_PY, raw, path.join(dir, lines)], { quiet: true });
  await rm(path.dirname(raw), { recursive: true, force: true });
  return { color, lines };
}

/** La mano que dibuja (con fondo transparente y la punta del plumón medida). */
export async function makeHand(dir: string, seed = 7): Promise<{ file: string; tipX: number; tipY: number; armX?: number; armY?: number; armW?: number; armColor?: string }> {
  const raw = await generateImageLocal(HAND_PROMPT, { width: 1024, height: 1024 }, seed);
  await mkdir(path.join(dir, 'media', 'dibujos'), { recursive: true });
  const file = 'media/dibujos/mano.png';
  const { stdout } = await run(LOCAL_PY, ['-I', '-c', HAND_PY, raw, path.join(dir, file)], { quiet: true });
  await rm(path.dirname(raw), { recursive: true, force: true });
  return { file, ...JSON.parse(stdout.trim().split('\n').pop()!) };
}

/**
 * Del guion al video pizarra: voz en off, una escena por fila (entra cuando la voz dice su frase),
 * la ilustración de cada fila dibujada a mano, títulos, globos y subtítulos de cuaderno.
 */
export async function createDrawnExplainer(opts: {
  name: string; client?: string; rows: DrawnRow[]; tag?: string;
  /** Respuestas del brief (objetivo, público, CTA…): el proyecto queda con su brief desde el inicio. */
  brief?: Record<string, string>;
  provider?: 'elevenlabs' | 'qwen' | 'piper' | 'sistema'; voice?: string; music?: string;
  onProgress?: (message: string, progress: number) => void;
}): Promise<{ dir: string }> {
  const say = (m: string, p: number) => { checkCancelled(); opts.onProgress?.(m, p); };
  if (opts.rows.length < 2) throw new Error('El guion necesita al menos dos filas.');
  // La base del proyecto: un video de papel en blanco (la imagen la ponen las ilustraciones).
  const tmp = path.join(os.tmpdir(), `axioma-pizarra-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  const paper = path.join(tmp, 'papel.mp4');
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xEDE8DF:s=1080x1920:r=30:d=240', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '240', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', paper]);
  const { dir } = await createMontage({ inputs: [paper], name: opts.name, client: opts.client });
  await rm(tmp, { recursive: true, force: true });

  say('Generando la voz…', 0.02);
  const text = opts.rows.map((r) => r.voz.trim()).join(' ');
  await setVoiceover(dir, text, { provider: opts.provider, voice: opts.voice, originalVolume: 0 });
  let project = await readProject(dir);
  const vo = project.audio.voiceover!;
  const words = (JSON.parse(await readFile(path.join(dir, vo.wordsFile!), 'utf8')).words ?? []) as { text: string; start: number; end: number }[];
  const at = rowStarts(words, opts.rows);
  at[0] = 0;
  const end = vo.duration + 0.8;

  say('Creando la mano que dibuja…', 0.05);
  const hand = await makeHand(dir);
  const drawings: { color: string; lines: string }[] = [];
  for (const [i, r] of opts.rows.entries()) {
    say(`Dibujando la ilustración ${i + 1} de ${opts.rows.length}…`, 0.08 + (0.88 * i) / opts.rows.length);
    drawings.push(await makeDrawing(dir, r.dibujo, `${String(i + 1).padStart(2, '0')}`, 1000 + i));
  }

  project = await readProject(dir);
  const base = project.scenes[0];
  const license = `Generada con IA (${imageEngineName()})`;
  project.assets = [...project.assets, ...drawings.flatMap((d) => [d.color, d.lines]), hand.file].map((f) => (typeof f === 'string' ? { file: f, kind: 'broll' as const, source: 'Ilustración creada con IA para el video', license } : f));
  project.scenes = opts.rows.map((r, i) => ({
    ...base,
    id: `s${String(i + 1).padStart(2, '0')}`,
    title: (r.titulo ?? r.voz).replace(/\*/g, '').slice(0, 40),
    role: 'otro',
    ranges: [{ start: at[i], end: i + 1 < at.length ? at[i + 1] : end }],
    trimStart: 0, trimEnd: 0,
    visual: 'broll' as const,
    brollFile: drawings[i].color,
    camera: 'ninguno' as const,
    onScreenText: undefined, autoText: undefined, transition: undefined, sfx: [],
    variants: [],
    drawing: { lines: drawings[i].lines, title: r.titulo, burst: r.globo, tag: opts.tag, draw: r.dibujar ?? 2.2, hand },
  }));
  // Voz al frente, música suave debajo; subtítulos de cuaderno abajo, la palabra que suena en morado.
  project.brief = { formato: 'Reel 9:16', tono: 'Didáctico y cercano', ritmo: 'Medio', duracion: `${Math.round(end)} s`, ...opts.brief };
  project.audio.originalVolume = 0;
  project.audio.musicVolume = 0.12;
  project.briefAppliedAt = new Date().toISOString();
  Object.assign(project.captions, { design: 'nota', effect: 'color', fontSize: 60, color: '#1B1B22', highlightColor: '#5B4FD6', uppercase: false, stroke: false, emphasis: false, wordsPerLine: 3, y: 0.86, lineAnim: 'pop', plate: false, behind: false, emojis: false });
  await writeProject(dir, project);
  if (opts.music && existsSync(opts.music)) {
    const { setMusic } = await import('./ops.ts');
    await setMusic(dir, opts.music, { source: 'archivo local', license: 'CC0' }).catch(() => {});
  }
  say('Listo', 1);
  return { dir };
}
