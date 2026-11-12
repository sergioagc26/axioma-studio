import { CaptionStyle, Pacing, Preset } from './project.ts';

const p = (x: { id: string; name: string; description: string; pacing?: Partial<Pacing>; captions?: Partial<CaptionStyle> }) =>
  Preset.parse({ ...x, pacing: Pacing.parse(x.pacing ?? {}), captions: CaptionStyle.parse(x.captions ?? {}) });

/** Presets base. Cada cliente puede tener los suyos en su kit. */
export const BUILTIN_PRESETS: Preset[] = [
  p({
    id: 'rapido',
    name: 'Rápido',
    description: 'Sin pausas, zoom de golpe frecuente, subtítulos palabra a palabra en mayúsculas.',
    pacing: { maxPause: 0.2, pad: 0.06, punchZoomEvery: 4 },
    captions: { wordsPerLine: 3, uppercase: true },
  }),
  p({
    id: 'con-ritmo',
    name: 'Con ritmo',
    description: 'Pausas cortas que respiran, zoom moderado.',
    pacing: { maxPause: 0.35, pad: 0.08, punchZoomEvery: 7 },
    captions: { wordsPerLine: 4 },
  }),
  p({
    id: 'sobrio',
    name: 'Sobrio',
    description: 'Ritmo natural, sin zooms, subtítulos por frase en minúsculas.',
    pacing: { maxPause: 0.6, pad: 0.12, punchZoomEvery: 0 },
    captions: { mode: 'phrase', wordsPerLine: 6, uppercase: false, fontWeight: 700, fontSize: 64, highlightColor: '#FFFFFF', fontFamily: 'Inter' },
  }),
];

export function getPreset(id: string, extra: Preset[] = []): Preset {
  const found = [...extra, ...BUILTIN_PRESETS].find((x) => x.id === id);
  if (!found) throw new Error(`No existe el preset "${id}". Disponibles: ${[...extra, ...BUILTIN_PRESETS].map((x) => x.id).join(', ')}`);
  return found;
}
