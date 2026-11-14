import { copyFromWish, understandReference } from './refsource.ts';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FONT_FAMILIES } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { probe } from './media.ts';
import { visionJson, visionReady } from './llm.ts';
import { WORKSPACE, slugify } from './paths.ts';

export interface ReferenceReport {
  id: string;
  name: string;
  client: string;
  createdAt: string;
  duration: number;
  /** Momentos (s) donde cambia el plano. */
  cuts: number[];
  /** Duración media de plano (s). */
  avgShot: number;
  /** Tempo aproximado de la música; null si no se detecta un pulso claro. */
  bpm: number | null;
  /** Colores dominantes, de más a menos presente. */
  palette: string[];
  /** Fotogramas para que Claude mire el estilo (rutas relativas a la carpeta de la referencia). */
  frames: string[];
  /** Subtítulos detectados en la imagen (null si no se encontraron). */
  captions: {
    /** Posición vertical del centro, 0 arriba y 1 abajo. */
    y: number;
    color: string;
    /** Color con el que se resalta una palabra, si lo hay. */
    highlight: string | null;
    /** La palabra resaltada va dentro de una caja de color. */
    box: boolean;
    /** Cambios de subtítulo por segundo. */
    rate: number;
    wordsPerLine: number;
  } | null;
  /** Aspecto de color de la imagen. */
  look: 'normal' | 'bn' | 'calido' | 'frio' | 'contraste';
  /** Hay destellos blancos en los cortes. */
  flashes: boolean;
  /** Tipografía de los subtítulos vista por la IA local de visión (si está instalada). */
  typography?: { fontFamily: string; uppercase: boolean; style: string } | null;
  /** Valores sugeridos para un preset. */
  suggested: { maxPause: number; punchZoomEvery: number; highlightColor: string; ritmo: 'rapido' | 'con-ritmo' | 'sobrio' };
  /** De dónde salió (si vino de un link): red, autor, texto de la publicación y sus números. */
  source?: { url: string; platform: string; author?: string; caption?: string; views?: number; likes?: number; comments?: number; date?: string };
  /** Lo que el cliente quiere de esta referencia, escrito o dictado. */
  wish?: string;
  /** Qué se copia al usarla (sale del pedido; se puede cambiar). */
  copy?: { ritmo: boolean; subtitulos: boolean; color: boolean; musica: boolean; transiciones: boolean; estructura: boolean };
  /** Lo que se dice en el video (si se habla). */
  transcript?: string;
  /** Lo que se ve, descrito por la IA de visión. */
  visual?: string;
  /** De qué trata, cómo engancha, cómo está armada, por qué funciona y qué se podría mejorar. */
  understanding?: { tema: string; formato: string; gancho: string; estructura: { segundo: number; parte: string; que: string }[]; porQueFunciona: string[]; sugerencias: string[]; paraTuVideo: string[] };
}

export const referencesDir = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'referencias');

/** Cambios de plano detectados por FFmpeg. */
export async function detectCuts(file: string): Promise<number[]> {
  // Se analiza en pequeño: un video 4K tardaba minutos y los cortes se ven igual a 320 px.
  const { stdout, stderr } = await ffmpeg(['-i', file, '-an', '-vf', "scale=320:-2,select='gt(scene,0.3)',metadata=print:file=-", '-f', 'null', '-']);
  return [...(stdout + stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Tempo por autocorrelación de los ataques de energía (60–180 BPM). */
export async function detectBpm(file: string, tmp: string): Promise<number | null> {
  const raw = path.join(tmp, 'audio.raw');
  try {
    await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', raw]);
  } catch {
    return null; // sin pista de audio
  }
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  const hop = 80; // 10 ms → 100 marcos por segundo
  const n = Math.floor(samples.length / hop);
  if (n < 400) return null;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += Math.abs(samples[i * hop + j]);
    env[i] = e / hop;
  }
  const onset = new Float32Array(n);
  let energy = 0;
  for (let i = 1; i < n; i++) {
    onset[i] = Math.max(0, env[i] - env[i - 1]);
    energy += onset[i] * onset[i];
  }
  if (energy === 0) return null;
  let best = 0;
  let bestBpm = 0;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = Math.round(6000 / bpm);
    let c = 0;
    for (let i = lag; i < n; i++) c += onset[i] * onset[i - lag];
    c /= energy;
    if (c > best) { best = c; bestBpm = bpm; }
  }
  return best > 0.25 ? bestBpm : null;
}

/** Colores dominantes a partir de fotogramas reducidos. */
async function detectPalette(file: string, duration: number, tmp: string): Promise<string[]> {
  const raw = path.join(tmp, 'frames.raw');
  await ffmpeg(['-i', file, '-an', '-vf', `fps=${Math.min(4, Math.max(0.5, 24 / duration)).toFixed(3)},scale=24:24`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const key = ((buf[i] >> 5) << 6) | ((buf[i + 1] >> 5) << 3) | (buf[i + 2] >> 5);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += buf[i]; b.g += buf[i + 1]; b.b += buf[i + 2];
    buckets.set(key, b);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 5)
    .map((b) => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`.toUpperCase());
}

const W = 90;
const H = 160;
const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

/**
 * Lee el estilo visual directamente de la imagen, sin ayuda de nadie:
 * dónde están los subtítulos, de qué color son, si resaltan una palabra,
 * cada cuánto cambian, el aspecto de color y si hay destellos en los cortes.
 *
 * Los subtítulos se reconocen porque son la franja con más bordes nítidos y
 * claros que además cambia muchas veces por segundo (un logo fijo no cambia).
 */
async function detectVisualStyle(file: string, duration: number, cuts: number[], tmp: string): Promise<Pick<ReferenceReport, 'captions' | 'look' | 'flashes'>> {
  const fps = 6;
  const span = Math.min(duration, 40);
  const raw = path.join(tmp, 'estilo.raw');
  await ffmpeg(['-t', span.toFixed(2), '-i', file, '-an', '-vf', `fps=${fps},scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const size = W * H * 3;
  const n = Math.floor(buf.length / size);
  if (n < 6) return { captions: null, look: 'normal', flashes: false };

  const x0 = Math.round(W * 0.08), x1 = Math.round(W * 0.92);
  const edges = new Float64Array(H);   // bordes claros por fila (media)
  const change = new Float64Array(H);  // cuánto cambia la fila entre fotogramas
  const luma = new Float64Array(n);
  let sat = 0, warm = 0, contrast = 0;
  let prev: Uint8Array | null = null;
  for (let f = 0; f < n; f++) {
    const o = f * size;
    const mask = new Uint8Array(W * H);
    let sum = 0, sum2 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = o + (y * W + x) * 3;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        sum += l; sum2 += l * l;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        sat += mx ? (mx - mn) / mx : 0;
        warm += (r - b) / 255;
        if (x > x0 && x < x1) {
          const j = i - 3;
          const lp = 0.299 * buf[j] + 0.587 * buf[j + 1] + 0.114 * buf[j + 2];
          // Borde de texto: salto fuerte de brillo junto a un píxel claro o muy saturado.
          if (Math.abs(l - lp) > 70 && (mx > 190)) mask[y * W + x] = 1;
        }
      }
    }
    const mean = sum / (W * H);
    luma[f] = mean / 255;
    contrast += Math.sqrt(Math.max(0, sum2 / (W * H) - mean * mean)) / 255;
    for (let y = 0; y < H; y++) {
      let e = 0, d = 0;
      for (let x = x0; x < x1; x++) {
        e += mask[y * W + x];
        if (prev) d += mask[y * W + x] !== prev[y * W + x] ? 1 : 0;
      }
      edges[y] += e / n;
      change[y] += d / n;
    }
    prev = mask;
  }
  const px = n * W * H;
  sat /= px; warm /= px; contrast /= n;
  const look = sat < 0.05 ? 'bn' : warm > 0.09 ? 'calido' : warm < -0.05 ? 'frio' : contrast > 0.29 ? 'contraste' : 'normal';

  // Destellos: un fotograma casi blanco pegado a un corte.
  let flashHits = 0;
  for (const c of cuts) {
    const f = Math.round(c * fps);
    if ([f - 1, f, f + 1].some((k) => k >= 0 && k < n && luma[k] > 0.8 && luma[k] - (luma[k - 2] ?? luma[k]) > 0.25)) flashHits++;
  }
  const flashes = cuts.length > 0 && flashHits >= Math.max(2, cuts.length * 0.2);

  // Franja de subtítulos: bordes × cambio, en una ventana de ~11 % de alto, lejos de los extremos.
  const win = Math.round(H * 0.11);
  let best = -1, bestY = 0, total = 0, count = 0;
  for (let y = Math.round(H * 0.12); y + win < Math.round(H * 0.9); y++) {
    let sc = 0;
    for (let k = 0; k < win; k++) sc += edges[y + k] * change[y + k];
    total += sc; count++;
    if (sc > best) { best = sc; bestY = y; }
  }
  const avg = total / Math.max(1, count);
  let bandEdges = 0;
  for (let k = 0; k < win; k++) bandEdges += edges[bestY + k];
  // Poca nitidez o una franja que no destaca del resto: no hay subtítulos claros.
  // Umbrales medidos con videos reales: con subtítulos, pico/media 2,9–4,7 y bordes 1,1–1,4; sin ellos, 2,3 y 0,8.
  if (best < avg * 2.6 || bandEdges / win < 1.0) return { captions: null, look, flashes };

  // Colores y ritmo de cambio dentro de la franja.
  const vividBins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const dark = { n: 0, r: 0, g: 0, b: 0 };
  const light = { n: 0, r: 0, g: 0, b: 0 };
  let bandPx = 0, vividPx = 0, changes = 0;
  let prevSig = -1;
  for (let f = 0; f < n; f++) {
    const o = f * size;
    let sig = 0;
    for (let y = bestY; y < bestY + win; y++) {
      for (let x = x0; x < x1; x++) {
        const i = o + (y * W + x) * 3;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const s2 = mx ? (mx - mn) / mx : 0;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        bandPx++;
        if (s2 > 0.5 && mx > 120) {
          vividPx++;
          const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
          const bin = vividBins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          bin.n++; bin.r += r; bin.g += g; bin.b += b;
          vividBins.set(key, bin);
        } else if (l < 70) { dark.n++; dark.r += r; dark.g += g; dark.b += b; sig += x + y; }
        else if (l > 185) { light.n++; light.r += r; light.g += g; light.b += b; }
      }
    }
    if (prevSig >= 0 && Math.abs(sig - prevSig) > Math.max(sig, prevSig, 1) * 0.12) changes++;
    prevSig = sig;
  }
  const toHex = (b: { n: number; r: number; g: number; b: number }) => `#${hex2(b.r / b.n)}${hex2(b.g / b.n)}${hex2(b.b / b.n)}`.toUpperCase();
  // El texto es el grupo minoritario: letras oscuras sobre fondo claro, o claras sobre fondo oscuro.
  // Letras oscuras: hay bastante negro y el fondo es claro o una caja de color.
  const darkText = dark.n > bandPx * 0.03 && (light.n > bandPx * 0.35 || vividPx > bandPx * 0.1);
  const vivid = [...vividBins.values()].sort((a, b) => b.n - a.n)[0];
  const rate = changes / (n / fps);
  return {
    look,
    flashes,
    captions: {
      y: +((bestY + win / 2) / H).toFixed(2),
      color: darkText ? (dark.r / dark.n < 40 ? '#000000' : toHex(dark)) : '#FFFFFF',
      highlight: vivid && vividPx / bandPx > 0.03 ? toHex(vivid) : null,
      box: vividPx / bandPx > 0.1,
      rate: +rate.toFixed(2),
      // Se habla a unas 2,6 palabras por segundo: si el subtítulo cambia 1 vez por segundo, lleva ~3 palabras.
      wordsPerLine: Math.min(6, Math.max(1, Math.round(2.6 / Math.max(0.4, rate)))),
    },
  };
}

/**
 * Convierte el reporte de una referencia en un preset completo: ritmo,
 * subtítulos (posición, colores, forma de resaltar, palabras por línea),
 * estilo de los textos, aspecto de la imagen, transiciones y efectos.
 */
/** Fuentes que el render sabe dibujar; la IA solo puede elegir entre estas. */
export const RENDER_FONTS: string[] = [...FONT_FAMILIES];

/** La IA local de visión mira 4 fotogramas y elige la fuente más parecida a la de los subtítulos. */
export async function detectTypography(frames: string[]): Promise<ReferenceReport['typography']> {
  if (!(await visionReady())) return null;
  const pick = frames.filter((_, i) => i % 2 === 1).slice(0, 4);
  const r = await visionJson<{ hay_texto: boolean; fuente: string; mayusculas: boolean; estilo: string }>(
    `Eres diseñador de motion graphics. Mira los fotogramas de un reel y describe SOLO la tipografía de los subtítulos o textos en pantalla. Elige la fuente más parecida de esta lista exacta: ${RENDER_FONTS.join(', ')}. Pistas: letras altas y angostas → Anton, Bebas Neue, Oswald o Teko; gruesas y anchas → Archivo Black o Montserrat; redondas y amables → Poppins, Nunito o Rubik; con serifa → Lora o Playfair Display; manuscritas → Caveat, Pacifico o Permanent Marker; de cómic → Bangers. Si no hay texto en pantalla, hay_texto=false. Responde en español, solo JSON.`,
    'Fotogramas del reel de referencia. ¿Qué fuente usan los subtítulos, van en mayúsculas y cómo es el estilo (borde, sombra, caja, colores) en una frase corta?',
    pick,
    { type: 'object', properties: { hay_texto: { type: 'boolean' }, fuente: { type: 'string', enum: RENDER_FONTS }, mayusculas: { type: 'boolean' }, estilo: { type: 'string' } }, required: ['hay_texto', 'fuente', 'mayusculas', 'estilo'] },
  );
  if (!r.hay_texto || !RENDER_FONTS.includes(r.fuente)) return null;
  return { fontFamily: r.fuente, uppercase: r.mayusculas, style: r.estilo.trim().slice(0, 160) };
}

export function presetFromReference(r: ReferenceReport, name?: string) {
  // Solo lo que el cliente pidió copiar (sin pedido, todo el estilo).
  const cp = r.copy ?? { ritmo: true, subtitulos: true, color: true, musica: true, transiciones: true, estructura: true };
  const c = cp.subtitulos ? r.captions : null;
  const fast = r.suggested.ritmo === 'rapido';
  const highlight = c?.highlight ?? r.suggested.highlightColor;
  return {
    name: name?.trim() || `Estilo ${r.name}`,
    description: `Desde la referencia «${r.name}»: plano medio ${r.avgShot.toFixed(1)} s${c ? `, subtítulos al ${Math.round(c.y * 100)} % de alto` : ''}.`,
    base: r.suggested.ritmo,
    pacing: cp.ritmo ? { maxPause: r.suggested.maxPause, punchZoomEvery: r.suggested.punchZoomEvery } : {},
    captions: !cp.subtitulos ? {} : {
      highlightColor: highlight,
      ...(c ? {
        y: Math.min(0.78, Math.max(0.2, c.y)),
        color: c.color,
        // Letras oscuras: sin borde negro, que las taparía.
        stroke: c.color !== '#000000' && parseInt(c.color.slice(1, 3), 16) > 120,
        wordsPerLine: c.wordsPerLine,
        mode: (c.wordsPerLine <= 4 ? 'word' : 'phrase') as 'word' | 'phrase',
        effect: (c.box ? 'caja' : c.highlight ? (fast ? 'pop' : 'color') : 'subrayado') as 'caja' | 'pop' | 'color' | 'subrayado',
        emphasis: Boolean(c.highlight),
      } : { effect: (fast ? 'pop' : 'color') as 'pop' | 'color' }),
      uppercase: r.typography?.uppercase ?? fast,
      fontFamily: r.typography?.fontFamily ?? (fast ? 'Montserrat' : 'Inter'),
    },
    style: {
      ...(cp.subtitulos ? { textStyle: (c?.box ? 'caja' : fast ? 'resaltado' : 'subrayado') as 'caja' | 'resaltado' | 'subrayado' } : {}),
      ...(cp.color ? { look: r.look } : {}),
      ...(cp.transiciones ? { transitions: true, flashes: r.flashes, sfxAuto: fast } : {}),
    },
    palette: cp.color ? r.palette : [],
    reference: r.id,
  };
}

const saturation = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * (max / 255);
};

/**
 * Analiza el ESTILO de un video de referencia (ritmo de cortes, tempo, colores)
 * y extrae fotogramas para que Claude mire subtítulos y tipografía. No se copia
 * nada del contenido: el video se borra al terminar salvo que `keepVideo` sea true.
 */
export async function analyzeReference(input: string, opts: { client?: string; name?: string; keepVideo?: boolean; onStep?: (message: string, progress: number) => void; /** Link de donde vino y lo que dice la publicación. */ source?: ReferenceReport['source']; /** Lo que el cliente quiere de ella. */ wish?: string; /** Además del estilo, entender de qué trata y sugerir mejoras (IA local). */ understand?: boolean; /** Lo que se sabe del cliente (para adaptar las ideas). */ context?: string } = {}): Promise<{ dir: string; report: ReferenceReport }> {
  const step = opts.onStep ?? (() => {});
  const file = path.resolve(input);
  if (!existsSync(file)) throw new Error(`No existe el archivo: ${file}`);
  const name = opts.name ?? path.basename(file, path.extname(file));
  let id = slugify(name);
  const root = referencesDir(opts.client);
  for (let i = 2; existsSync(path.join(root, id)); i++) id = `${slugify(name)}-${i}`;
  const dir = path.join(root, id);
  await mkdir(path.join(dir, 'frames'), { recursive: true });

  step('Midiendo el video…', 0.05);
  const info = await probe(file);
  step('Contando los cortes…', 0.15);
  const cuts = await detectCuts(file);
  step('Escuchando el ritmo de la música…', 0.35);
  const bpm = await detectBpm(file, dir);
  step('Sacando los colores…', 0.5);
  const palette = await detectPalette(file, info.duration, dir);
  step('Mirando los subtítulos y los textos…', 0.6);
  const visual = await detectVisualStyle(file, info.duration, cuts, dir);
  step('Guardando fotogramas…', 0.8);

  const frames: string[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const rel = `frames/${String(i + 1).padStart(2, '0')}.jpg`;
    await ffmpeg(['-ss', (((i + 0.5) / count) * info.duration).toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', path.join(dir, rel)]);
    frames.push(rel);
  }
  step('Revisando la tipografía…', 0.9);
  const typography = await detectTypography(frames.map((f) => path.join(dir, f))).catch(() => null);
  if (opts.keepVideo) await copyFile(file, path.join(dir, `referencia${path.extname(file).toLowerCase()}`));

  const avgShot = info.duration / (cuts.length + 1);
  const ritmo = avgShot < 1.8 ? 'rapido' : avgShot < 3.5 ? 'con-ritmo' : 'sobrio';
  const accent = [...palette].sort((a, b) => saturation(b) - saturation(a))[0];
  const report: ReferenceReport = {
    id, name, client: opts.client ?? 'personal', createdAt: new Date().toISOString(),
    duration: info.duration, cuts, avgShot, bpm, palette, frames, ...visual, typography,
    suggested: {
      ritmo,
      maxPause: ritmo === 'rapido' ? 0.2 : ritmo === 'con-ritmo' ? 0.35 : 0.6,
      punchZoomEvery: ritmo === 'sobrio' ? 0 : Math.max(2, Math.round(avgShot * 2)),
      highlightColor: accent && saturation(accent) > 0.35 ? accent : '#FE2C55',
    },
  };
  if (opts.source) report.source = opts.source;
  if (opts.wish?.trim()) report.wish = opts.wish.trim().slice(0, 1000);
  report.copy = copyFromWish(report.wish);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  if (opts.understand !== false) {
    const u = await understandReference(file, report, dir, { brand: opts.client, wish: report.wish, context: opts.context, onStep: (m) => step(m, 0.95) }).catch(() => ({}));
    Object.assign(report, u);
    await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  }
  return { dir, report };
}

export async function listReferences(client?: string): Promise<ReferenceReport[]> {
  const root = referencesDir(client);
  if (!existsSync(root)) return [];
  const out: ReferenceReport[] = [];
  for (const d of await readdir(root)) {
    const f = path.join(root, d, 'report.json');
    if (existsSync(f)) out.push(JSON.parse(await readFile(f, 'utf8')));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function formatReport(r: ReferenceReport, dir: string): string {
  return [
    `Referencia: ${r.name} (${r.id}) · ${r.duration.toFixed(1)} s`,
    `Ritmo: ${r.cuts.length} cortes · plano medio ${r.avgShot.toFixed(2)} s → ${r.suggested.ritmo}`,
    `Música: ${r.bpm ? `~${r.bpm} BPM (aproximado)` : 'sin pulso claro'}`,
    `Paleta: ${r.palette.join(' ')}`,
    `Sugerido: pausa máxima ${r.suggested.maxPause} s · zoom cada ${r.suggested.punchZoomEvery} s · resaltado ${r.suggested.highlightColor}`,
    r.captions
      ? `Subtítulos detectados: al ${Math.round(r.captions.y * 100)} % de alto · letras ${r.captions.color}${r.captions.highlight ? ` · resaltado ${r.captions.highlight}${r.captions.box ? ' en caja' : ''}` : ' · sin resaltado'} · ~${r.captions.wordsPerLine} palabras por línea`
      : 'Subtítulos: no se detectaron en la imagen.',
    r.typography ? `Tipografía (vista por la IA local): ${r.typography.fontFamily}${r.typography.uppercase ? ' en mayúsculas' : ''} · ${r.typography.style}` : 'Tipografía: sin revisar (mira los fotogramas para elegirla).',
    `Imagen: ${r.look}${r.flashes ? ' · destellos en los cortes' : ''}`,
    'Fotogramas (opcional: míralos solo para afinar la tipografía; el estilo ya está detectado):',
    ...r.frames.map((f) => `  ${path.join(dir, f)}`),
  ].join('\n');
}

/** Carpeta de una referencia, comprobando que el id es solo un nombre de carpeta (no una ruta). */
function referenceDir(client: string | undefined, id: string): string {
  const dir = path.join(referencesDir(client), path.basename(id));
  if (!id || path.basename(id) !== id || !existsSync(path.join(dir, 'report.json'))) throw new Error('Esa referencia ya no existe.');
  return dir;
}

/** Cambia el nombre con el que se ve una referencia (la carpeta no cambia). */
export async function renameReference(client: string | undefined, id: string, name: string): Promise<ReferenceReport> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean) throw new Error('Escribe un nombre para la referencia.');
  const file = path.join(referenceDir(client, id), 'report.json');
  const report = JSON.parse(await readFile(file, 'utf8')) as ReferenceReport;
  report.name = clean;
  await writeFile(file, JSON.stringify(report, null, 2));
  return report;
}

/**
 * Quita una referencia de la lista. No se borra: queda en workspace/papelera por si se quiere
 * recuperar. Con ella se van los estilos guardados a partir de ella (también a la papelera) y los
 * videos del cliente que la tenían elegida en el brief quedan «sin referencia».
 */
export async function deleteReference(client: string | undefined, id: string): Promise<ReferenceReport[]> {
  const dir = referenceDir(client, id);
  const trash = path.join(WORKSPACE, 'papelera');
  await mkdir(trash, { recursive: true });
  await rename(dir, path.join(trash, `referencia--${slugify(client ?? 'personal')}--${path.basename(id)}--${new Date().toISOString().replace(/[:.]/g, '-')}`));
  // Se importan aquí para no crear un ciclo entre módulos.
  const { deleteReferencePresets } = await import('./presets.ts');
  const { listProjects } = await import('./ops.ts');
  const { writeProject } = await import('./store.ts');
  await deleteReferencePresets(client, path.basename(id));
  const mine = slugify(client ?? 'personal');
  for (const { dir: pdir, project } of await listProjects()) {
    if (slugify(project.client ?? 'personal') !== mine || project.brief.referencia !== id) continue;
    delete project.brief.referencia;
    await writeProject(pdir, project);
  }
  return listReferences(client);
}

/** Cambia lo que el cliente quiere de una referencia (y qué se copia), sin volver a analizarla. */
export async function updateReferenceWish(client: string | undefined, id: string, patch: { wish?: string; copy?: Partial<NonNullable<ReferenceReport['copy']>> }): Promise<ReferenceReport> {
  const dir = referenceDir(client, id);
  const f = path.join(dir, 'report.json');
  const r = JSON.parse(await readFile(f, 'utf8')) as ReferenceReport;
  if (typeof patch.wish === 'string') { r.wish = patch.wish.trim().slice(0, 1000) || undefined; if (!patch.copy) r.copy = copyFromWish(r.wish); }
  if (patch.copy) r.copy = { ...(r.copy ?? copyFromWish(r.wish)), ...patch.copy };
  await writeFile(f, JSON.stringify(r, null, 2));
  return r;
}
