import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  CaptionStyle, Pacing, Project, Scene, SceneVariant, applyVariant, brandStyle, getPreset, motionIdeas, shortPhrases, speechOf, outputDuration, recommendTransitions, sceneLength, suggestVariants,
  type Asset, type Preset,
} from '@axioma/schema';
import { analyzePhrases, applyPunchZooms, phrasesToRanges, type Phrase } from './cuts.ts';
import { kitCaptions, readKit } from './kit.ts';
import { P, WORKSPACE } from './paths.ts';
import { readAnalysis } from './pipeline.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { listPresets, savePreset } from './presets.ts';
import { extractWav16k, mediaDuration, processVoice } from './media.ts';
import { AUTO_SFX, ensureProjectSfx } from './sfx.ts';
import { generateImage } from './imagegen.ts';
import { ensureDepth } from './depth.ts';
import { transcribeWav } from './transcribe.ts';
import { spreadWords } from './dub.ts';
import { synthesize, type TtsProvider } from './tts.ts';

/** Frases del proyecto (para que Claude arme el storyboard). */
export async function getPhrases(dir: string): Promise<Phrase[]> {
  const project = await readProject(dir);
  const transcript = await readTranscript(dir);
  if (!transcript) throw new Error('El proyecto aún no está transcrito.');
  const silences = (await readAnalysis(dir))?.silences ?? [];
  return analyzePhrases(transcript.words, project.pacing, silences);
}

/** Transcripción compacta: una línea por frase, con marcas de toma/muletilla. */
export function formatPhrases(phrases: Phrase[]): string {
  return phrases
    .map((p) => {
      const tag = p.junk ? ' [muletilla]' : p.retakeOf ? ` [toma descartada, se repite en ${p.retakeOf}]` : '';
      return `${p.id} ${p.start.toFixed(1)}-${p.end.toFixed(1)}s: ${p.text}${tag}`;
    })
    .join('\n');
}

export interface SceneDraft {
  role?: Scene['role'];
  title?: string;
  phrases: string[];
  onScreenText?: string;
  textColor?: string;
  visual?: Scene['visual'];
}

/** Reemplaza las escenas a partir de frases elegidas por Claude. */
export async function buildStoryboard(dir: string, drafts: SceneDraft[]) {
  const project = await readProject(dir);
  const phrases = await getPhrases(dir);
  const byId = new Map(phrases.map((p) => [p.id, p]));
  const silences = (await readAnalysis(dir))?.silences ?? [];
  const scenes: Scene[] = drafts.map((d, i) => {
    const missing = d.phrases.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`Escena ${i + 1}: no existen las frases ${missing.join(', ')}.`);
    const ranges = phrasesToRanges(d.phrases.map((id) => byId.get(id)!), project.pacing, project.source.duration, silences);
    if (!ranges.length) throw new Error(`Escena ${i + 1}: las frases elegidas no tienen audio.`);
    return Scene.parse({
      id: `s${String(i + 1).padStart(2, '0')}`,
      role: d.role ?? 'otro',
      title: d.title ?? '',
      ranges,
      visual: d.visual ?? 'original',
      onScreenText: d.onScreenText || undefined,
      textColor: d.textColor,
    });
  });
  applyPunchZooms(scenes, project.pacing.punchZoomEvery);
  project.scenes = scenes;
  return writeProject(dir, project);
}

export type ScenePatch = Partial<Pick<Scene, 'role' | 'title' | 'onScreenText' | 'textColor' | 'visual' | 'punchZoom' | 'brollFile' | 'motionTemplate' | 'textStyle' | 'textKeyword' | 'textPosition' | 'look' | 'camera' | 'trimStart' | 'trimEnd' | 'brollLayout'>> & {
  phrases?: string[];
};

export async function editScene(dir: string, sceneId: string, patch: ScenePatch) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  const { phrases: ids, ...rest } = patch;
  // Solo se cambian los campos que vienen con valor.
  Object.assign(scene, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
  if (rest.onScreenText === '') scene.onScreenText = undefined;
  if (ids) {
    const phrases = await getPhrases(dir);
    const byId = new Map(phrases.map((p) => [p.id, p]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`No existen las frases ${missing.join(', ')}.`);
    const silences = (await readAnalysis(dir))?.silences ?? [];
    scene.ranges = phrasesToRanges(ids.map((id) => byId.get(id)!), project.pacing, project.source.duration, silences);
  }
  return writeProject(dir, project);
}

export async function reorderScenes(dir: string, order: string[]) {
  const project = await readProject(dir);
  const ids = project.scenes.map((s) => s.id);
  if (order.length !== ids.length || !ids.every((id) => order.includes(id))) {
    throw new Error(`El nuevo orden debe incluir exactamente estas escenas: ${ids.join(', ')}.`);
  }
  project.scenes = order.map((id) => findScene(project, id));
  return writeProject(dir, project);
}

export async function deleteScene(dir: string, sceneId: string) {
  const project = await readProject(dir);
  findScene(project, sceneId);
  project.scenes = project.scenes.filter((s) => s.id !== sceneId);
  return writeProject(dir, project);
}

/** Guarda variantes propuestas por Claude para una escena (reemplaza las anteriores). */
export async function setVariants(dir: string, sceneId: string, variants: Omit<SceneVariant, 'id'>[]) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  scene.variants = variants.map((v, i) => SceneVariant.parse({ ...v, id: String.fromCharCode(97 + i) }));
  scene.chosenVariant = undefined;
  return writeProject(dir, project);
}

/** Aplica una variante: sus campos pasan a la escena. `null` solo quita la marca. */
export async function chooseVariant(dir: string, sceneId: string, variantId: string | null) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  if (variantId === null) {
    applyVariant(scene, null);
  } else {
    const v = scene.variants.find((x) => x.id === variantId);
    if (!v) throw new Error(`La escena ${sceneId} no tiene la variante "${variantId}".`);
    applyVariant(scene, v);
  }
  return writeProject(dir, project);
}

/** Tres variantes automáticas para una escena (sin Claude), guardadas en ella. */
export async function suggestSceneVariants(dir: string, sceneId: string, round = 0) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  scene.variants = suggestVariants(project, scene, await readTranscript(dir), round);
  scene.chosenVariant = undefined;
  return writeProject(dir, project);
}

const STRONG_MOTION = ['pregunta', 'porcentaje', 'contador', 'comparacion', 'pasos', 'checklist', 'lista', 'barras'];

/**
 * Un estilo es una edición ya puesta, no solo un color: pone el gancho, los textos
 * sacados de lo que se dice, el zoom cuando aparecen, los movimientos de cámara,
 * los motion graphics con las cifras y frases del video y los acabados del reel.
 * Lo que el usuario escribió o eligió a mano no se toca: solo se reemplaza lo que
 * había puesto el estilo anterior.
 */
async function dressEdit(dir: string, project: Project, st: NonNullable<Preset['style']>) {
  // (st se reasigna según la intensidad)
  const transcript = project.kind === 'hablado' ? await readTranscript(dir).catch(() => null) : null;
  // La intensidad sube o baja la densidad de todo lo que pone el estilo.
  const level = project.intensity ?? 'media';
  st = level === 'suave'
    ? { ...st, texts: st.texts === 'muchos' ? 'pocos' : st.texts === 'pocos' ? 'ninguno' : st.texts, zoomText: false, motionEvery: st.motionEvery ? st.motionEvery * 2 : 0, cameras: ['acercar', 'ninguno'], sfxAuto: false }
    : level === 'fuerte'
      ? { ...st, texts: 'muchos', zoomText: true, motionEvery: Math.max(2, (st.motionEvery || 4) - 1), sfxAuto: true }
      : st;
  if (level !== 'media' && st.sfxAuto !== undefined) project.audio.sfxAuto = st.sfxAuto && !project.audio.sfxOff;
  // Suave: solo el gancho lleva zoom de golpe.
  if (level === 'suave') project.scenes.forEach((sc, i) => { sc.punchZoom = i === 0 && sc.punchZoom; });
  const mode = st.texts ?? 'pocos';
  const n = project.scenes.length;
  project.scenes.forEach((s, i) => {
    // Se quita lo que puso el estilo anterior.
    if (s.autoText !== undefined && s.onScreenText === s.autoText) s.onScreenText = undefined;
    s.autoText = undefined;
    if (s.autoMotion) { s.visual = 'original'; s.motionTemplate = undefined; s.motionData = undefined; s.autoMotion = undefined; }
    if (st.cameras?.length) s.camera = st.cameras[i % st.cameras.length];
    const first = i === 0;
    const last = i === n - 1 && n > 1;
    const wants = mode !== 'ninguno' && (first || last || (mode === 'muchos' ? i % 2 === 0 : i % 3 === 0));
    if (transcript && wants && !s.onScreenText && s.visual === 'original') {
      const text = shortPhrases(speechOf(s, transcript))[0];
      if (text) { s.onScreenText = text; s.autoText = text; }
    }
    if (first && st.hook && s.onScreenText) s.textStyle = st.hook;
    // Zoom cuando aparece el texto.
    if (st.zoomText && s.onScreenText) {
      s.punchZoom = true;
      if (s.camera === 'ninguno') s.camera = 'acercar';
    }
  });
  if (transcript && st.motionEvery) {
    const every = st.motionEvery;
    project.scenes.forEach((s, i) => {
      if (i === 0 || i === n - 1 || i % every !== every - 1 || s.visual !== 'original') return;
      const idea = motionIdeas(speechOf(s, transcript), s, false).find((m) => STRONG_MOTION.includes(m.motionTemplate ?? ''));
      if (!idea) return;
      // El gráfico ocupa la escena: el texto que puso el estilo se quita para que no se encimen.
      if (s.autoText !== undefined && s.onScreenText === s.autoText) { s.onScreenText = undefined; s.autoText = undefined; }
      applyVariant(s, { ...idea, id: 'a' });
      s.chosenVariant = undefined;
      s.autoMotion = true;
    });
  }
  if (st.finish) project.finish = { ...project.finish, progressBar: Boolean(st.finish.progressBar), grain: Boolean(st.finish.grain), vignette: Boolean(st.finish.vignette), halation: Boolean(st.finish.halation), letterbox: Boolean(st.finish.letterbox) };
}

export async function applyPreset(dir: string, presetId: string) {
  const project = await readProject(dir);
  return applyPresetObject(dir, getPreset(presetId, await listPresets(project.client)));
}

/** Aplica un estilo ya armado (uno guardado, o la mezcla de referencia y tendencia de la edición automática). */
export async function applyPresetObject(dir: string, preset: Preset) {
  const project = await readProject(dir);
  project.presetId = preset.id;
  project.pacing = Pacing.parse(preset.pacing);
  project.captions = CaptionStyle.parse({ ...preset.captions, ...kitCaptions(await readKit(project.client)) });
  applyPunchZooms(project.scenes, project.pacing.punchZoomEvery);
  // Un preset con estilo (los que salen de una referencia) también viste las escenas.
  const st = preset.style;
  if (st) {
    for (const s of project.scenes) {
      if (st.textStyle) s.textStyle = st.textStyle;
      if (st.textFont) s.textFont = st.textFont;
      if (st.textAnim) s.textAnim = st.textAnim;
      if (st.look) s.look = st.look;
      if (st.camera) s.camera = st.camera;
    }
    if (st.transitions) {
      const advice = recommendTransitions(project);
      for (const a of advice) {
        const s = project.scenes.find((x) => x.id === a.sceneId);
        // Si la referencia usa destellos, las transiciones con efecto pasan a ser destellos.
        if (s) s.transition = a.transition ? { id: st.flashes ? 'destello' : a.transition } : undefined;
      }
    }
    if (st.sfxAuto !== undefined) {
      // Efectos apagados a mano: ningún estilo los vuelve a encender.
      const on = st.sfxAuto && !project.audio.sfxOff;
      if (on) await ensureProjectSfx(dir, AUTO_SFX);
      project.audio.sfxAuto = on;
    }
    await dressEdit(dir, project, st);
  }
  return writeProject(dir, project);
}

export async function setCaptions(dir: string, patch: Partial<CaptionStyle>) {
  const project = await readProject(dir);
  project.captions = CaptionStyle.parse({ ...project.captions, ...patch });
  return writeProject(dir, project);
}

export async function setBrief(dir: string, brief: Record<string, string>) {
  const project = await readProject(dir);
  project.brief = { ...project.brief, ...brief };
  return writeProject(dir, project);
}

export async function setStatus(dir: string, status: Project['approval']) {
  const project = await readProject(dir);
  project.approval = status;
  return writeProject(dir, project);
}

/** Copia project.json a versions/ con fecha y una etiqueta. */
export async function saveVersion(dir: string, label = '') {
  await mkdir(path.join(dir, P.versions), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const name = `${stamp}${label ? '-' + label.replace(/[^\w-]+/g, '_').slice(0, 40) : ''}.json`;
  await copyFile(path.join(dir, P.project), path.join(dir, P.versions, name));
  return name;
}

export async function addRequest(dir: string, text: string, sceneId?: string) {
  const project = await readProject(dir);
  project.requests.push({ id: `r${Date.now().toString(36)}`, at: new Date().toISOString(), text, sceneId, status: 'pendiente' });
  return writeProject(dir, project);
}

export async function resolveRequest(dir: string, requestId: string, status: 'hecha' | 'descartada') {
  const project = await readProject(dir);
  const r = project.requests.find((x) => x.id === requestId);
  if (!r) throw new Error(`No existe la petición ${requestId}.`);
  r.status = status;
  return writeProject(dir, project);
}

/** Resumen legible del proyecto para Claude. */
export function summarize(project: Project, dir: string): string {
  const lines = [
    `Proyecto: ${project.name} (${project.id})`,
    `Carpeta: ${dir}`,
    `Cliente: ${project.client ?? 'personal'} · Tipo: ${project.kind} · Preset: ${project.presetId} · Estado: ${project.approval}`,
    `Audio: original ${project.audio.originalVolume}${project.audio.music ? ` · música ${project.audio.musicVolume}` : ''}${project.audio.voiceover ? ` · voz en off (${project.audio.voiceover.provider}, ${project.audio.voiceover.duration.toFixed(1)} s)` : ''} · encuadre ${project.source.autoFocus ? 'sigue la cara' : `fijo ${project.source.focusX}`}`,
    `Fuente: ${project.source.duration.toFixed(1)} s · Salida: ${outputDuration(project).toFixed(1)} s · ${project.format.width}×${project.format.height} @ ${project.format.fps} fps`,
  ];
  if (Object.keys(project.brief).length) lines.push(`Brief: ${Object.entries(project.brief).map(([k, v]) => `${k}=${v}`).join('; ')}`);
  lines.push('Escenas:');
  for (const s of project.scenes) {
    const d = sceneLength(s);
    const v = s.variants.length ? ` · variantes: ${s.variants.map((x) => x.id + (x.id === s.chosenVariant ? '*' : '')).join(',')}` : '';
    lines.push(`  ${s.id} [${s.role}] ${s.title || '(sin título)'} · ${d.toFixed(1)} s · ${s.visual}${s.transition ? ` · entra con ${s.transition.id}` : ''}${s.onScreenText ? ` · texto: "${s.onScreenText}"` : ''}${s.punchZoom ? ' · zoom' : ''}${v}`);
  }
  const pending = project.requests.filter((r) => r.status === 'pendiente');
  if (pending.length) lines.push(`Peticiones pendientes: ${pending.length}`);
  return lines.join('\n');
}

/** Lista los proyectos del workspace, más recientes primero. */
export async function listProjects(): Promise<{ dir: string; project: Project; mtime: number }[]> {
  const root = path.join(WORKSPACE, 'clientes');
  if (!existsSync(root)) return [];
  const out: { dir: string; project: Project; mtime: number }[] = [];
  for (const client of await readdir(root)) {
    const pdir = path.join(root, client, 'proyectos');
    if (!existsSync(pdir)) continue;
    for (const name of await readdir(pdir)) {
      const dir = path.join(pdir, name);
      const f = path.join(dir, P.project);
      if (!existsSync(f)) continue;
      try {
        out.push({ dir, project: await readProject(dir), mtime: (await stat(f)).mtimeMs });
      } catch {
        /* proyecto dañado: se ignora en la lista */
      }
    }
  }
  // Por la fecha que se ve en la tarjeta (la última vez que se tocó), no la del archivo.
  return out.sort((a, b) => (b.project.updatedAt || '').localeCompare(a.project.updatedAt || '') || b.mtime - a.mtime);
}

function findScene(project: Project, id: string): Scene {
  const s = project.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`No existe la escena ${id}. Escenas: ${project.scenes.map((x) => x.id).join(', ') || 'ninguna'}.`);
  return s;
}

/** Copia un recurso al proyecto y registra su licencia. */
async function importAsset(dir: string, project: Project, file: string, kind: Asset['kind'], info: { source: string; license: string; author?: string; url?: string }): Promise<string> {
  const src = path.resolve(file);
  if (!existsSync(src)) throw new Error(`No existe el archivo: ${src}`);
  if (!info.license.trim()) throw new Error('Indica la licencia del recurso (p. ej. "propia", "Pexels", "comprada en Artlist").');
  const sub = kind === 'broll' ? 'broll' : kind === 'musica' ? 'musica' : 'marca';
  const rel = `media/${sub}/${slugifyName(path.basename(src))}`;
  await mkdir(path.join(dir, 'media', sub), { recursive: true });
  if (path.resolve(dir, rel) !== src) await copyFile(src, path.join(dir, rel));
  project.assets = [...project.assets.filter((a) => a.file !== rel), { file: rel, kind, ...info }];
  return rel;
}

const slugifyName = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  return path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + ext;
};

export { writeProject } from './store.ts';

export async function setMusic(dir: string, file: string | null, opts: { license?: string; source?: string; volume?: number } = {}) {
  const project = await readProject(dir);
  if (file === null) {
    project.audio.music = undefined;
    // Quitada a mano: la edición automática no vuelve a poner otra.
    project.audio.musicOff = true;
  } else {
    project.audio.music = await importAsset(dir, project, file, 'musica', { source: opts.source ?? 'archivo local', license: opts.license ?? '' });
    delete project.audio.musicOff;
  }
  if (opts.volume !== undefined) project.audio.musicVolume = opts.volume;
  return writeProject(dir, project);
}

export async function setBroll(dir: string, sceneId: string, file: string, info: { license: string; source?: string; author?: string; url?: string }) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  scene.brollFile = await importAsset(dir, project, file, 'broll', { source: info.source ?? 'archivo local', license: info.license, author: info.author, url: info.url });
  scene.visual = 'broll';
  scene.chosenVariant = undefined;
  // Una imagen quieta se anima con un acercamiento lento.
  if (/\.(jpe?g|png|webp)$/i.test(scene.brollFile) && scene.camera === 'ninguno') scene.camera = 'acercar';
  await ensureDepth(dir, scene.brollFile);
  return writeProject(dir, project);
}

/**
 * B-roll desde una idea: se crea la imagen y se anima con un movimiento de cámara
 * lento para que no quede quieta. Queda guardada en el proyecto como cualquier otro recurso.
 */
export async function setBrollFromIdea(dir: string, sceneId: string, idea: string, asBackdrop = false) {
  const before = await readProject(dir);
  const { width, height } = before.format;
  // Tamaño proporcional al reel, sin pasar del lado mayor que acepta el generador.
  const k = Math.min(1, 1280 / Math.max(width, height));
  const file = await generateImage(idea, { width: Math.round(width * k), height: Math.round(height * k) });
  try {
    const project = await readProject(dir);
    const scene = findScene(project, sceneId);
    scene.brollFile = await importAsset(dir, project, file, 'broll', { source: `Creada con IA a partir de la idea: ${idea.trim().slice(0, 120)}`, license: 'Generada con IA (Pollinations)' });
    if (asBackdrop) {
      // La imagen va detrás de la persona recortada, no en su lugar.
      scene.backdropFile = scene.brollFile;
      scene.brollFile = undefined;
      scene.backdrop = 'imagen';
      scene.visual = 'original';
      await ensureDepth(dir, scene.backdropFile);
      return await writeProject(dir, project);
    }
    scene.visual = 'broll';
    scene.chosenVariant = undefined;
    if (scene.camera === 'ninguno') scene.camera = 'acercar';
    await ensureDepth(dir, scene.brollFile);
    return await writeProject(dir, project);
  } finally {
    await rm(path.dirname(file), { recursive: true, force: true });
  }
}

/** Pone un archivo (imagen o video) como fondo detrás de la persona recortada. */
export async function setBackdropFile(dir: string, sceneId: string, file: string) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  scene.backdropFile = await importAsset(dir, project, file, 'broll', { source: 'subido en el studio', license: 'propia' });
  scene.backdrop = 'imagen';
  await ensureDepth(dir, scene.backdropFile);
  return writeProject(dir, project);
}

export async function setMotion(dir: string, sceneId: string, template: string, data: Record<string, unknown>) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  scene.visual = template === 'texto' ? 'texto' : 'motion';
  scene.motionTemplate = template === 'texto' ? undefined : template;
  scene.motionData = data;
  scene.chosenVariant = undefined;
  return writeProject(dir, project);
}

export async function setLogo(dir: string, file: string) {
  const project = await readProject(dir);
  await importAsset(dir, project, file, 'logo', { source: 'cliente', license: 'propia' });
  return writeProject(dir, project);
}

/** Encuadre: automático (sigue la cara) o fijo en un punto horizontal. */
export async function setFocus(dir: string, focusX: number | 'auto') {
  const project = await readProject(dir);
  if (focusX === 'auto') {
    project.source.autoFocus = true;
  } else {
    project.source.autoFocus = false;
    project.source.focusX = Math.min(1, Math.max(0, focusX));
  }
  return writeProject(dir, project);
}

export async function setOriginalVolume(dir: string, volume: number) {
  const project = await readProject(dir);
  project.audio.originalVolume = Math.min(1, Math.max(0, volume));
  return writeProject(dir, project);
}

/**
 * Genera la voz en off, la transcribe (para subtitularla) y la pone en el reel.
 * Suena desde el inicio. Por defecto silencia la voz original en un video
 * hablado y deja el ambiente bajo en un montaje.
 */
export async function setVoiceover(dir: string, text: string, opts: { provider?: TtsProvider; voice?: string; originalVolume?: number } = {}) {
  return recordVoiceover(dir, opts.originalVolume, async (out) => ({
    ...await synthesize(text, out, opts), text,
  }));
}

async function recordVoiceover(dir: string, volume: number | undefined, generate: (file: string) => Promise<{ provider: string; voice?: string; text?: string }>) {
  const folder = `media/narraciones/${randomUUID()}`;
  const file = folder + '/voz-en-off.wav';
  const wordsFile = folder + '/palabras.json';
  const out = path.join(dir, file);
  const wav = path.join(dir, folder, '16k.wav');
  await mkdir(path.dirname(out), { recursive: true });
  try {
    const used = await generate(out);
    await extractWav16k(out, wav);
    const transcript = await transcribeWav(wav);
    await rm(wav);
    const duration = await mediaDuration(out);
    if (!transcript.words.length && used.text) transcript.words = spreadWords(used.text, 0, duration);
    await writeFile(path.join(dir, wordsFile), JSON.stringify(transcript));
    const project = await readProject(dir);
    // El volumen original de antes se recuerda para devolverlo al quitar la voz en off.
    const prev = project.audio.voiceover?.prevOriginalVolume ?? project.audio.originalVolume;
    project.audio.voiceover = { file, wordsFile, duration, provider: used.provider, voice: used.voice, text: used.text ?? transcript.words.map(w => w.text).join(' '), prevOriginalVolume: prev };
    project.audio.originalVolume = volume ?? (project.kind === 'montaje' ? Math.min(project.audio.originalVolume, 0.25) : 0);
    return await writeProject(dir, project);
  } catch (error) {
    await rm(path.dirname(out), { recursive: true, force: true });
    throw error;
  }
}

export async function removeVoiceover(dir: string) {
  const project = await readProject(dir);
  // Vuelve el volumen original que había antes de la voz en off (si no se sabe, el de siempre).
  const prev = project.audio.voiceover?.prevOriginalVolume;
  project.audio.voiceover = undefined;
  project.audio.originalVolume = prev ?? (project.kind === 'montaje' ? 0.6 : 1);
  return writeProject(dir, project);
}

export async function listVersions(dir: string): Promise<string[]> {
  const v = path.join(dir, P.versions);
  return existsSync(v) ? (await readdir(v)).filter((f) => f.endsWith('.json')).sort().reverse() : [];
}

/** Diferencias entre una versión guardada y el estado actual. */
export async function compareVersion(dir: string, name: string): Promise<string> {
  const old = Project.parse(JSON.parse(await readFile(path.join(dir, P.versions, path.basename(name)), 'utf8')));
  const cur = await readProject(dir);
  const line = (p: Project) => `${p.scenes.length} escenas · ${outputDuration(p).toFixed(1)} s · preset ${p.presetId} · ${p.approval}`;
  const texts = (p: Project) => p.scenes.map((s) => `${s.id}:${s.visual}:${s.onScreenText ?? ''}`);
  const a = texts(old), b = texts(cur);
  const changed = b.filter((x) => !a.includes(x)).length + a.filter((x) => !b.includes(x)).length;
  return [`Versión ${name}: ${line(old)}`, `Actual: ${line(cur)}`, `Orden: ${old.scenes.map((s) => s.id).join(' ')} → ${cur.scenes.map((s) => s.id).join(' ')}`, `Escenas con cambios de texto o tipo: ${changed}`].join('\n');
}

/** Vuelve a una versión guardada (antes guarda la actual como respaldo). */
export async function restoreVersion(dir: string, name: string) {
  const old = Project.parse(JSON.parse(await readFile(path.join(dir, P.versions, path.basename(name)), 'utf8')));
  await saveVersion(dir, 'antes-de-restaurar');
  return writeProject(dir, old);
}

/**
 * Corrección de audio de la voz grabada: vuelve a procesarla con la limpieza de
 * ruido y el realce elegidos. Solo aplica a proyectos hablados.
 */
export async function correctAudio(dir: string, opts: { denoise?: boolean; level?: 'suave' | 'media' | 'fuerte'; enhance?: boolean }) {
  const project = await readProject(dir);
  if (project.kind !== 'hablado') throw new Error('La corrección de voz aplica a videos hablados. En un montaje, ajusta el sonido original o silencia el video.');
  const audio = { ...project.audio };
  if (opts.denoise !== undefined) audio.denoise = opts.denoise;
  if (opts.level) audio.denoiseLevel = opts.level;
  if (opts.enhance !== undefined) audio.enhance = opts.enhance;
  await processVoice(path.join(dir, P.master), path.join(dir, P.voice), audio);
  // Se vuelve a leer: lo que el usuario cambió mientras se procesaba (volúmenes, efectos) no se pisa.
  const now = await readProject(dir);
  now.audio.denoise = audio.denoise;
  now.audio.denoiseLevel = audio.denoiseLevel;
  now.audio.enhance = audio.enhance;
  now.audio.processedVoice = P.voice;
  return writeProject(dir, now);
}

/** Añade un efecto de sonido a una escena. */
export async function addSfx(dir: string, sceneId: string, id: string, opts: { offset?: number; volume?: number } = {}) {
  await ensureProjectSfx(dir, [id]);
  const project = await readProject(dir);
  findScene(project, sceneId).sfx.push({ id, offset: opts.offset ?? 0, volume: opts.volume ?? 0.6 });
  return writeProject(dir, project);
}

/** Quita los efectos de una escena, o de todas si no se indica. */
export async function clearSfx(dir: string, sceneId?: string) {
  const project = await readProject(dir);
  for (const s of project.scenes) if (!sceneId || s.id === sceneId) s.sfx = [];
  return writeProject(dir, project);
}

/**
 * Efectos automáticos: barrido en cada transición y "pop" al entrar cada texto.
 * `manual` = lo eligió el usuario: queda recordado y la edición automática lo respeta.
 */
export async function setAutoSfx(dir: string, on: boolean, opts: { manual?: boolean } = {}) {
  const project = await readProject(dir);
  if (opts.manual) { if (on) delete project.audio.sfxOff; else project.audio.sfxOff = true; }
  else if (on && project.audio.sfxOff) return project; // apagados a mano: no se encienden solos
  if (on) await ensureProjectSfx(dir, AUTO_SFX);
  project.audio.sfxAuto = on;
  return writeProject(dir, project);
}

/**
 * Viste el proyecto con el estilo de la marca (según su sector y personalidad):
 * subtítulos, títulos, letra, imagen, transiciones y efectos.
 */
export async function applyBrandStyle(dir: string): Promise<{ project: Project; why: string } | null> {
  const project = await readProject(dir);
  const kit = await readKit(project.client);
  const brand = brandStyle(kit);
  if (!brand) return null;
  project.captions = CaptionStyle.parse({ ...project.captions, ...brand.captions, ...kit!.captions });
  const st = brand.style;
  for (const s of project.scenes) {
    if (st.textStyle) s.textStyle = st.textStyle;
    if (st.textFont) s.textFont = st.textFont;
    if (st.textAnim) s.textAnim = st.textAnim;
    if (st.look) s.look = st.look;
    if (st.camera) s.camera = st.camera;
    s.textColor = undefined; // los textos toman el color de la marca
  }
  if (st.transitions) {
    for (const a of recommendTransitions(project)) {
      const s = project.scenes.find((x) => x.id === a.sceneId);
      if (s) s.transition = a.transition ? { id: st.flashes ? 'destello' : a.transition } : undefined;
    }
  }
  const on = Boolean(st.sfxAuto) && !project.audio.sfxOff;
  if (on) await ensureProjectSfx(dir, AUTO_SFX);
  project.audio.sfxAuto = on;
  return { project: await writeProject(dir, project), why: brand.why };
}

/** Guarda el estilo actual del proyecto (ritmo, subtítulos y cómo están vestidas las escenas) como un estilo propio del cliente. */
export async function saveCurrentStyle(dir: string, name: string) {
  const project = await readProject(dir);
  const most = <T>(list: T[]): T | undefined => [...new Set(list)].sort((a, b) => list.filter((x) => x === b).length - list.filter((x) => x === a).length)[0];
  const sc = project.scenes;
  return savePreset(project.client, {
    name, description: `Tu estilo, guardado desde «${project.name}».`, base: project.presetId,
    pacing: project.pacing, captions: project.captions,
    style: {
      textStyle: most(sc.map((s) => s.textStyle)), textFont: most(sc.map((s) => s.textFont).filter(Boolean) as string[]), textAnim: most(sc.map((s) => s.textAnim)),
      look: most(sc.map((s) => s.look)), camera: most(sc.map((s) => s.camera)),
      transitions: sc.some((s) => s.transition), sfxAuto: project.audio.sfxAuto,
    },
  });
}

/**
 * Usa una grabación de voz (hecha en el studio o un archivo) como voz en off:
 * la limpia, la nivela a -16 LUFS, la transcribe y la subtitula.
 */
export async function setVoiceoverFile(dir: string, file: string, opts: { originalVolume?: number } = {}) {
  const project = await readProject(dir);
  return recordVoiceover(dir, opts.originalVolume, async (out) => {
    await processVoice(file, out, { denoise: true, denoiseLevel: 'media', enhance: true, targetLufs: project.audio.targetLufs });
    return { provider: 'grabada' };
  });
}
