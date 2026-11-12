import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrandKit, brandStyle, type CaptionStyle } from '@axioma/schema';
import { WORKSPACE, slugify } from './paths.ts';

const kitFile = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'kit.json');

export async function readKit(client?: string): Promise<BrandKit | null> {
  const f = kitFile(client);
  return existsSync(f) ? BrandKit.parse(JSON.parse(await readFile(f, 'utf8'))) : null;
}

/** Crea o actualiza el kit de marca del cliente. */
export async function saveKit(client: string | undefined, patch: {
  name?: string; primary?: string; secondary?: string; text?: string; heading?: string; body?: string; logo?: string; captions?: Partial<CaptionStyle>; sector?: string; personality?: string;
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
    sector: patch.sector ?? cur?.sector,
    personality: patch.personality ?? cur?.personality,
    learned: cur?.learned ?? {},
    captions: { ...cur?.captions, ...patch.captions },
  });
  await mkdir(path.dirname(kitFile(client)), { recursive: true });
  await writeFile(kitFile(client), JSON.stringify(kit, null, 2));
  return kit;
}

/** Estilo de subtítulos que impone el kit sobre cualquier preset. */
export function kitCaptions(kit: BrandKit | null): Partial<CaptionStyle> {
  if (!kit) return {};
  // Una marca con sector trae su propio diseño de subtítulos; si no, solo colores y letra.
  const brand = brandStyle(kit);
  return brand ? { ...brand.captions, ...kit.captions } : { highlightColor: kit.colors.primary, color: kit.colors.text, fontFamily: kit.fonts.heading, ...kit.captions };
}

/** Anota con qué diseño se exportó, para que la marca vaya aprendiendo lo que se usa. */
export async function learnFromExport(client: string | undefined, design: string, titleStyle?: string) {
  const kit = await readKit(client);
  if (!kit) return;
  kit.learned[`design:${design}`] = (kit.learned[`design:${design}`] ?? 0) + 1;
  if (titleStyle) kit.learned[`titulo:${titleStyle}`] = (kit.learned[`titulo:${titleStyle}`] ?? 0) + 1;
  await writeFile(kitFile(client), JSON.stringify(kit, null, 2));
}
