import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CaptionStyle, Pacing, Project, SCHEMA_VERSION, Transcript, getPreset } from '@snz/schema';
import { P, projectDir, slugify } from './paths.ts';
import { kitCaptions, readKit } from './kit.ts';
import { probe } from './media.ts';

export async function readProject(dir: string): Promise<Project> {
  const raw = JSON.parse(await readFile(path.join(dir, P.project), 'utf8'));
  return Project.parse(raw);
}

/** Guarda validando y de forma atómica (escribe a temporal y renombra). */
export async function writeProject(dir: string, project: Project) {
  const parsed = Project.parse({ ...project, updatedAt: new Date().toISOString() });
  const tmp = path.join(dir, `${P.project}.tmp`);
  await writeFile(tmp, JSON.stringify(parsed, null, 2));
  await rename(tmp, path.join(dir, P.project));
  return parsed;
}

export async function readTranscript(dir: string): Promise<Transcript | null> {
  const f = path.join(dir, P.transcript);
  if (!existsSync(f)) return null;
  return Transcript.parse(JSON.parse(await readFile(f, 'utf8')));
}

export async function writeTranscript(dir: string, t: Transcript) {
  await writeFile(path.join(dir, P.transcript), JSON.stringify(t, null, 2));
}

/** Crea la carpeta del proyecto, copia el video y escribe project.json. */
export async function createProject(opts: { input: string; name?: string; client?: string; presetId?: string; fps?: number }) {
  const input = path.resolve(opts.input);
  if (!existsSync(input)) throw new Error(`No existe el archivo: ${input}`);
  const name = opts.name ?? path.basename(input, path.extname(input));
  const stamp = new Date().toISOString().slice(0, 10);
  let slug = `${stamp}-${slugify(name)}`;
  let dir = projectDir(opts.client, slug);
  for (let i = 2; existsSync(dir); i++) dir = projectDir(opts.client, (slug = `${stamp}-${slugify(name)}-${i}`));
  for (const sub of ['media', 'proxies', P.renders, P.versions]) await mkdir(path.join(dir, sub), { recursive: true });

  const original = path.join('media', `original${path.extname(input).toLowerCase()}`);
  await copyFile(input, path.join(dir, original));
  const info = await probe(path.join(dir, original));
  const preset = getPreset(opts.presetId ?? 'rapido');
  const fps = opts.fps ?? (info.fps > 45 ? 60 : 30);
  const now = new Date().toISOString();
  const project = Project.parse({
    version: SCHEMA_VERSION,
    id: slug,
    name,
    client: opts.client,
    createdAt: now,
    updatedAt: now,
    format: { width: 1080, height: 1920, fps },
    source: { file: original, duration: info.duration, width: info.width, height: info.height, fps: info.fps, rotation: info.rotation },
    presetId: preset.id,
    pacing: Pacing.parse(preset.pacing),
    captions: CaptionStyle.parse({ ...preset.captions, ...kitCaptions(await readKit(opts.client)) }),
  });
  await writeProject(dir, project);
  return { dir, project, info };
}
