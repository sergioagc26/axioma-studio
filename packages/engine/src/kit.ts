import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrandKit, brandStyle, type CaptionStyle } from '@axioma/schema';
import { WORKSPACE, slugify } from './paths.ts';

export const kitFile = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'kit.json');

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
  if (brand) return { ...brand.captions, ...kit.captions };
  // Sin sector: igual se usa el diseño de subtítulos que mejores resultados le dio.
  const won = Object.keys(kit.learned ?? {}).find((k) => k.startsWith('exito:design:'))?.slice(13);
  return { highlightColor: kit.colors.primary, color: kit.colors.text, fontFamily: kit.fonts.heading, ...(won ? { design: won } : {}), ...kit.captions };
}

/** Anota con qué diseño se exportó, para que la marca vaya aprendiendo lo que se usa. */
export async function learnFromExport(client: string | undefined, design: string, titleStyle?: string) {
  const kit = await readKit(client);
  if (!kit) return;
  kit.learned[`design:${design}`] = (kit.learned[`design:${design}`] ?? 0) + 1;
  if (titleStyle) kit.learned[`titulo:${titleStyle}`] = (kit.learned[`titulo:${titleStyle}`] ?? 0) + 1;
  await writeFile(kitFile(client), JSON.stringify(kit, null, 2));
}

/** Carpeta del cliente (clientes/<cliente>). */
export const clientDir = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'));

/** Guarda el logo en la marca del cliente: sirve para todos sus reels (marca de agua, cierre, imágenes). */
export async function saveClientLogo(client: string | undefined, file: string) {
  const ext = path.extname(file).toLowerCase();
  if (!/^\.(png|jpe?g|webp|svg)$/.test(ext)) throw new Error('El logo tiene que ser una imagen (PNG con fondo transparente es lo mejor).');
  const rel = path.join('marca', `logo${ext}`);
  await mkdir(path.join(clientDir(client), 'marca'), { recursive: true });
  await copyFile(file, path.join(clientDir(client), rel));
  return saveKit(client, { logo: rel.split(path.sep).join('/') });
}

/** Ruta absoluta del logo de la marca del cliente, si tiene. */
export async function clientLogo(client?: string): Promise<string | null> {
  const kit = await readKit(client);
  if (!kit?.logo) return null;
  const abs = path.join(clientDir(client), kit.logo);
  return existsSync(abs) ? abs : null;
}
