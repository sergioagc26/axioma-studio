import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  CaptionStyle, Pacing, Scene, SceneVariant, getPreset, outputDuration,
  type Project, type Preset,
} from '@snz/schema';
import { analyzePhrases, applyPunchZooms, phrasesToRanges, type Phrase } from './cuts.ts';
import { P, WORKSPACE } from './paths.ts';
import { readAnalysis } from './pipeline.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { listPresets } from './presets.ts';

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

export type ScenePatch = Partial<Pick<Scene, 'role' | 'title' | 'onScreenText' | 'textColor' | 'visual' | 'punchZoom' | 'brollFile' | 'motionTemplate'>> & {
  phrases?: string[];
};

export async function editScene(dir: string, sceneId: string, patch: ScenePatch) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  const { phrases: ids, ...rest } = patch;
  Object.assign(scene, rest);
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

/** Aplica una variante: sus campos pasan a la escena. `null` vuelve al original. */
export async function chooseVariant(dir: string, sceneId: string, variantId: string | null) {
  const project = await readProject(dir);
  const scene = findScene(project, sceneId);
  if (variantId === null) {
    scene.chosenVariant = undefined;
  } else {
    const v = scene.variants.find((x) => x.id === variantId);
    if (!v) throw new Error(`La escena ${sceneId} no tiene la variante "${variantId}".`);
    scene.chosenVariant = v.id;
    scene.visual = v.visual;
    if (v.onScreenText !== undefined) scene.onScreenText = v.onScreenText || undefined;
    if (v.textColor) scene.textColor = v.textColor;
    if (v.brollFile) scene.brollFile = v.brollFile;
    if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
  }
  return writeProject(dir, project);
}

export async function applyPreset(dir: string, presetId: string) {
  const project = await readProject(dir);
  const preset: Preset = getPreset(presetId, await listPresets(project.client));
  project.presetId = preset.id;
  project.pacing = Pacing.parse(preset.pacing);
  project.captions = CaptionStyle.parse(preset.captions);
  applyPunchZooms(project.scenes, project.pacing.punchZoomEvery);
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
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
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
    `Cliente: ${project.client ?? 'personal'} · Preset: ${project.presetId} · Estado: ${project.approval}`,
    `Fuente: ${project.source.duration.toFixed(1)} s · Salida: ${outputDuration(project).toFixed(1)} s · ${project.format.width}×${project.format.height} @ ${project.format.fps} fps`,
  ];
  if (Object.keys(project.brief).length) lines.push(`Brief: ${Object.entries(project.brief).map(([k, v]) => `${k}=${v}`).join('; ')}`);
  lines.push('Escenas:');
  for (const s of project.scenes) {
    const d = s.ranges.reduce((a, r) => a + r.end - r.start, 0);
    const v = s.variants.length ? ` · variantes: ${s.variants.map((x) => x.id + (x.id === s.chosenVariant ? '*' : '')).join(',')}` : '';
    lines.push(`  ${s.id} [${s.role}] ${s.title || '(sin título)'} · ${d.toFixed(1)} s · ${s.visual}${s.onScreenText ? ` · texto: "${s.onScreenText}"` : ''}${s.punchZoom ? ' · zoom' : ''}${v}`);
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
  return out.sort((a, b) => b.mtime - a.mtime);
}

function findScene(project: Project, id: string): Scene {
  const s = project.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`No existe la escena ${id}. Escenas: ${project.scenes.map((x) => x.id).join(', ') || 'ninguna'}.`);
  return s;
}
