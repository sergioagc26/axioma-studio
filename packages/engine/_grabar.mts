import { openBrowser } from '@remotion/renderer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT = process.argv[2];
const ONLY = process.argv[3]?.split(',');
const BASE = 'http://localhost:4747';
const PROMO = '2026-11-14-axioma-studio-claude-axioma';
const GYM = '2026-11-13-montaje-12-clips';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const b = await openBrowser('chrome', { chromiumOptions: { headless: true } as any });
const page: any = await b.newPage({ context: () => null, logLevel: 'info', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} } as any);
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto({ url: BASE + '/', timeout: 30000, options: {} } as any).catch(() => {});
const c = page._client();
const ev = async (e: string) => { const r = await c.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r?.value?.result?.value ?? r?.result?.value; };
await ev("localStorage.setItem('tema','oscuro'); localStorage.setItem('ayuda','0'); 1");

let cur = { x: 640, y: 470 };
const CURSOR = `(()=>{if(document.getElementById('cursor-demo'))return 1;const d=document.createElement('div');d.id='cursor-demo';d.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.6L10 18z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';Object.assign(d.style,{position:'fixed',left:'${'${X}'}px',top:'${'${Y}'}px',zIndex:2147483647,pointerEvents:'none',transition:'left .55s cubic-bezier(.4,.1,.2,1), top .55s cubic-bezier(.4,.1,.2,1), transform .12s',filter:'drop-shadow(0 2px 4px rgba(0,0,0,.6))'});document.body.appendChild(d);return 1})()`;
const putCursor = () => ev(CURSOR.replace('${X}', String(cur.x)).replace('${Y}', String(cur.y)));
const go = async (hash: string) => { await ev(`location.replace('/?r=${Date.now()}${hash}'); 1`); await sleep(5500); await ev(`(()=>{const st=document.createElement('style');st.textContent='';document.head.appendChild(st);[...document.querySelectorAll('button,a,span')].filter(e=>/^il-cartel$/i.test(e.textContent.trim())).forEach(e=>e.style.display='none');return 1})()`); await putCursor(); };
const rectOf = async (js: string) => { const v = await ev(`(()=>{const e=${js};if(!e)return '';e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2])})()`); return v ? JSON.parse(v) as [number, number] : null; };
const byText = (sel: string, txt: string) => `[...document.querySelectorAll('${sel}')].find(e=>e.textContent.trim().includes(${JSON.stringify(txt)}) && e.offsetParent)`;
const move = async (p: [number, number]) => { cur = { x: p[0], y: p[1] }; await ev(`(()=>{const d=document.getElementById('cursor-demo');if(d){d.style.left='${p[0]}px';d.style.top='${p[1]}px'}return 1})()`); await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await sleep(650); };
const click = async (js: string) => {
  const p = await rectOf(js); if (!p) { console.log('  no encontré', js.slice(0, 80)); return; }
  await sleep(250); await move(p);
  await ev(`(()=>{const d=document.getElementById('cursor-demo');if(d){d.style.transform='scale(.8)';setTimeout(()=>d.style.transform='',140)}return 1})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
  await sleep(500);
};
const type = async (text: string, ms = 55) => { for (const ch of text) { await c.send('Input.insertText', { text: ch }); await sleep(ms + Math.random() * 40); } };
const scroll = async (js: string, dy: number, steps = 30) => { for (let i = 0; i < steps; i++) { await ev(`(()=>{const e=${js};(e||document.scrollingElement).scrollBy(0,${dy / steps});return 1})()`); await sleep(60); } };

// Grabación continua mientras corren los pasos.
async function record(name: string, steps: () => Promise<void>) {
  if (ONLY && !ONLY.includes(name)) return;
  const dir = path.join(OUT, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  let on = true; const stamps: number[] = []; const t0 = Date.now(); let n = 0;
  const loop = (async () => { while (on) { const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); writeFileSync(path.join(dir, `f${String(n).padStart(4, '0')}.jpg`), Buffer.from(r?.value?.data ?? r?.data, 'base64')); stamps.push(Date.now() - t0); n++; } })();
  await steps(); on = false; await loop;
  const list = stamps.map((t, i) => `file 'f${String(i).padStart(4, '0')}.jpg'\nduration ${(((stamps[i + 1] ?? t + 40) - t) / 1000).toFixed(4)}`).join('\n') + `\nfile 'f${String(n - 1).padStart(4, '0')}.jpg'`;
  writeFileSync(path.join(dir, 'lista.txt'), list);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'lista.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '15', path.join(OUT, `${name}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log('grabado', name, ((Date.now() - t0) / 1000).toFixed(1) + ' s', (n / ((Date.now() - t0) / 1000)).toFixed(0) + ' fps');
}

// 1. Empezar un video nuevo.
if (!ONLY || ONLY.includes('nuevo')) { await go('#/proyectos'); await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='axioma-studio');b&&b.click();return 1})()`); await sleep(800); await ev(`(()=>{[...document.querySelectorAll('button')].filter(e=>/^il-cartel$/i.test(e.textContent.trim())).forEach(e=>e.style.display='none');return 1})()`); }
await record('nuevo', async () => {
  await sleep(800);
  await click(byText('button', 'Sin voz'));
  await click(byText('button', 'Vertical'));
  await move((await rectOf(byText('button', 'Elegir video')))!);
  await sleep(1500);
  await scroll('null', 300, 25); await sleep(1500);
});

// 2. Pegar el link de un video que te gusta: la app lo analiza.
if (!ONLY || ONLY.includes('referencia')) await go(`#/referencias?p=${PROMO}`);
await record('referencia', async () => {
  await sleep(800);
  await click(`document.querySelector('input[inputmode=url]')`);
  await type('https://vt.tiktok.com/ZSpVbjveP/', 35);
  await sleep(500);
  await click(byText('button', 'Analizar el link'));
  await sleep(9000);
});

// 3. El análisis listo: qué funciona y qué copiar.
if (!ONLY || ONLY.includes('analisis')) { await sleep(60000); await go(`#/referencias?p=${PROMO}`); }
await record('analisis', async () => { await sleep(1000); await scroll('document.querySelector(".scroll")', 1400, 70); await sleep(1200); });

// 4. El guionista: escribe la idea y la app escribe el guion.
if (!ONLY || ONLY.includes('guion')) await go(`#/guion?p=${PROMO}`);
await record('guion', async () => {
  await sleep(800);
  await click(`document.querySelector('textarea')`);
  await ev(`(()=>{const t=document.querySelector('textarea');t.select();return 1})()`);
  await type('Un reel de gimnasio con cortes al ritmo, voz que motive y subtítulos con la marca', 45);
  await sleep(400);
  await click(byText('button', 'guion'));
  await sleep(7000);
});

// 5. El guion terminado: literario y técnico.
if (!ONLY || ONLY.includes('guionlisto')) {
  for (let i = 0; i < 60; i++) { const j = await ev(`fetch('/api/jobs').then(r=>r.json()).then(a=>a.filter(j=>j.status==='running').length)`); if (!j) break; await sleep(4000); }
  await go(`#/guion?p=${PROMO}`);
}
await record('guionlisto', async () => { await sleep(1000); await scroll('document.querySelector(".scroll")', 1500, 80); await sleep(800); });

// 6. El editor con un reel terminado reproduciéndose.
if (!ONLY || ONLY.includes('editor')) await go(`#/editor?p=${GYM}`);
await record('editor', async () => {
  await sleep(600);
  await click(`document.querySelector('button[aria-label="Reproducir"]')`);
  await sleep(4000);
  const tl = await rectOf(byText('div', 'Dividir en el cursor'));
  if (tl) { await move([tl[0] + 500, tl[1] + 40]); await sleep(1200); await move([tl[0] + 900, tl[1] + 40]); }
  await sleep(4000);
  await move([1700, 400]); await sleep(3000);
});

// 7. Exportar: formatos y calidad.
await record('exportar', async () => {
  await click(byText('button', 'Exportar'));
  await sleep(4000);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); 1`);
  await sleep(500);
});

// 8. La app mide tu computador y se configura sola.
if (!ONLY || ONLY.includes('equipo')) await go('#/ajustes');
await record('equipo', async () => {
  await sleep(1000);
  const btn = await rectOf(byText('button', 'Optimizar'));
  if (btn) { await move(btn); await sleep(1500); }
  await scroll('document.querySelector(".scroll")', 900, 50); await sleep(1000);
});

await b.close({ silent: true } as any);
