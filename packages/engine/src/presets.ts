import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUILTIN_PRESETS, CaptionStyle, Pacing, Preset } from '@snz/schema';
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
  input: { name: string; description?: string; base?: string; pacing?: Partial<Pacing>; captions?: Partial<CaptionStyle> },
): Promise<Preset> {
  const base = (await allPresets(client)).find((p) => p.id === (input.base ?? 'con-ritmo')) ?? BUILTIN_PRESETS[0];
  const preset = Preset.parse({
    id: slugify(input.name),
    name: input.name,
    description: input.description ?? '',
    pacing: Pacing.parse({ ...base.pacing, ...input.pacing }),
    captions: CaptionStyle.parse({ ...base.captions, ...input.captions }),
  });
  const dir = presetsDir(client);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${preset.id}.json`), JSON.stringify(preset, null, 2));
  return preset;
}
