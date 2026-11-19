import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE } from './paths.ts';

/**
 * Configuración de la app (no de un proyecto): qué IA usar, la voz por defecto y cómo exportar por
 * defecto. Vive en workspace/ajustes.json. Sin valor, la app elige sola (lo de siempre).
 */
export interface AppSettings {
  /** Modelo de texto de Ollama (vacío = el mejor que quepa en la memoria). */
  llm?: string;
  /** Modelo que ve imágenes (vacío = el mejor instalado). */
  vision?: string;
  /** Voz por defecto cuando no se elige otra: proveedor y voz. */
  voz?: { proveedor?: 'elevenlabs' | 'fish' | 'qwen' | 'piper' | 'sistema'; voz?: string };
  /** Exportación por defecto de los proyectos nuevos. */
  exportar?: { calidad?: 'maxima' | 'alta' | 'ligera'; lufs?: -14 | -16; carpeta?: string };
  /** Forma por defecto de los videos nuevos. */
  forma?: 'vertical' | 'horizontal' | 'cuadrado';
  /** Modelo de transcripción (Whisper): base es rápido, small el normal, medium el más preciso. */
  whisper?: 'base' | 'small' | 'medium';
  /** Procesos a la vez al exportar (más = más rápido, pero más memoria). */
  renderProcesos?: number;
  /** Cuándo se optimizó para este computador (y para cuál). */
  optimizado?: { at: string; equipo: string };
}

const FILE = () => path.join(WORKSPACE, 'ajustes.json');
let cache: AppSettings | null = null;

/** Se lee una vez (síncrono: lo usan funciones que no esperan, como la elección del modelo). */
export function settings(): AppSettings {
  if (cache) return cache;
  try { cache = existsSync(FILE()) ? (JSON.parse(readFileSync(FILE(), 'utf8')) as AppSettings) : {}; } catch { cache = {}; }
  return cache;
}

const QUALITIES = ['maxima', 'alta', 'ligera'];
const PROVIDERS = ['elevenlabs', 'fish', 'qwen', 'piper', 'sistema'];
const SHAPES = ['vertical', 'horizontal', 'cuadrado'];

/** Guarda solo lo que viene (y lo válido); un campo vacío vuelve a «que decida la app». */
export async function saveSettings(patch: Partial<AppSettings>, guard?: (model: string) => boolean): Promise<AppSettings> {
  const cur = { ...settings() };
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined);
  if ('llm' in patch) cur.llm = clean(patch.llm);
  if (cur.llm && guard && !guard(cur.llm)) throw new Error('Ese modelo es demasiado grande para la memoria de este computador: lo dejaría colgado. Elige uno más pequeño.');
  if ('vision' in patch) cur.vision = clean(patch.vision);
  if ('voz' in patch) {
    const v = patch.voz ?? {};
    cur.voz = { proveedor: PROVIDERS.includes(String(v.proveedor)) ? v.proveedor : undefined, voz: clean(v.voz) };
    if (!cur.voz.proveedor && !cur.voz.voz) delete cur.voz;
  }
  if ('exportar' in patch) {
    const e = patch.exportar ?? {};
    cur.exportar = {
      calidad: QUALITIES.includes(String(e.calidad)) ? e.calidad : undefined,
      lufs: e.lufs === -14 || e.lufs === -16 ? e.lufs : undefined,
      carpeta: clean(e.carpeta),
    };
  }
  if ('forma' in patch) cur.forma = SHAPES.includes(String(patch.forma)) ? patch.forma : undefined;
  if ('whisper' in patch) cur.whisper = ['base', 'small', 'medium'].includes(String(patch.whisper)) ? patch.whisper : undefined;
  if ('renderProcesos' in patch) { const n = Math.round(Number(patch.renderProcesos)); cur.renderProcesos = n >= 1 && n <= 16 ? n : undefined; }
  if ('optimizado' in patch) cur.optimizado = patch.optimizado;
  await mkdir(WORKSPACE, { recursive: true });
  await writeFile(FILE(), JSON.stringify(cur, null, 2));
  cache = cur;
  return cur;
}
