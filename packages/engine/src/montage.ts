import { settings } from './settings.ts';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CaptionStyle, PROJECT_SHAPES, Pacing, Project, SCHEMA_VERSION, Scene, getPreset, type ProjectShape } from '@axioma/schema';
import { applyPunchZooms } from './cuts.ts';
import { ffmpeg } from './exec.ts';
import { kitCaptions, readKit } from './kit.ts';
import { probe } from './media.ts';
import { P, projectDir, slugify } from './paths.ts';
import { listPresets } from './presets.ts';
import { detectBpm, detectCuts } from './reference.ts';
import { readProject, writeProject } from './store.ts';
import { montageToBeat, type BeatDensity } from './beats.ts';

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;

export interface Shot {
  /** t01, t02… */
  id: string;
  start: number;
  end: number;
  /** Archivo original del que salió (si el montaje junta varios videos). */
  file?: string;
  /** Qué se ve (un plato, gente comiendo, el local…): sirve para mostrarlo cuando la voz lo nombra. */
  tag?: string;
  /** La etiqueta la puso el modelo de visión (se puede volver a calcular); sin esto, la puso una persona. */
  tagAuto?: boolean;
}

/** Acepta archivos y carpetas; devuelve los videos en orden. */
export async function expandInputs(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const i of inputs) {
    const abs = path.resolve(i);
    if (!existsSync(abs)) throw new Error(`No existe: ${abs}`);
    if ((await stat(abs)).isDirectory()) {
      out.push(...(await readdir(abs)).filter((f) => VIDEO.test(f)).sort().map((f) => path.join(abs, f)));
    } else if (VIDEO.test(abs)) out.push(abs);
  }
  if (!out.length) throw new Error('No encontré videos (.mp4, .mov) en lo que indicaste.');
  return out;
}

/** Deja un clip con la forma del proyecto (1080×1920 en vertical), fps constante, color estándar y con pista de audio. */
async function normalizeClip(input: string, out: string, fps: number, k = 1, shape: { width: number; height: number } = PROJECT_SHAPES.vertical) {
  const W = shape.width * k, H = shape.height * k;
  const info = await probe(input);
  const color = info.hdr ? 'colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:format=yuv420p' : 'format=yuv420p';
  // Una pantalla horizontal en un proyecto vertical (o al revés) no se recorta: va entera y centrada
  // sobre ella misma desenfocada, como se ve una grabación de pantalla en un reel.
  const flip = (info.width / info.height > 1.2 && W / H < 0.85) || (info.width / info.height < 0.85 && W / H > 1.2);
  const vf = flip
    ? [`split[a][b]`, `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.18[bg]`, `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[fg]`, `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},${color}`].join(';')
    : [`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}`, `fps=${fps}`, color].join(',');
  const audioIn = info.hasAudio ? [] : ['-f', 'lavfi', '-t', info.duration.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'];
  await ffmpeg([
    '-i', input, ...audioIn,
    ...(flip ? ['-filter_complex', `[0:v:0]${vf}[v]`, '-map', '[v]'] : ['-map', '0:v:0', '-vf', vf]), '-map', info.hasAudio ? '0:a:0' : '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', k > 1 ? '15' : '18', '-g', String(Math.round(fps)),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest',
    out,
  ]);
  return (await probe(out)).duration;
}

/**
 * Une varios videos en uno solo con la forma pedida (en orden, con su sonido). Sirve para un video
 * hablado grabado en varias partes: se transcribe y se corta como uno solo.
 */
export async function joinClips(files: string[], out: string, shape: ProjectShape = 'vertical'): Promise<{ file: string; start: number; end: number }[]> {
  const first = await probe(files[0]);
  const fps = first.fps > 45 ? 60 : 30;
  const tmp = `${out}.partes`;
  await mkdir(tmp, { recursive: true });
  const parts: string[] = [];
  const boundaries: { file: string; start: number; end: number }[] = [];
  let t = 0;
  try {
    for (const [i, f] of files.entries()) {
      const part = path.join(tmp, `${String(i + 1).padStart(2, '0')}.mp4`);
      const d = await normalizeClip(f, part, fps, 1, PROJECT_SHAPES[shape]);
      boundaries.push({ file: path.basename(f), start: t, end: t + d });
      t += d;
      parts.push(part);
    }
    const list = path.join(tmp, 'lista.txt');
    await writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return boundaries;
}

/**
 * Crea un proyecto de montaje (sin depender de la voz) con uno o varios videos.
 * Varios videos se unen en un solo master vertical; se recuerda dónde empieza cada uno.
 */
export async function createMontage(opts: { inputs: string[]; name?: string; client?: string; presetId?: string; fps?: number; /** Master y exportación en 4K. */ uhd?: boolean; /** Forma del video: vertical (por defecto), horizontal o cuadrado. */ shape?: ProjectShape }) {
  const shape = PROJECT_SHAPES[opts.shape ?? settings().forma ?? 'vertical'];
  const files = await expandInputs(opts.inputs);
  const name = opts.name ?? (files.length === 1 ? path.basename(files[0], path.extname(files[0])) : `Montaje ${files.length} clips`);
  const stamp = new Date().toISOString().slice(0, 10);
  let slug = `${stamp}-${slugify(name)}`;
  let dir = projectDir(opts.client, slug);
  for (let i = 2; existsSync(dir); i++) dir = projectDir(opts.client, (slug = `${stamp}-${slugify(name)}-${i}`));
  for (const sub of ['media', path.join('media', 'originales'), 'proxies', P.renders, P.versions]) await mkdir(path.join(dir, sub), { recursive: true });

  const first = await probe(files[0]);
  // Material mayormente en 4K: el master y la exportación se hacen en 4K (si no, se perdería esa nitidez).
  if (opts.uhd === undefined && files.length > 1) {
    const infos = await Promise.all(files.map((f) => probe(f).catch(() => null)));
    opts = { ...opts, uhd: infos.filter((i) => i && Math.min(i.width, i.height) >= 2000).length > files.length / 2 };
  }
  const fps = opts.fps ?? (first.fps > 45 ? 60 : 30);
  const preset = getPreset(opts.presetId ?? 'rapido', await listPresets(opts.client));
  const boundaries: { file: string; start: number; end: number }[] = [];
  let source;

  if (files.length === 1) {
    // Un solo video: se conserva su encuadre original para que el recorte pueda seguir la cara.
    const original = path.join('media', `original${path.extname(files[0]).toLowerCase()}`);
    await copyFile(files[0], path.join(dir, original));
    source = { file: original, duration: first.duration, width: first.width, height: first.height, fps: first.fps, rotation: first.rotation };
    boundaries.push({ file: path.basename(files[0]), start: 0, end: first.duration });
  } else {
    const parts: string[] = [];
    let t = 0;
    for (const [i, f] of files.entries()) {
      const part = path.join(dir, 'media', 'originales', `${String(i + 1).padStart(2, '0')}.mp4`);
      const d = await normalizeClip(f, part, fps, opts.uhd ? 2 : 1, shape);
      boundaries.push({ file: path.basename(f), start: t, end: t + d });
      t += d;
      parts.push(part);
    }
    const list = path.join(dir, 'media', 'originales', 'lista.txt');
    await writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', path.join(dir, P.master)]);
    await rm(list, { force: true });
    for (const p of parts) await rm(p, { force: true });
    source = { file: P.master, duration: t, width: shape.width * (opts.uhd ? 2 : 1), height: shape.height * (opts.uhd ? 2 : 1), fps, rotation: 0, master4k: opts.uhd || undefined };
  }

  const now = new Date().toISOString();
  const project = Project.parse({
    version: SCHEMA_VERSION, id: slug, name, client: opts.client, kind: 'montaje', createdAt: now, updatedAt: now,
    format: { width: shape.width, height: shape.height, fps },
    source,
    presetId: preset.id,
    pacing: Pacing.parse(preset.pacing),
    captions: CaptionStyle.parse({ ...preset.captions, ...kitCaptions(await readKit(opts.client)) }),
    // En un montaje el sonido original es ambiente: sin limpieza de voz y más bajo.
    audio: { denoise: false, targetLufs: settings().exportar?.lufs ?? -14, musicVolume: 0.4, originalVolume: 0.6 },
    export: { quality: opts.uhd ? 'maxima' : settings().exportar?.calidad ?? 'alta', folder: settings().exportar?.carpeta, uhd: Boolean(opts.uhd) },
  });
  await writeProject(dir, project);
  await writeFile(path.join(dir, 'boundaries.json'), JSON.stringify(boundaries, null, 2));
  return { dir, project };
}

/** Tomas del material: cambios de plano detectados más los límites entre archivos. */
export async function detectShots(dir: string): Promise<Shot[]> {
  const f = path.join(dir, P.shots);
  if (existsSync(f)) return JSON.parse(await readFile(f, 'utf8'));
  const project = await readProject(dir);
  const bFile = path.join(dir, 'boundaries.json');
  const boundaries: { file: string; start: number; end: number }[] = existsSync(bFile) ? JSON.parse(await readFile(bFile, 'utf8')) : [];
  const cuts = await detectCuts(path.join(dir, P.proxy));
  const marks = [...new Set([0, ...cuts, ...boundaries.map((b) => b.start), project.source.duration].map((t) => +t.toFixed(2)))].sort((a, b) => a - b);
  const shots: Shot[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    if (marks[i + 1] - marks[i] < 0.3) continue;
    const mid = (marks[i] + marks[i + 1]) / 2;
    shots.push({ id: `t${String(shots.length + 1).padStart(2, '0')}`, start: marks[i], end: marks[i + 1], file: boundaries.find((b) => mid >= b.start && mid < b.end)?.file });
  }
  await writeFile(f, JSON.stringify(shots, null, 2));
  return shots;
}

/** Miniatura del centro de cada toma, para que Claude pueda mirarlas. */
export async function shotThumbnails(dir: string, shots: Shot[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await mkdir(path.join(dir, 'proxies', 'tomas'), { recursive: true });
  for (const s of shots) {
    const file = path.join(dir, 'proxies', 'tomas', `${s.id}.jpg`);
    if (!existsSync(file)) {
      await ffmpeg(['-ss', ((s.start + s.end) / 2).toFixed(2), '-i', path.join(dir, P.proxy), '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', file]);
    }
    out[s.id] = file;
  }
  return out;
}

export function formatShots(shots: Shot[], thumbs?: Record<string, string>): string {
  return shots.map((s) => `${s.id} ${s.start.toFixed(1)}-${s.end.toFixed(1)}s (${(s.end - s.start).toFixed(1)} s)${s.file ? ` · ${s.file}` : ''}${thumbs ? ` · ${thumbs[s.id]}` : ''}`).join('\n');
}

export interface MontagePick { toma: string; inicio?: number; duracion?: number }

/**
 * Arma el montaje: cortes cortos repartidos entre las tomas.
 * - Con música, la duración de cada corte se ajusta al compás.
 * - Con voz en off, el montaje dura lo que dura la voz.
 * - `picks` permite elegir las tomas a mano (lo usa Claude después de mirarlas).
 */
/**
 * Tomas que pueden entrar al montaje: sin las de etiquetas prohibidas por el brief (gente del local,
 * personas hablando). Si todas están prohibidas, se devuelven igual (sin ellas no hay montaje) y quien
 * llama avisa.
 */
export function withoutTags<T extends { tag?: string }>(shots: T[], skip?: string[]): T[] {
  if (!skip?.length) return shots;
  const keep = shots.filter((s) => !s.tag || !skip.includes(s.tag));
  return keep.length ? keep : shots;
}

export async function buildMontage(dir: string, opts: { duration?: number; clipLength?: number; picks?: MontagePick[]; density?: BeatDensity; /** Etiquetas de toma que no pueden salir (lo prohibido en el brief). */ skipTags?: string[] } = {}) {
  const project = await readProject(dir);
  // Con música y sin tomas elegidas a mano, los cortes caen en los golpes de la canción.
  if (!opts.picks?.length && !opts.clipLength && project.audio.music && existsSync(path.join(dir, project.audio.music))) {
    try {
      const r = await montageToBeat(dir, { duration: opts.duration, density: opts.density, skipTags: opts.skipTags });
      return { project: r.project, clip: 60 / r.bpm, beat: 60 / r.bpm, shots: r.cuts, duration: r.duration };
    } catch (e) {
      if (!/pulso claro|material suficiente/.test(String((e as Error).message))) throw e; // sin pulso o con muy poco material: corte parejo
    }
  }
  const all = await detectShots(dir);
  if (!all.length) throw new Error('No se detectaron tomas en el video.');
  // Las tomas elegidas a mano mandan: lo prohibido solo filtra la elección automática.
  const shots = opts.picks?.length ? all : withoutTags(all, opts.skipTags);
  const byId = new Map(all.map((s) => [s.id, s]));

  let clip = opts.clipLength ?? (project.pacing.maxPause <= 0.2 ? 0.8 : project.pacing.maxPause <= 0.4 ? 1.2 : 2);
  let beat: number | null = null;
  if (project.audio.music && existsSync(path.join(dir, project.audio.music))) {
    const bpm = await detectBpm(path.join(dir, project.audio.music), path.join(dir, 'proxies'));
    if (bpm) {
      beat = 60 / bpm;
      clip = Math.max(1, Math.round(clip / beat)) * beat; // cortes al compás
    }
  }
  const total = shots.reduce((a, s) => a + s.end - s.start, 0);
  const voDur = project.audio.voiceover?.duration;
  const target = Math.min(total, (voDur && opts.duration != null && opts.duration < voDur ? undefined : opts.duration) ?? voDur ?? 15);

  let ranges: { start: number; end: number; shot: Shot }[] = [];
  if (opts.picks?.length) {
    for (const p of opts.picks) {
      const s = byId.get(p.toma);
      if (!s) throw new Error(`No existe la toma ${p.toma}. Tomas: ${shots.map((x) => x.id).join(', ')}.`);
      const dur = Math.min(p.duracion ?? clip, s.end - s.start);
      const start = Math.min(Math.max(s.start, s.start + (p.inicio ?? (s.end - s.start - dur) / 2)), s.end - dur);
      ranges.push({ start, end: start + dur, shot: s });
    }
  } else {
    // Con voz en off el montaje debe cubrirla entera: se redondea hacia arriba.
    const n = Math.max(1, project.audio.voiceover && !opts.duration ? Math.ceil(target / clip) : Math.round(target / clip));
    // Cuántos cortes caben en cada toma sin repetir imagen.
    const cap = shots.map((s) => Math.max(1, Math.floor((s.end - s.start - 0.1) / clip)));
    const count = shots.map(() => 0);
    if (shots.length >= n) {
      for (let i = 0; i < n; i++) count[Math.min(shots.length - 1, Math.floor(((i + 0.5) * shots.length) / n))]++;
    } else {
      let left = n;
      for (let round = 0; left > 0 && round < 50; round++) {
        let placed = false;
        for (let i = 0; i < shots.length && left > 0; i++) {
          if (count[i] < cap[i]) { count[i]++; left--; placed = true; }
        }
        if (!placed) break;
      }
    }
    shots.forEach((s, i) => {
      const len = s.end - s.start;
      const dur = Math.min(clip, len);
      // Si entre plano y plano de la misma toma quedaría menos de medio segundo, se ve como un salto:
      // entonces van seguidos (un bloque centrado en la toma), y el corte no «tartamudea».
      const together = len / Math.max(1, count[i]) - dur < 0.5;
      for (let k = 0; k < count[i]; k++) {
        const center = s.start + ((k + 0.5) / count[i]) * len;
        const start = together
          ? Math.min(s.start + Math.max(0, (len - dur * count[i]) / 2) + k * dur, s.end - dur)
          : Math.min(Math.max(s.start, center - dur / 2), s.end - dur);
        ranges.push({ start, end: start + dur, shot: s });
      }
    });
  }
  ranges = ranges.filter((r) => r.end - r.start >= 0.2);
  if (!ranges.length) throw new Error('No hay material suficiente para armar el montaje.');

  project.scenes = ranges.map((r, i) => Scene.parse({
    id: `s${String(i + 1).padStart(2, '0')}`,
    role: i === 0 ? 'gancho' : 'otro',
    title: `Toma ${r.shot.id.slice(1)}`,
    ranges: [{ start: +r.start.toFixed(3), end: +r.end.toFixed(3) }],
  }));
  applyPunchZooms(project.scenes, project.pacing.punchZoomEvery);
  const saved = await writeProject(dir, project);
  return { project: saved, clip, beat, shots: shots.length, duration: ranges.reduce((a, r) => a + r.end - r.start, 0) };
}

/**
 * Pasa un proyecto a montaje con la mezcla de un montaje: la música manda y el sonido original
 * queda de fondo. Solo cambia los volúmenes si siguen en los de un video hablado (no pisa lo que
 * el usuario haya ajustado a mano).
 */
export function asMontage<T extends { kind: string; audio: { musicVolume: number; originalVolume: number } }>(project: T): T {
  project.kind = 'montaje';
  if (project.audio.musicVolume <= 0.2) project.audio.musicVolume = 0.4;
  if (project.audio.originalVolume >= 0.99) project.audio.originalVolume = 0.6;
  return project;
}
