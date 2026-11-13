import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Transcript } from '@axioma/schema';
import { sentences } from './clips.ts';
import { DUB_LANGUAGES, spreadWords, translateLines } from './dub.ts';
import { llmReady } from './llm.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

/**
 * Subtítulos en otro idioma, sin doblar la voz: cada frase se traduce con la IA local y sus
 * palabras se reparten en el mismo tiempo de la frase original. Van en tiempo del video
 * fuente, así siguen bien aunque después cambies los cortes.
 */
export const subtitlesFile = (lang: string) => `subtitulos-${lang}.json`;

export async function setCaptionLanguage(dir: string, lang: string | null, onProgress?: (m: string) => void) {
  if (!lang) {
    const p = await readProject(dir);
    p.captions.language = undefined;
    return writeProject(dir, p);
  }
  const L = DUB_LANGUAGES[lang];
  if (!L) throw new Error(`Idioma no disponible: ${lang}.`);
  const file = path.join(dir, subtitlesFile(lang));
  if (!existsSync(file)) {
    if (!(await llmReady())) throw new Error('Para traducir hace falta la IA local (Ollama con qwen3). Ábrela y vuelve a intentarlo.');
    const t = await readTranscript(dir);
    if (!t?.words.length) throw new Error('Este reel no tiene voz transcrita: no hay subtítulos que traducir.');
    const lines = sentences(t);
    onProgress?.(`Traduciendo ${lines.length} frases al ${L.name}…`);
    const tr = await translateLines(lines.map((l) => l.text), lang);
    const words = lines.flatMap((l, i) => spreadWords(tr[i], l.start, Math.max(0.3, l.end - l.start)));
    await writeFile(file, JSON.stringify({ language: lang, model: 'traduccion-ia-local', words } satisfies Transcript, null, 1));
  }
  const p = await readProject(dir);
  p.captions.language = lang;
  return writeProject(dir, p);
}

/** Palabras traducidas para los subtítulos, si el proyecto las usa. */
export async function captionWords(dir: string, lang?: string): Promise<Transcript['words'] | undefined> {
  if (!lang) return undefined;
  const file = path.join(dir, subtitlesFile(lang));
  if (!existsSync(file)) return undefined;
  return (JSON.parse(await readFile(file, 'utf8')) as Transcript).words;
}

/** Borra las traducciones guardadas (si cambió lo que se dice, hay que traducir de nuevo). */
export async function clearCaptionTranslations(dir: string) {
  for (const lang of Object.keys(DUB_LANGUAGES)) await rm(path.join(dir, subtitlesFile(lang)), { force: true });
}
