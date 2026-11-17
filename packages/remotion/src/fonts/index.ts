import { continueRender, delayRender } from 'remotion';
import { FACES } from './manifest.ts';

export { FONT_SPECS } from './spec.ts';

/** Familias que ya se pidieron, por documento (el Player de Studio puede usar otro). */
const loaded = new WeakMap<Document, Set<string>>();

/**
 * Carga una tipografía desde los archivos de la app (sin internet) y devuelve su nombre para
 * usarlo en fontFamily. El render espera a que esté lista. Si no es una de la lista, devuelve
 * el nombre tal cual (el navegador usa la del sistema).
 */
export function loadLocalFont(family: string): string {
  const faces = FACES[family];
  if (!faces || typeof FontFace === 'undefined' || typeof document === 'undefined') return family;
  const done = loaded.get(document) ?? new Set<string>();
  loaded.set(document, done);
  if (done.has(family)) return family;
  done.add(family);
  const handle = delayRender(`Cargando la letra ${family}`);
  Promise.all(faces.map((f) => {
    const face = new FontFace(family, `url(${f.src}) format('woff2')`, { style: f.style, weight: f.weight, unicodeRange: f.unicodeRange || undefined });
    document.fonts.add(face);
    return face.load();
  }))
    .catch((e) => console.error(`No se pudo cargar la letra ${family}:`, e))
    .finally(() => continueRender(handle));
  return family;
}
