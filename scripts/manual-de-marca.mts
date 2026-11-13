/**
 * Genera el manual de marca de Axioma Studio (docs/marca/manual-de-marca.html y .pdf) a partir de
 * los colores de la app y de la línea de iconos real (packages/studio/src/icons.ts): si se agrega
 * o cambia un icono, basta volver a correr `npx tsx scripts/manual-de-marca.mts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from '../packages/studio/src/icons.ts';
import { printPdf } from '../packages/engine/src/brandbook.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'marca');
mkdirSync(out, { recursive: true });

const svg = (d: string, size = 28, extra = '') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const GROUPS: [string, string[]][] = [
  ['Navegación', ['brief', 'result', 'editor', 'more', 'text', 'storyboard', 'variants', 'audio', 'image', 'reference', 'calendar', 'back', 'home']],
  ['Acciones', ['sparkle', 'export', 'upload', 'publish', 'play', 'pause', 'prev', 'next', 'undo', 'redo', 'refresh', 'update', 'plus', 'close', 'check', 'edit', 'trash', 'copy', 'open', 'search', 'save', 'folder', 'scissors', 'wand']],
  ['Sistema', ['help', 'sun', 'moon', 'key', 'cloud', 'devices', 'link', 'settings', 'globe', 'wifi', 'warning', 'eye', 'clock', 'bulb']],
  ['Edición', ['captions', 'title', 'chart', 'film', 'transition', 'music', 'sound', 'mute', 'tag', 'color', 'palette', 'camera', 'layers', 'speech', 'mic', 'frame', 'finish']],
  ['Brief', ['phone', 'story', 'megaphone', 'message', 'bookmark', 'share', 'follow', 'users', 'heart', 'cart', 'briefcase', 'family', 'bolt', 'rhythm', 'calm', 'flame', 'clapper', 'target', 'book', 'rocket', 'smile', 'diamond', 'timer', 'infinity', 'letters', 'hand', 'pin']],
  ['Redes', ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin']],
];
const icons = ICONS as Record<string, string>;
const listed = new Set(GROUPS.flatMap(([, l]) => l));
const rest = Object.keys(icons).filter((n) => !listed.has(n));
if (rest.length) GROUPS.push(['Otros', rest]);
const total = Object.keys(icons).length;

const COLORS: [string, string, string, string][] = [
  ['Rosa Axioma', '#FE2C55', 'Acción principal y selección', '#000'],
  ['Cian Axioma', '#25F4EE', 'Acento, foco y lo que propone la IA', '#000'],
  ['Negro fondo', '#0A0A0B', 'Fondo de la app (tema oscuro)', '#fff'],
  ['Panel', '#131315', 'Tarjetas y barras', '#fff'],
  ['Línea', '#2A2A30', 'Bordes y separadores', '#fff'],
  ['Texto', '#F4F4F5', 'Texto principal', '#000'],
  ['Texto suave', '#A1A1AA', 'Texto secundario', '#000'],
  ['Rosa claro', '#D91E45', 'Rosa en tema claro (contraste AA)', '#fff'],
];

const page = (n: number, title: string, body: string) => `<section class="page"><header><span class="logo"></span><strong>Axioma Studio</strong><span class="muted">Manual de marca · ${String(n).padStart(2, '0')}</span></header><h2>${title}</h2>${body}</section>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Axioma Studio · Manual de marca</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #0A0A0B; color: #F4F4F5; font: 12.5px/1.5 Inter, system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 16mm 16mm 14mm; page-break-after: always; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
header { display: flex; align-items: center; gap: 10px; font-size: 11px; }
header .muted { margin-left: auto; }
h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; margin: 0; letter-spacing: -.01em; }
h1 { font-size: 54px; line-height: 1.02; } h2 { font-size: 30px; margin-top: 6px; } h3 { font-size: 15px; }
p { margin: 0; max-width: 150mm; }
.muted { color: #A1A1AA; }
.logo { display: inline-block; width: 22px; height: 22px; border-radius: 7px; background: #FE2C55; box-shadow: 3px 3px 0 #25F4EE; }
.logo.big { width: 120px; height: 120px; border-radius: 36px; box-shadow: 14px 14px 0 #25F4EE; }
.row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.card { background: #131315; border: 1px solid #2A2A30; border-radius: 16px; padding: 16px; }
.grid { display: grid; gap: 10px; }
.sw { border-radius: 14px; padding: 14px; min-height: 86px; display: flex; flex-direction: column; justify-content: flex-end; font-size: 11px; }
.sw b { font-size: 13px; }
.ic { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 2px 7px; border: 1px solid #2A2A30; border-radius: 10px; }
.ic span { color: #A1A1AA; font-size: 8.5px; }
.rule { display: flex; gap: 12px; align-items: flex-start; }
.rule svg { flex: none; }
.construct { position: relative; width: 240px; height: 240px; border-radius: 16px; background: #131315; border: 1px solid #2A2A30;
  background-image: linear-gradient(#2A2A30 1px, transparent 1px), linear-gradient(90deg, #2A2A30 1px, transparent 1px); background-size: 10px 10px; }
.construct .safe { position: absolute; inset: 20px; border: 1px dashed #25F4EE; border-radius: 4px; }
.construct svg { position: absolute; inset: 0; }
.do { border-left: 3px solid #25F4EE; padding-left: 12px; } .dont { border-left: 3px solid #FE2C55; padding-left: 12px; }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 999px; font-weight: 600; border: 1px solid #2A2A30; }
.btn.primary { background: #FE2C55; color: #000; border: 0; }
.chip { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 13px; border-radius: 999px; border: 1px solid #2A2A30; font-weight: 500; }
.chip.on { border: 2px solid #FE2C55; background: rgba(254,44,85,.14); font-weight: 700; }
</style></head><body>

<section class="page" style="justify-content:space-between">
  <header><span class="logo"></span><strong>Axioma Studio</strong><span class="muted">Manual de marca · 2026</span></header>
  <div style="display:flex;flex-direction:column;gap:28px">
    <span class="logo big"></span>
    <h1>Axioma<br>Studio</h1>
    <p style="font-size:16px" class="muted">Manual de marca y línea de iconos de la app que edita tus reels sola.</p>
  </div>
  <div class="row muted" style="font-size:11px"><span>Logo</span><span>·</span><span>Color</span><span>·</span><span>Tipografía</span><span>·</span><span>Iconos (${total})</span><span>·</span><span>Uso</span></div>
</section>

${page(1, 'La marca en una frase', `
<p style="font-size:17px">Subes tu video, respondes unas preguntas y sale editado. Axioma Studio es <b>directa, clara y con energía</b>: se entiende sin leer instrucciones y nunca hace sentir al cliente que no sabe.</p>
<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:8px">
  <div class="card"><h3>Simple</h3><p class="muted">Una acción principal por pantalla. Lo avanzado se guarda, no se esconde.</p></div>
  <div class="card"><h3>Visual</h3><p class="muted">Se elige tocando: fichas, miniaturas reales del video e iconos. El texto acompaña, no manda.</p></div>
  <div class="card"><h3>Honesta</h3><p class="muted">Dice qué hizo y qué no. No inventa cifras ni promesas.</p></div>
</div>
<h3 style="margin-top:14px">Cómo habla</h3>
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="do"><b>Así sí</b><p class="muted">«Tu video está listo.» · «Cuéntame cómo lo quieres.» · «Esto entendí: …» · «¿Cambiamos algo?»</p></div>
  <div class="dont"><b>Así no</b><p class="muted">«Render finalizado con éxito.» · «Configure los parámetros del preset.» · Mayúsculas sostenidas, signos de admiración en fila, emojis.</p></div>
</div>`)}

${page(2, 'Logo', `
<div class="row" style="gap:28px">
  <div class="card" style="display:grid;place-items:center;width:200px;height:200px"><span class="logo big" style="width:96px;height:96px;border-radius:28px;box-shadow:11px 11px 0 #25F4EE"></span></div>
  <div style="flex:1;display:flex;flex-direction:column;gap:10px">
    <p>El símbolo es un <b>cuadro rosa con sombra cian desplazada</b>: un fotograma de video con su eco, la toma original y la editada. Esquina redondeada al 30 % del lado; la sombra se mueve 12 % hacia abajo y a la derecha, sin desenfoque.</p>
    <p class="muted">El nombre va en Space Grotesk Bold, a la derecha del símbolo, con una separación igual a un tercio del símbolo.</p>
  </div>
</div>
<div class="grid" style="grid-template-columns:repeat(3,1fr)">
  <div class="card row" style="background:#0A0A0B"><span class="logo"></span><strong style="font-family:'Space Grotesk'">Axioma Studio</strong></div>
  <div class="card row" style="background:#fff;color:#141416"><span class="logo" style="background:#D91E45"></span><strong style="font-family:'Space Grotesk'">Axioma Studio</strong></div>
  <div class="card row" style="background:#FE2C55;color:#000"><span class="logo" style="background:#000;box-shadow:3px 3px 0 #25F4EE"></span><strong style="font-family:'Space Grotesk'">Axioma Studio</strong></div>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="do"><b>Así sí</b><p class="muted">Sobre fondo negro, blanco o rosa plano. Tamaño mínimo del símbolo: 16 px. Aire libre alrededor: la mitad del símbolo.</p></div>
  <div class="dont"><b>Así no</b><p class="muted">No girarlo, no cambiar la dirección de la sombra, no ponerle degradados ni contornos, no usar la sombra en otro color que el cian.</p></div>
</div>`)}

${page(3, 'Color', `
<p>Dos colores de marca y una escala neutra. El <b>rosa</b> es la acción: solo un botón rosa por pantalla. El <b>cian</b> es la ayuda de la IA y el foco del teclado; nunca es un botón principal.</p>
<div class="grid" style="grid-template-columns:repeat(4,1fr)">
${COLORS.map(([n, hex, use, fg]) => `<div class="sw" style="background:${hex};color:${fg};${hex === '#0A0A0B' || hex === '#131315' ? 'border:1px solid #2A2A30;' : ''}"><b>${n}</b><span>${hex}</span><span style="opacity:.75">${use}</span></div>`).join('')}
</div>
<h3 style="margin-top:10px">Proporción</h3>
<div style="display:flex;height:34px;border-radius:10px;overflow:hidden;border:1px solid #2A2A30"><div style="flex:70;background:#0A0A0B"></div><div style="flex:18;background:#1C1C20"></div><div style="flex:8;background:#FE2C55"></div><div style="flex:4;background:#25F4EE"></div></div>
<p class="muted">70 % fondo · 18 % paneles · 8 % rosa · 4 % cian. Si una pantalla se ve rosa, sobra rosa.</p>
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="do"><b>Así sí</b><p class="muted">Texto negro sobre rosa y sobre cian. Seleccionado = borde rosa de 2 px + fondo rosa al 14 %.</p></div>
  <div class="dont"><b>Así no</b><p class="muted">Texto blanco sobre rosa o cian (no se lee). Rosa y cian juntos en el mismo botón. Colores nuevos «para variar».</p></div>
</div>`)}

${page(4, 'Tipografía', `
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="card"><span class="muted">Títulos</span><div style="font:700 44px/1.05 'Space Grotesk'">Space Grotesk</div><p class="muted">Bold 700 · interletra −1 %. Títulos de pantalla, cifras grandes y el nombre de la marca.</p></div>
  <div class="card"><span class="muted">Texto e interfaz</span><div style="font:600 44px/1.05 Inter">Inter</div><p class="muted">400 texto · 500 fichas · 600 botones · 700 seleccionado. Todo lo que se lee o se toca.</p></div>
</div>
<div class="card" style="display:flex;flex-direction:column;gap:8px">
  <div style="font:700 26px 'Space Grotesk'">Cuéntame cómo lo quieres <span class="muted" style="font:400 11px Inter">— título de pantalla · 26</span></div>
  <div style="font:700 17px 'Space Grotesk'">¿Qué quieres que haga quien lo vea? <span class="muted" style="font:400 11px Inter">— pregunta · 17</span></div>
  <div style="font:400 14px Inter">La app corta, pone textos, subtítulos, música y efectos de sonido. <span class="muted" style="font-size:11px">— texto · 14</span></div>
  <div style="font:400 12px Inter" class="muted">Copia su ritmo, letras y textos. Nunca su contenido. — ayuda · 12</div>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="do"><b>Así sí</b><p class="muted">Frases cortas, en minúsculas con mayúscula inicial. Un título por pantalla. Números con su unidad: «25 s».</p></div>
  <div class="dont"><b>Así no</b><p class="muted">Párrafos de explicación a la vista (van en la ayuda). Más de dos tamaños de letra en una misma tarjeta. Otra fuente en la interfaz.</p></div>
</div>`)}

${page(5, 'Línea de iconos · cómo se dibujan', `
<div class="row" style="align-items:flex-start;gap:22px">
  <div class="construct"><div class="safe"></div>${svg(icons.result, 240, 'style="color:#F4F4F5"')}</div>
  <div style="flex:1;display:flex;flex-direction:column;gap:9px">
    <div class="rule">${svg(icons.frame, 22)}<p><b>Retícula 24 × 24.</b> El dibujo vive en el área de 20 × 20 (línea cian); quedan 2 de margen por lado.</p></div>
    <div class="rule">${svg(icons.edit, 22)}<p><b>Solo trazo, 1,75 de grosor.</b> Extremos y uniones redondeados. Sin rellenos, sin doble grosor.</p></div>
    <div class="rule">${svg(icons.storyboard, 22)}<p><b>Formas simples.</b> Rectángulos con esquina de 2 a 3, círculos completos y diagonales a 45°.</p></div>
    <div class="rule">${svg(icons.color, 22)}<p><b>Un solo color:</b> el del texto que acompaña. El rosa lo pone el estado (seleccionado, acción principal), nunca el dibujo.</p></div>
    <div class="rule">${svg(icons.bulb, 22)}<p><b>Una idea por icono.</b> Debe reconocerse a 16 px. Si necesita una etiqueta para entenderse, la etiqueta va al lado.</p></div>
  </div>
</div>
<h3>Tamaños</h3>
<div class="row" style="gap:26px">${[14, 16, 20, 24, 32, 44].map((s) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">${svg(icons.sparkle, s)}<span class="muted" style="font-size:10px">${s}</span></div>`).join('')}
  <p class="muted" style="flex:1">En botones y fichas: 1,15 veces el tamaño de la letra, 6 px a la izquierda del texto. Solos (barra de herramientas): 18 px dentro de un botón de 36.</p></div>
<h3>En uso</h3>
<div class="row">
  <span class="btn primary">${svg(icons.sparkle, 18)}Editar mi video</span>
  <span class="btn">${svg(icons.export, 18)}Descargar</span>
  <span class="chip on">${svg(icons.share, 16)}Compartirlo</span>
  <span class="chip">${svg(icons.bookmark, 16)}Guardarlo</span>
  <span class="chip">${svg(icons.music, 16)}Otra canción</span>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
  <div class="do"><b>Así sí</b><p class="muted">Icono + palabra en acciones. Icono solo únicamente en acciones universales (deshacer, cerrar, reproducir) y con texto de ayuda al pasar el cursor.</p></div>
  <div class="dont"><b>Así no</b><p class="muted">Emojis en la interfaz. Iconos de otras familias. Iconos rellenos, con sombra o de dos colores. Estirarlos o cambiarles el grosor.</p></div>
</div>`)}

${(() => {
  // Catálogo: se reparte en páginas de hasta 5 grupos para que nada se corte.
  const pages: string[] = [];
  let buf: string[] = []; let rows = 0; let n = 6;
  const flush = () => { if (buf.length) { pages.push(page(n++, `Línea de iconos · catálogo (${total})`, buf.join(''))); buf = []; rows = 0; } };
  for (const [name, list] of GROUPS) {
    const need = Math.ceil(list.length / 10) + 0.6;
    if (rows + need > 13.5) flush();
    buf.push(`<h3 style="margin-top:6px">${name} <span class="muted" style="font:400 11px Inter">· ${list.length}</span></h3><div class="grid" style="grid-template-columns:repeat(10,1fr);gap:6px">${list.map((k) => `<div class="ic">${svg(icons[k], 26)}<span>${k}</span></div>`).join('')}</div>`);
    rows += need;
  }
  flush();
  return pages.join('');
})()}

</body></html>`;

writeFileSync(path.join(out, 'manual-de-marca.html'), html);
await printPdf(out, 'manual-de-marca.html', path.join(out, 'manual-de-marca.pdf'));
console.log(`Manual de marca: ${total} iconos → docs/marca/manual-de-marca.pdf`);
