/**
 * Baja a la app los archivos de las tipografías de la plantilla (packages/remotion/src/fonts/spec.ts)
 * y regenera su índice (fonts/manifest.ts). Así exportar no necesita internet: antes, Remotion las
 * bajaba de Google en cada render y en máquinas en la nube eso fallaba.
 *
 * Uso: npm run fuentes   (solo hace falta al cambiar la lista de tipografías)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_SPECS } from '../packages/remotion/src/fonts/spec.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = path.join(ROOT, 'packages', 'remotion', 'src', 'fonts');
const FILES_DIR = path.join(FONTS_DIR, 'files');

interface Meta {
  fontFamily: string;
  subsets?: string[];
  unicodeRanges: Record<string, string>;
  fonts: Record<string, Record<string, Record<string, string>>>;
}

/** Igual que @remotion/google-fonts: un subconjunto que solo existe en trozos [n] se expande. */
function subsetKeys(available: string[], requested: string): string[] {
  if (available.includes(requested)) return [requested];
  const chunks = available.filter((k) => /^\[\d+\]$/.test(k));
  return chunks.length ? chunks : [];
}

const imports: string[] = [];
const entries: string[] = [];
const used = new Set<string>();
const byUrl = new Map<string, string>();
let downloaded = 0;

for (const spec of FONT_SPECS) {
  const mod = (await import(`@remotion/google-fonts/${spec.importName}`)) as { getInfo: () => Meta };
  const meta = mod.getInfo();
  const styleFonts = meta.fonts[spec.style];
  if (!styleFonts) throw new Error(`${spec.family} no tiene el estilo ${spec.style}`);
  const faces: string[] = [];
  for (const weight of spec.weights ?? Object.keys(styleFonts)) {
    const bySubset = styleFonts[weight];
    if (!bySubset) throw new Error(`${spec.family} no tiene el peso ${weight}`);
    for (const requested of spec.subsets) {
      for (const subset of subsetKeys(Object.keys(bySubset), requested)) {
        const url = bySubset[subset];
        let id = byUrl.get(url);
        if (!id) {
          const rel = path.posix.join(spec.importName, path.basename(new URL(url).pathname));
          const file = path.join(FILES_DIR, rel);
          if (!existsSync(file) || statSync(file).size === 0) {
            mkdirSync(path.dirname(file), { recursive: true });
            execFileSync('curl', ['-sSfL', '--retry', '3', '-o', file, url]);
            downloaded++;
          }
          used.add(path.normalize(file));
          id = `f${byUrl.size}`;
          byUrl.set(url, id);
          imports.push(`import ${id} from './files/${rel}';`);
        }
        faces.push(`    { src: ${id}, style: '${spec.style}', weight: '${weight}', unicodeRange: ${JSON.stringify(meta.unicodeRanges[subset] ?? '')} },`);
      }
    }
  }
  entries.push(`  ${JSON.stringify(spec.family)}: [\n${faces.join('\n')}\n  ],`);
}

// Archivos que ya no usa ninguna tipografía de la lista.
let removed = 0;
const walk = (dir: string): string[] => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
  : [];
for (const f of walk(FILES_DIR)) {
  if (f.endsWith('.woff2') && !used.has(path.normalize(f))) { rmSync(f); removed++; }
}

writeFileSync(path.join(FONTS_DIR, 'manifest.ts'), `// Generado por «npm run fuentes» (scripts/fuentes.ts) a partir de spec.ts. No editar a mano.
${imports.join('\n')}

export interface LocalFace { src: string; style: string; weight: string; unicodeRange: string }

export const FACES: Record<string, LocalFace[]> = {
${entries.join('\n')}
};
`);

const bytes = [...used].reduce((a, f) => a + statSync(f).size, 0);
console.log(`✓ ${FONT_SPECS.length} tipografías, ${used.size} archivos (${(bytes / 1024 / 1024).toFixed(1)} MB). Bajados ahora: ${downloaded}. Borrados: ${removed}.`);
