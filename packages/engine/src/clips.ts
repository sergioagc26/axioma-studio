import { existsSync } from 'node:fs';
import { copyFile, link, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Transcript } from '@axioma/schema';
import { P, projectDir } from './paths.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

export interface ClipIdea {
  start: number; end: number; title: string; score: number;
  hook: number; flow: number; value: number; reasons: string[];
}

const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9 ]/g, '');
const STRONG = /\b(error(es)?|secreto|nadie|nunca|siempre|dinero|por que|truco|clave|mejor|peor|gratis|verdad|deja de|no hagas|evita|millon(es)?|mitad|doble|rapido|facil|problema|resultado|aprendi|descubri|cambio|nadie te dice)\b/;
const WEAK_START = /^(y|pero|entonces|porque|tambien|o sea|bueno|pues|ademas|igual|aja|eh|si bueno|listo|ok|vale|ya|digamos)\b/;
const GREETING = /^(hola|buenas|buenos dias|que tal|bienvenid)/;
const CLOSE = /\b(por eso|asi que|en resumen|recuerda|siguem?e|comenta|escribeme|guarda(lo)?|comparte|link|al final|la clave es|lo importante)\b/;
const STOP = new Set('a al de del el la las los lo en y o que se un una es por con para mi tu su no si me te le ya muy mas pero como cuando este esta eso esto hay era fue ser listo vamos bueno entonces cosas cosa digamos sabes saben tambien porque pues verdad aqui ahora algo todo todos nada hacer tiene tengo puede quiero'.split(' '));

/** Frases del video: cortadas por puntuación o por pausas largas. */
export function sentences(t: Transcript) {
  const out: { start: number; end: number; text: string }[] = [];
  let cur: typeof t.words = [];
  t.words.forEach((w, i) => {
    cur.push(w);
    const next = t.words[i + 1];
    if (/[.!?…]$/.test(w.text) || !next || next.start - w.end > 0.8) {
      out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((x) => x.text).join(' ') });
      cur = [];
    }
  });
  return out;
}

/** Qué tanto atrapa una frase como gancho (0–100 aprox.) y por qué. */
export function hookScore(text: string): { hook: number; reasons: string[] } {
  const first = norm(text);
  const reasons: string[] = [];
  let hook = 30;
  if (/\?$/.test(text) || /^(por que|como|que pasaria|sabias)/.test(first)) { hook += 25; reasons.push('empieza con una pregunta'); }
  if (/\d/.test(text)) { hook += 20; reasons.push('el gancho tiene una cifra'); }
  const strong = (first.match(new RegExp(STRONG, 'g')) ?? []).length;
  if (strong) { hook += Math.min(30, strong * 12); reasons.push('palabras que llaman la atención al inicio'); }
  if (text.split(/\s+/).length <= 12) hook += 10;
  if (WEAK_START.test(first)) { hook -= 30; reasons.push('arranca con un conector (le falta contexto)'); }
  if (GREETING.test(first)) { hook -= 30; reasons.push('arranca con un saludo'); }
  return { hook, reasons };
}

/**
 * Busca los mejores clips de un video largo, como Opus Clip o Vizard, pero en local y sin IA externa.
 * Puntúa cada tramo de 20–60 s con tres criterios (0–100 cada uno):
 * - Gancho: la primera frase atrapa (pregunta, cifra, palabras fuertes, corta; sin saludo ni conector).
 * - Cierre: termina en una frase completa y, mejor, con una conclusión o un llamado a la acción.
 * - Valor: densidad de palabras con significado, cifras y un tema que se repite (coherencia).
 * Devuelve los mejores sin solaparse, con los motivos del puntaje.
 */
export function findClips(t: Transcript, opts: { min?: number; max?: number; count?: number } = {}): ClipIdea[] {
  const min = opts.min ?? 20, max = opts.max ?? 60, count = opts.count ?? 5;
  const ss = sentences(t);
  const cands: ClipIdea[] = [];
  for (let i = 0; i < ss.length; i++) {
    for (let j = i; j < ss.length; j++) {
      const dur = ss[j].end - ss[i].start;
      if (dur > max) break;
      if (dur < min) continue;
      const { hook, reasons } = hookScore(ss[i].text);

      const last = ss[j];
      let flow = 40;
      if (/[.!?…]$/.test(last.text)) { flow += 30; } else reasons.push('el final queda abierto');
      if (CLOSE.test(norm(last.text))) { flow += 25; reasons.push('cierra con una conclusión o un llamado'); }
      const gaps = ss.slice(i + 1, j + 1).filter((s, k) => s.start - ss[i + k].end > 1.2).length;
      flow -= gaps * 8;

      const words = t.words.filter((w) => w.start >= ss[i].start && w.end <= last.end);
      const meaning = words.filter((w) => { const k = norm(w.text); return k.length >= 4 && !STOP.has(k); });
      const freq = new Map<string, number>();
      for (const w of meaning) { const k = norm(w.text); freq.set(k, (freq.get(k) ?? 0) + 1); }
      const topic = Math.max(0, ...freq.values());
      let value = 20 + Math.min(40, (meaning.length / dur) * 25) + Math.min(20, words.filter((w) => /\d/.test(w.text)).length * 7) + Math.min(20, (topic - 1) * 6);
      if (topic >= 3) reasons.push(`un solo tema («${[...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]}»)`);
      if (dur >= 28 && dur <= 47) { value += 8; reasons.push(`dura ${Math.round(dur)} s, el largo que mejor funciona`); }

      const c = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
      const score = Math.min(99, Math.round(0.45 * c(hook) + 0.25 * c(flow) + 0.3 * c(value)));
      const title = ss[i].text.replace(/[.,;:]+$/, '').split(/\s+/).slice(0, 9).join(' ');
      cands.push({ start: ss[i].start, end: last.end, title, score, hook: c(hook), flow: c(flow), value: c(value), reasons: [...new Set(reasons)] });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const picked: ClipIdea[] = [];
  for (const c of cands) {
    const overlaps = picked.some((p) => Math.min(p.end, c.end) - Math.max(p.start, c.start) > 0.3 * (c.end - c.start));
    if (!overlaps) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked;
}

/** Enlaza un archivo (sin duplicar espacio) o lo copia si el disco no admite enlaces. */
async function linkOrCopy(src: string, dest: string) {
  await mkdir(path.dirname(dest), { recursive: true });
  try { await link(src, dest); } catch { await copyFile(src, dest); }
}

/**
 * Crea un reel nuevo a partir de un tramo de otro proyecto: reutiliza el video, la
 * transcripción y los análisis (no se vuelve a procesar nada) y solo usa ese tramo.
 */
export async function createClipProject(dir: string, clip: { start: number; end: number; title?: string }, n = 1): Promise<{ dir: string; id: string }> {
  const src = await readProject(dir);
  let id = `${src.id}-clip-${n}`;
  let out = projectDir(src.client, id);
  for (let i = 2; existsSync(out); i++) out = projectDir(src.client, (id = `${src.id}-clip-${n}-${i}`));
  await mkdir(out, { recursive: true });
  // Archivos de la raíz (transcripción, análisis, caras, visión) y las carpetas de medios.
  for (const f of await readdir(dir, { withFileTypes: true })) {
    if (f.isFile() && f.name.endsWith('.json') && f.name !== 'project.json') await linkOrCopy(path.join(dir, f.name), path.join(out, f.name));
  }
  for (const sub of ['media', 'proxies']) {
    const base = path.join(dir, sub);
    if (!existsSync(base)) continue;
    const walk = async (rel: string): Promise<void> => {
      for (const f of await readdir(path.join(base, rel), { withFileTypes: true })) {
        const r = path.join(rel, f.name);
        if (f.isDirectory()) { if (!/recorte-tmp|thumbs/.test(f.name)) await walk(r); }
        else await linkOrCopy(path.join(base, r), path.join(out, sub, r));
      }
    };
    await walk('');
  }
  for (const sub of [P.renders, P.versions]) await mkdir(path.join(out, sub), { recursive: true });
  const now = new Date().toISOString();
  const name = `${src.name} · clip ${n}${clip.title ? ` · ${clip.title.slice(0, 40)}` : ''}`;
  await writeProject(out, { ...src, id, name, createdAt: now, updatedAt: now, clipRange: { start: clip.start, end: clip.end }, briefAppliedAt: undefined, approval: 'borrador', requests: [], scenes: src.scenes });
  return { dir: out, id };
}

/** Clips sugeridos para un proyecto. */
export async function projectClips(dir: string) {
  const t = await readTranscript(dir);
  if (!t?.words.length) return [];
  return findClips(t);
}
