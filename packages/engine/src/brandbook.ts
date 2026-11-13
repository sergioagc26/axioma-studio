import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PERSONALITIES, SECTORS, brandStyle, captionDesign, effectiveRanges, type BrandKit } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { serveFolder } from './server.ts';
import { clientDir, clientLogo, readKit } from './kit.ts';
import * as ops from './ops.ts';
import { P, slugify } from './paths.ts';

/**
 * Manual de marca del cliente, en PDF y en lenguaje sencillo: logo, colores (con sus códigos y
 * si se leen bien), tipografías, cómo se ven sus reels (con fotogramas reales) y tono de voz.
 * Sale de lo que la app ya sabe de la marca; se genera en este computador.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// --- Color: códigos y contraste (WCAG) ---
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}
export function toCmyk([r, g, b]: [number, number, number]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - R - k) / (1 - k), (1 - G - k) / (1 - k), (1 - B - k) / (1 - k), k].map((x) => Math.round(x * 100));
}
const lum = ([r, g, b]: [number, number, number]) => {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export function contrast(a: string, b: string) {
  const [x, y] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Texto sobre este color: blanco o negro, el que se lea mejor. */
const onColor = (hex: string) => (contrast(hex, '#FFFFFF') >= contrast(hex, '#000000') ? '#FFFFFF' : '#111111');

// --- Tono de voz por personalidad ---
export const VOICE: Record<string, { words: string; how: string; yes: string[]; no: string[] }> = {
  energica: { words: 'Directa · Con fuerza · Con ritmo', how: 'Frases cortas, verbos de acción y una sola idea por frase. Se habla de resultados.', yes: ['Haz esto hoy y nota el cambio.', 'Tres pasos. Cero excusas.'], no: ['Quizás podrías considerar la posibilidad de…', 'En el presente video hablaremos de…'] },
  divertida: { words: 'Ligera · Juguetona · Con humor', how: 'Se permite el chiste y la sorpresa, sin burlarse de nadie. Emojis con medida.', yes: ['Spoiler: te va a encantar.', 'Plot twist: era más fácil de lo que creías.'], no: ['Estimado cliente, le informamos…', 'Según los estándares de la industria…'] },
  elegante: { words: 'Sobria · Cuidada · Precisa', how: 'Pocas palabras y bien elegidas. Nada de mayúsculas gritadas ni signos repetidos.', yes: ['Detalles que se notan.', 'Hecho a mano, pensado para durar.'], no: ['¡¡¡OFERTÓN!!!', 'Lo más barato del mercado.'] },
  cercana: { words: 'Cálida · De tú a tú · Honesta', how: 'Se habla como con un amigo: de tú, contando experiencias propias y con preguntas.', yes: ['Te cuento lo que me pasó…', '¿Te ha pasado esto?'], no: ['La empresa informa a sus usuarios…', 'Se recomienda proceder a…'] },
  seria: { words: 'Clara · Experta · Confiable', how: 'Datos y pasos concretos, sin exagerar. Se explica el porqué de cada cosa.', yes: ['Tres datos que debes conocer antes de invertir.', 'Así funciona, paso a paso.'], no: ['Jajaja no lo vas a creer', 'Esto te va a volar la cabeza 🤯🤯'] },
  rebelde: { words: 'Provocadora · Sin filtro · Auténtica', how: 'Se rompe lo que todos dicen, con argumentos. Ganchos fuertes y opiniones claras.', yes: ['Nadie te dice esto.', 'Deja de hacer lo que hace todo el mundo.'], no: ['Como dicen todos los expertos…', 'Esperamos que este contenido sea de su agrado.'] },
};

/**
 * Imprime una página a PDF con el navegador interno de Remotion (el mismo que exporta los videos),
 * así funciona igual en Mac y en Windows sin depender de tener Chrome instalado.
 */
async function printPdf(folder: string, page: string, out: string) {
  const { openBrowser } = await import('@remotion/renderer');
  const server = await serveFolder(folder);
  const browser = await openBrowser('chrome');
  try {
    const tab = await browser.newPage({ context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} } as never);
    await tab.goto({ url: server.url(page), timeout: 60_000 });
    // Espera a que carguen las letras (Google Fonts) y las imágenes.
    await tab.evaluate((() => Promise.race([document.fonts.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])) as never);
    const res = await (tab._client() as any).send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    const data: string | undefined = res?.value?.data ?? res?.data;
    if (!data) throw new Error('El navegador no devolvió el PDF.');
    await writeFile(out, Buffer.from(data, 'base64'));
  } finally {
    await browser.close({ silent: true }).catch(() => {});
    await server.close();
  }
}

/** Fotogramas de los últimos reels del cliente (para mostrar cómo se ven). */
async function sampleFrames(client: string | undefined, tmp: string, n = 3): Promise<string[]> {
  const folder = path.basename(clientDir(client));
  const all = (await ops.listProjects()).filter((p) => path.basename(path.dirname(path.dirname(p.dir))) === folder && existsSync(path.join(p.dir, P.proxy)));
  const out: string[] = [];
  for (const p of all.slice(0, n)) {
    const sc = p.project.scenes.find((s) => s.visual === 'original') ?? p.project.scenes[0];
    const r = sc ? effectiveRanges(sc, p.project.source.duration)[0] : null;
    const t = r ? (r.start + r.end) / 2 : 1;
    const file = path.join(tmp, `foto-${out.length}.jpg`);
    try {
      await ffmpeg(['-ss', t.toFixed(2), '-i', path.join(p.dir, P.proxy), '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '3', file]);
      out.push(path.basename(file));
    } catch { /* sin fotograma: se salta */ }
  }
  return out;
}

export function brandbookHtml(kit: BrandKit, opts: { logo?: string; frames: string[]; date: string }) {
  const { primary, secondary, text } = kit.colors;
  const style = brandStyle(kit);
  const sector = SECTORS.find(([id]) => id === kit.sector)?.[1];
  const personality = PERSONALITIES.find(([id]) => id === kit.personality)?.[1];
  const voice = VOICE[kit.personality ?? ''] ?? VOICE.cercana;
  const caps = { ...kit.captions, ...style?.captions };
  const capFont = String(caps.fontFamily ?? kit.fonts.heading);
  const design = captionDesign(String(caps.design ?? 'clasico'));
  const fonts = [...new Set([kit.fonts.heading, kit.fonts.body, capFont])];
  const gf = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700;800`).join('&')}&display=swap`;
  const initials = kit.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const mark = (cls: string, bg = primary) => opts.logo
    ? `<img src="${esc(opts.logo)}" alt="Logo de ${esc(kit.name)}" class="logo ${cls}">`
    : `<div class="mono ${cls}" style="background:${bg};color:${onColor(bg)}">${esc(initials)}</div>`;
  const logo = mark('sm');
  const coverMark = mark('', onColor(primary) === '#FFFFFF' ? '#FFFFFF' : '#111111');
  const swatch = (name: string, hex: string, use: string) => {
    const rgb = hexToRgb(hex);
    const cw = contrast(hex, '#FFFFFF'), cb = contrast(hex, '#000000');
    const ok = (c: number) => (c >= 4.5 ? 'Se lee bien' : c >= 3 ? 'Solo en textos grandes' : 'No usar para texto');
    return `<div class="sw"><div class="chip" style="background:${hex};color:${onColor(hex)}">${esc(name)}</div>
      <dl><dt>HEX</dt><dd>${hex.toUpperCase()}</dd><dt>RGB</dt><dd>${rgb.join(', ')}</dd><dt>CMYK</dt><dd>${toCmyk(rgb).join(', ')}</dd></dl>
      <p class="small">${esc(use)}</p>
      <p class="small muted">Texto blanco encima: ${ok(cw)} (${cw.toFixed(1)}:1) · Texto negro: ${ok(cb)} (${cb.toFixed(1)}:1)</p></div>`;
  };
  const sample = 'Así se ve tu marca';
  const capWords = ['TU', 'MARCA', 'EN', 'VIDEO'].map((w, i) => `<span style="color:${i === 1 ? String(caps.highlightColor ?? primary) : String(caps.color ?? '#fff')}">${caps.uppercase === false ? w.toLowerCase() : w}</span>`).join(' ');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual de marca · ${esc(kit.name)}</title>
<link rel="stylesheet" href="${gf}">
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font:10.5pt/1.5 '${esc(kit.fonts.body)}',Inter,Helvetica,Arial,sans-serif;color:#18181B}
h1,h2,h3{font-family:'${esc(kit.fonts.heading)}',Montserrat,sans-serif;margin:0}h2{font-size:22pt;margin-bottom:2mm}h3{font-size:12pt;margin:5mm 0 2mm}
.page{page-break-after:always;min-height:250mm}.page:last-child{page-break-after:auto}
.kicker{font-size:8.5pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${primary === '#FFFFFF' ? '#18181B' : primary}}
.muted{color:#6B6B76}.small{font-size:9pt}p{margin:0 0 2.5mm}
.cover{display:flex;flex-direction:column;justify-content:space-between;height:250mm;padding:14mm;border-radius:6mm;background:${primary};color:${onColor(primary)}}
.cover h1{font-size:44pt;line-height:1}.cover .logo,.cover .mono{width:46mm;height:46mm}
.logo{width:40mm;height:40mm;object-fit:contain}.mono{width:40mm;height:40mm;border-radius:8mm;display:grid;place-items:center;font:800 30pt '${esc(kit.fonts.heading)}',sans-serif}
.logo.sm,.mono.sm{width:22mm;height:22mm;border-radius:5mm;font-size:16pt}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.sw .chip{height:34mm;border-radius:4mm;display:flex;align-items:flex-end;padding:3mm;font-weight:700;border:1px solid #e4e4e7}
dl{display:grid;grid-template-columns:auto 1fr;gap:0 3mm;margin:2mm 0;font-size:9pt}dt{font-weight:700}dd{margin:0;font-family:ui-monospace,Menlo,monospace}
.spec{border:1px solid #e4e4e7;border-radius:4mm;padding:5mm;margin-bottom:4mm}.spec .big{font-size:34pt;line-height:1.05}
.bgs{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.bgs>div{height:40mm;border-radius:4mm;display:grid;place-items:center;border:1px solid #e4e4e7}
.dont{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}.dont>div{border:1px solid #e4e4e7;border-radius:4mm;padding:5mm 3mm 3mm;text-align:center;font-size:8.5pt;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:3mm}
.dont .x{color:#DC2626;font-weight:700}.frames{display:flex;gap:4mm}.frame{position:relative;flex:1;aspect-ratio:9/16;border-radius:4mm;overflow:hidden;background:#111}
.frame img{width:100%;height:100%;object-fit:cover}.frame .cap{position:absolute;left:6%;right:6%;top:62%;text-align:center;font:800 15pt '${esc(capFont)}',sans-serif;text-shadow:0 0 3px #000,0 2px 6px #000}
.rule{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.yes,.no{border-radius:4mm;padding:4mm}.yes{background:#ECFDF5}.no{background:#FEF2F2}
ul{margin:0;padding-left:5mm}li{margin-bottom:1mm}table{width:100%;border-collapse:collapse;font-size:9.5pt}td{padding:2mm;border-bottom:1px solid #e4e4e7;vertical-align:top}td:first-child{font-weight:700;width:38%}
</style></head><body>
<section class="page cover">
  <div>${coverMark}</div>
  <div><div class="kicker" style="color:inherit;opacity:.8">Manual de marca</div><h1>${esc(kit.name)}</h1>
  <p style="font-size:13pt;margin-top:4mm">${[sector, personality].filter(Boolean).map((x) => esc(x!)).join(' · ') || 'Guía rápida de identidad'}</p></div>
  <p class="small" style="opacity:.8">Creado con Axioma Studio · ${esc(opts.date)}. Todo lo de este manual sale de cómo la app edita los videos de esta marca.</p>
</section>

<section class="page">
  <div class="kicker">1 · Colores</div><h2>La paleta</h2>
  <p class="muted">Tres colores bastan. Úsalos siempre con estos códigos: así la marca se reconoce en cualquier pantalla.</p>
  <div class="grid3">
    ${swatch('Principal', primary, 'Resaltar la palabra clave, botones, llamados a la acción y la barra de progreso.')}
    ${swatch('Secundario', secondary, 'Acentos, detalles, gráficos y el segundo color de los degradados.')}
    ${swatch('Texto', text, 'Letras de los subtítulos y textos sobre el video.')}
  </div>
  <h3>Proporción</h3>
  <div style="display:flex;height:12mm;border-radius:3mm;overflow:hidden;border:1px solid #e4e4e7"><div style="flex:6;background:#0B0B0F"></div><div style="flex:3;background:${primary}"></div><div style="flex:1;background:${secondary}"></div></div>
  <p class="small muted" style="margin-top:2mm">Mucho fondo neutro (el video o un tono oscuro), un poco del color principal para lo importante y una pizca del secundario.</p>
</section>

<section class="page">
  <div class="kicker">2 · Tipografías</div><h2>Las letras</h2>
  <p class="muted">Dos familias: una para títulos y otra para textos largos. Los subtítulos de los reels usan la suya.</p>
  <div class="spec"><span class="small muted">Títulos · ${esc(kit.fonts.heading)}</span><div class="big" style="font-family:'${esc(kit.fonts.heading)}';font-weight:800">${esc(sample)}</div><div style="font-family:'${esc(kit.fonts.heading)}'">ABCDEFGHIJKLMNÑOPQRSTUVWXYZ · abcdefghijklmnñopqrstuvwxyz · 0123456789</div></div>
  <div class="spec"><span class="small muted">Textos · ${esc(kit.fonts.body)}</span><p style="font-family:'${esc(kit.fonts.body)}';font-size:12pt">Esta es la letra para descripciones, carruseles y todo lo que se lee con calma. Se usa en tamaño normal y con buen espacio entre líneas.</p></div>
  <div class="spec"><span class="small muted">Subtítulos del video · ${esc(capFont)} · diseño «${esc(design.name)}»</span><div style="background:#111;border-radius:3mm;padding:6mm;text-align:center;font:800 24pt '${esc(capFont)}',sans-serif;text-shadow:0 0 3px #000">${capWords}</div></div>
</section>

<section class="page">
  <div class="kicker">3 · Logo</div><h2>El logo</h2>
  <p class="muted">${opts.logo ? 'Es la firma de la marca: se usa siempre igual.' : 'Todavía no hay un logo cargado en la app: por ahora la marca usa este monograma. Súbelo en el editor (Acabados → «Subir el logo de la marca») y vuelve a crear el manual.'}</p>
  <h3>Sobre distintos fondos</h3>
  <div class="bgs"><div style="background:#FFFFFF">${logo}</div><div style="background:#0B0B0F">${logo}</div><div style="background:${primary}">${logo}</div></div>
  <h3>Reglas</h3>
  <ul><li><b>Área de respeto:</b> deja alrededor un espacio libre igual a un cuarto del ancho del logo.</li>
  <li><b>Tamaño mínimo:</b> 24 mm en papel, 120 px en pantalla. En los reels, como marca de agua, al 13 % del ancho.</li>
  <li><b>En video:</b> arriba a la derecha, lejos de los botones de Reels y TikTok.</li></ul>
  <h3>No hacer</h3>
  <div class="dont">
    <div><div style="transform:scaleX(1.5);display:inline-block">${logo}</div><div class="x">✕ Estirarlo</div></div>
    <div><div style="transform:rotate(-18deg);display:inline-block">${logo}</div><div class="x">✕ Girarlo</div></div>
    <div><div style="filter:hue-rotate(140deg);display:inline-block">${logo}</div><div class="x">✕ Cambiarle el color</div></div>
    <div><div style="filter:drop-shadow(6px 6px 0 #f0f) blur(1px);display:inline-block">${logo}</div><div class="x">✕ Sombras y efectos</div></div>
  </div>
</section>

<section class="page">
  <div class="kicker">4 · En video</div><h2>Cómo se ven los reels</h2>
  <p class="muted">${style ? `Por su sector y su forma de ser, los reels llevan ${esc(style.why)}.` : 'Completa el sector y la personalidad de la marca (en el Brief) para que la app arme un estilo propio.'}</p>
  ${opts.frames.length ? `<div class="frames">${opts.frames.map((f) => `<div class="frame"><img src="${esc(f)}" alt=""><div class="cap">${capWords}</div></div>`).join('')}</div><p class="small muted" style="margin-top:2mm">Fotogramas de los últimos reels de la marca, con sus subtítulos.</p>` : ''}
  <h3>La receta</h3>
  <table>
    <tr><td>Subtítulos</td><td>Diseño «${esc(design.name)}», letra ${esc(capFont)}${caps.uppercase === false ? '' : ' en mayúsculas'}, ${Number(caps.wordsPerLine ?? 3)} palabras a la vez; la palabra que suena en ${String(caps.highlightColor ?? primary).toUpperCase() === primary.toUpperCase() ? 'el color principal' : `su color de resaltado (${String(caps.highlightColor).toUpperCase()})`}.</td></tr>
    ${style ? `<tr><td>Textos en pantalla</td><td>Estilo «${esc(String(style.style.textStyle ?? 'caja'))}» con la letra ${esc(String(style.style.textFont ?? kit.fonts.heading))}; entran con «${esc(String(style.style.textAnim ?? 'pop'))}».</td></tr>
    <tr><td>Imagen</td><td>Aspecto «${esc(String(style.style.look ?? 'normal'))}»${style.style.camera ? `, cámara que se ${style.style.camera === 'acercar' ? 'acerca' : 'mueve'} despacio` : ''}.</td></tr>
    <tr><td>Ritmo y efectos</td><td>${style.style.transitions ? 'Transiciones en los cambios de idea' : 'Cortes secos'}${style.style.flashes ? ', destellos en los golpes' : ''}${style.style.sfxAuto ? ' y efectos de sonido automáticos' : ', sin efectos de sonido de más'}.</td></tr>` : ''}
    <tr><td>Gancho</td><td>En el primer segundo, con la frase más fuerte y un texto de 3 a 7 palabras.</td></tr>
    <tr><td>Cierre</td><td>Un llamado a la acción claro: «Sígueme», «Guárdalo», «Escríbeme».</td></tr>
  </table>
</section>

<section class="page">
  <div class="kicker">5 · Tono de voz</div><h2>Cómo habla la marca</h2>
  <p style="font-size:14pt;font-weight:700">${esc(voice.words)}</p>
  <p>${esc(voice.how)}</p>
  <div class="rule">
    <div class="yes"><b>Así sí</b><ul>${voice.yes.map((x) => `<li>«${esc(x)}»</li>`).join('')}</ul></div>
    <div class="no"><b>Así no</b><ul>${voice.no.map((x) => `<li>«${esc(x)}»</li>`).join('')}</ul></div>
  </div>
  <h3>En resumen</h3>
  <ul><li>Los mismos tres colores y las mismas dos letras en todo.</li><li>El logo siempre igual, con espacio a su alrededor.</li><li>Cada reel con gancho en el primer segundo, subtítulos de la marca y un cierre claro.</li><li>Si algo cambia (logo, colores, tono), actualízalo en la app y vuelve a crear este manual.</li></ul>
</section>
</body></html>`;
}

/** Crea el manual de marca del cliente en PDF. Devuelve la ruta del archivo. */
/** Dónde queda el manual de marca del cliente. */
export const brandbookFile = (client: string | undefined) => path.join(clientDir(client), 'marca', 'manual-de-marca.pdf');

export async function createBrandbook(client: string | undefined): Promise<{ pdf: string; hasKit: boolean }> {
  const saved = await readKit(client);
  const kit: BrandKit = saved ?? { id: slugify(client ?? 'personal'), name: client ?? 'Mi marca', colors: { primary: '#FE2C55', secondary: '#25F4EE', text: '#FFFFFF' }, fonts: { heading: 'Montserrat', body: 'Inter' }, learned: {}, captions: {} } as BrandKit;
  const outDir = path.join(clientDir(client), 'marca');
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `axioma-manual-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const logoAbs = await clientLogo(client);
    let logo: string | undefined;
    if (logoAbs) { logo = `logo${path.extname(logoAbs)}`; await copyFile(logoAbs, path.join(tmp, logo)); }
    const frames = await sampleFrames(client, tmp);
    const html = brandbookHtml(kit, { logo, frames, date: new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) });
    const htmlFile = path.join(tmp, 'manual.html');
    await writeFile(htmlFile, html);
    const pdf = path.join(outDir, 'manual-de-marca.pdf');
    await rm(pdf, { force: true });
    await printPdf(tmp, 'manual.html', pdf);
    if (!existsSync(pdf)) throw new Error('No se pudo crear el PDF del manual.');
    return { pdf, hasKit: Boolean(saved) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
