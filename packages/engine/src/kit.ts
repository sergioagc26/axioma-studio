import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrandKit, type CaptionStyle } from '@snz/schema';
import { WORKSPACE, slugify } from './paths.ts';

const kitFile = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'kit.json');

export async function readKit(client?: string): Promise<BrandKit | null> {
  const f = kitFile(client);
  return existsSync(f) ? BrandKit.parse(JSON.parse(await readFile(f, 'utf8'))) : null;
}

/** Crea o actualiza el kit de marca del cliente. */
export async function saveKit(client: string | undefined, patch: {
  name?: string; primary?: string; secondary?: string; text?: string; heading?: string; body?: string; logo?: string; captions?: Partial<CaptionStyle>;
}): Promise<BrandKit> {
  const cur = await readKit(client);
  const kit = BrandKit.parse({
    id: slugify(client ?? 'personal'),
    name: patch.name ?? cur?.name ?? client ?? 'Personal',
    colors: {
      primary: patch.primary ?? cur?.colors.primary ?? '#FE2C55',
      secondary: patch.secondary ?? cur?.colors.secondary ?? '#25F4EE',
      text: patch.text ?? cur?.colors.text ?? '#FFFFFF',
    },
    fonts: { heading: patch.heading ?? cur?.fonts.heading ?? 'Montserrat', body: patch.body ?? cur?.fonts.body ?? 'Inter' },
    logo: patch.logo ?? cur?.logo,
    captions: { ...cur?.captions, ...patch.captions },
  });
  await mkdir(path.dirname(kitFile(client)), { recursive: true });
  await writeFile(kitFile(client), JSON.stringify(kit, null, 2));
  return kit;
}

/** Estilo de subtítulos que impone el kit sobre cualquier preset. */
export function kitCaptions(kit: BrandKit | null): Partial<CaptionStyle> {
  if (!kit) return {};
  return { highlightColor: kit.colors.primary, color: kit.colors.text, fontFamily: kit.fonts.heading, ...kit.captions };
}
