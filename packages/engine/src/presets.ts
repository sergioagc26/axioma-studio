import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUILTIN_PRESETS, CaptionStyle, Pacing, Preset } from '@axioma/schema';
import { WORKSPACE, slugify } from './paths.ts';

const presetsDir = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'presets');

/** Presets propios del cliente (los base se añaden con getPreset). */
export async function listPresets(client?: string): Promise<Preset[]> {
  const dir = presetsDir(client);
  if (!existsSync(dir)) return [];
  const out: Preset[] = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(Preset.parse(JSON.parse(await readFile(path.join(dir, f), 'utf8'))));
    } catch {
      /* preset inválido: se ignora */
    }
  }
  return out;
}

export async function allPresets(client?: string): Promise<Preset[]> {
  const own = await listPresets(client);
  return [...own, ...BUILTIN_PRESETS.filter((b) => !own.some((o) => o.id === b.id))];
}

/** Guarda un preset del cliente partiendo de uno existente. */
export async function savePreset(
  client: string | undefined,
  input: { name: string; description?: string; base?: string; pacing?: Partial<Pacing>; captions?: Partial<CaptionStyle>; palette?: string[]; reference?: string; style?: Preset['style'] },
): Promise<Preset> {
  const base = (await allPresets(client)).find((p) => p.id === (input.base ?? 'con-ritmo')) ?? BUILTIN_PRESETS[0];
  const preset = Preset.parse({
    id: slugify(input.name),
    name: input.name,
    description: input.description ?? '',
    pacing: Pacing.parse({ ...base.pacing, ...input.pacing }),
    captions: CaptionStyle.parse({ ...base.captions, ...input.captions, ...(input.captions?.fontWeight ? {} : fontWeightFor(input.captions?.fontFamily)) }),
    palette: input.palette,
    reference: input.reference,
    style: input.style,
  });
  const dir = presetsDir(client);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${preset.id}.json`), JSON.stringify(preset, null, 2));
  return preset;
}

/** Las fuentes de un solo peso (Anton, Bebas…) necesitan 400 para no verse falsas. */
function fontWeightFor(font?: string): Partial<CaptionStyle> {
  if (!font) return {};
  return ['Anton', 'Bebas Neue', 'Archivo Black'].includes(font) ? { fontWeight: 400 } : { fontWeight: font === 'Oswald' ? 700 : 800 };
}

/** Estilo propio del cliente por su id (los de la app no cuentan). */
async function ownPresetFile(client: string | undefined, id: string): Promise<{ file: string; preset: Preset }> {
  const dir = presetsDir(client);
  if (id && path.basename(id) === id && existsSync(dir)) {
    for (const f of await readdir(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const preset = Preset.parse(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
        if (preset.id === id) return { file: path.join(dir, f), preset };
      } catch { /* preset inválido: se ignora */ }
    }
  }
  const builtin = BUILTIN_PRESETS.some((b) => b.id === id);
  throw Object.assign(new Error(builtin ? 'Ese estilo es de la app: no se puede cambiar ni borrar.' : 'Ese estilo ya no existe.'), { status: builtin ? 400 : 404 });
}

/** Cambia el nombre con el que se ve un estilo propio (el id no cambia). */
export async function renamePreset(client: string | undefined, id: string, name: string): Promise<Preset[]> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean) throw Object.assign(new Error('Escribe un nombre para el estilo.'), { status: 400 });
  const { file, preset } = await ownPresetFile(client, id);
  await writeFile(file, JSON.stringify({ ...preset, name: clean }, null, 2));
  return allPresets(client);
}

/** Lleva un archivo de estilo a la papelera (se puede recuperar). */
async function trashPresetFile(client: string | undefined, file: string) {
  const trash = path.join(WORKSPACE, 'papelera');
  await mkdir(trash, { recursive: true });
  await rename(file, path.join(trash, `estilo--${slugify(client ?? 'personal')}--${path.basename(file, '.json')}--${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
}

/** Borra un estilo propio del cliente (va a la papelera). Los de la app no se borran. */
export async function deletePreset(client: string | undefined, id: string): Promise<Preset[]> {
  const { file } = await ownPresetFile(client, id);
  await trashPresetFile(client, file);
  return allPresets(client);
}

/** Borra los estilos guardados a partir de una referencia. Devuelve sus ids. */
export async function deleteReferencePresets(client: string | undefined, refId: string): Promise<string[]> {
  const dir = presetsDir(client);
  if (!existsSync(dir)) return [];
  const gone: string[] = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const p = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
      if (p.reference === refId) { await trashPresetFile(client, path.join(dir, f)); gone.push(String(p.id ?? f)); }
    } catch { /* preset inválido: se ignora */ }
  }
  return gone;
}
