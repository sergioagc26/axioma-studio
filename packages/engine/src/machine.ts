import { statfsSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './exec.ts';
import { WORKSPACE } from './paths.ts';

/**
 * Qué computador es: procesador, memoria, tarjeta de video y disco. Con eso la app se configura
 * sola (qué IA cabe, qué voz, qué transcripción, cuántos procesos al exportar) y dice si llega al
 * mínimo para funcionar. Funciona en Mac, Windows y Linux; lo que no se pueda leer queda vacío.
 */
export interface Gpu { name: string; vendor: 'apple' | 'nvidia' | 'amd' | 'intel' | 'otra'; vramGb?: number; cores?: number }
export interface Machine {
  os: string; osVersion: string; arch: string;
  model?: string;
  cpu: string; cores: number; performanceCores?: number; efficiencyCores?: number;
  ramGb: number;
  /** En Apple Silicon la tarjeta de video usa la misma memoria (memoria unificada). */
  unifiedMemory: boolean;
  gpus: Gpu[];
  /** Con qué acelera la IA: Metal (Mac), CUDA (NVIDIA) o solo el procesador. */
  accel: 'metal' | 'cuda' | 'cpu';
  diskFreeGb: number;
}

const tryRun = async (bin: string, args: string[]) => { try { return (await run(bin, args, { quiet: true })).stdout; } catch { return ''; } };
const vendorOf = (name: string): Gpu['vendor'] => (/apple/i.test(name) ? 'apple' : /nvidia|geforce|rtx|gtx|quadro/i.test(name) ? 'nvidia' : /amd|radeon/i.test(name) ? 'amd' : /intel|iris|uhd/i.test(name) ? 'intel' : 'otra');

let cached: Machine | null = null;
/** Lo último que se detectó (sin esperar): lo usan funciones que eligen modelos al vuelo. */
export const machineSnapshot = () => cached;

export async function detectMachine(force = false): Promise<Machine> {
  if (cached && !force) return cached;
  const plat = process.platform;
  const ramGb = +(os.totalmem() / 1024 ** 3).toFixed(1);
  let cpu = os.cpus()[0]?.model?.trim() || 'desconocido';
  let cores = os.cpus().length || 4;
  let performanceCores: number | undefined, efficiencyCores: number | undefined, model: string | undefined;
  let osVersion = os.release();
  const gpus: Gpu[] = [];

  if (plat === 'darwin') {
    const [brand, hwModel, p0, p1, ver, disp] = await Promise.all([
      tryRun('sysctl', ['-n', 'machdep.cpu.brand_string']), tryRun('sysctl', ['-n', 'hw.model']),
      tryRun('sysctl', ['-n', 'hw.perflevel0.physicalcpu']), tryRun('sysctl', ['-n', 'hw.perflevel1.physicalcpu']),
      tryRun('sw_vers', ['-productVersion']), tryRun('system_profiler', ['SPDisplaysDataType', '-json']),
    ]);
    cpu = brand.trim() || cpu; model = hwModel.trim() || undefined; osVersion = ver.trim() || osVersion;
    performanceCores = Number(p0) || undefined; efficiencyCores = Number(p1) || undefined;
    try {
      for (const g of (JSON.parse(disp).SPDisplaysDataType ?? []) as Record<string, string>[]) {
        const name = g.sppci_model ?? g._name ?? 'GPU';
        const vram = /([\d.]+)\s*GB/i.exec(g.spdisplays_vram ?? g.spdisplays_vram_shared ?? '')?.[1];
        gpus.push({ name, vendor: vendorOf(name), vramGb: vram ? Number(vram) : undefined, cores: Number(g.sppci_cores) || undefined });
      }
    } catch { /* sin datos de video */ }
  } else if (plat === 'win32') {
    const ps = (cmd: string) => tryRun('powershell', ['-NoProfile', '-Command', cmd]);
    const [proc, vids, ver] = await Promise.all([
      ps('(Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores | ConvertTo-Json -Compress)'),
      ps('(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress)'),
      ps('(Get-CimInstance Win32_OperatingSystem).Caption'),
    ]);
    try { const p = JSON.parse(proc); cpu = p.Name?.trim() || cpu; cores = Number(p.NumberOfCores) || cores; } catch { /* nada */ }
    try {
      const list = JSON.parse(vids); for (const v of Array.isArray(list) ? list : [list]) {
        // AdapterRAM se queda en 4 GB como máximo: el dato bueno de NVIDIA sale de nvidia-smi (abajo).
        gpus.push({ name: v.Name, vendor: vendorOf(v.Name), vramGb: v.AdapterRAM ? +(v.AdapterRAM / 1024 ** 3).toFixed(1) : undefined });
      }
    } catch { /* nada */ }
    osVersion = ver.trim() || osVersion;
  } else {
    const lspci = await tryRun('sh', ['-c', 'lspci 2>/dev/null | grep -Ei "vga|3d|display"']);
    for (const l of lspci.split('\n').filter(Boolean)) { const name = l.replace(/^.*?:\s*/, '').replace(/^.*?:\s*/, ''); gpus.push({ name, vendor: vendorOf(name) }); }
  }
  // NVIDIA: la memoria real de la tarjeta (sirve para elegir modelos de IA más grandes).
  const smi = await tryRun('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  for (const l of smi.split('\n').filter(Boolean)) {
    const [name, mem] = l.split(',').map((x) => x.trim());
    const known = gpus.find((g) => g.vendor === 'nvidia');
    if (known) { known.name = name; known.vramGb = +(Number(mem) / 1024).toFixed(1); } else gpus.push({ name, vendor: 'nvidia', vramGb: +(Number(mem) / 1024).toFixed(1) });
  }
  const apple = plat === 'darwin' && (os.arch() === 'arm64' || gpus.some((g) => g.vendor === 'apple'));
  const target = existsSync(WORKSPACE) ? WORKSPACE : path.dirname(WORKSPACE);
  let diskFreeGb = 0;
  try { const fs = statfsSync(target); diskFreeGb = Math.round((fs.bavail * fs.bsize) / 1024 ** 3); } catch { /* nada */ }
  cached = {
    os: plat === 'darwin' ? 'macOS' : plat === 'win32' ? 'Windows' : 'Linux', osVersion, arch: os.arch(), model,
    cpu, cores, performanceCores, efficiencyCores, ramGb, unifiedMemory: apple, gpus,
    accel: apple ? 'metal' : gpus.some((g) => g.vendor === 'nvidia' && (g.vramGb ?? 0) >= 4) ? 'cuda' : 'cpu',
    diskFreeGb,
  };
  return cached;
}

/** Nivel del equipo y la configuración que le sienta mejor. */
export interface Plan {
  nivel: 'insuficiente' | 'basico' | 'medio' | 'alto' | 'muy alto';
  /** Llega al mínimo para funcionar. */
  ok: boolean;
  /** Memoria que la IA puede usar (GB): la de la tarjeta NVIDIA o una parte de la RAM. */
  aiMemGb: number;
  llm: string; vision: string | null;
  whisper: 'base' | 'small' | 'medium';
  voz: 'qwen' | 'sistema';
  renderProcesos: number;
  uhd: boolean;
  /** Lo que se limita en este equipo (y por qué). */
  limites: string[];
  /** Por qué se eligió cada cosa, en una línea. */
  razones: string[];
}

/** Requisitos para mostrar al usuario. */
export const REQUISITOS = {
  minimo: { ramGb: 8, cores: 4, discoGb: 20, texto: '8 GB de RAM, procesador de 4 núcleos, 20 GB libres, macOS 13 o Windows 10 de 64 bits. Edita, subtitula y exporta en 1080p; la IA local va con modelos pequeños y la voz es la del computador.' },
  recomendado: { ramGb: 16, cores: 8, discoGb: 50, texto: '16 GB de RAM, 8 núcleos, Apple M1 o superior, o una tarjeta NVIDIA de 8 GB; 50 GB libres. Todo funciona: IA local mediana, voz IA natural, mirar las tomas y 4K.' },
  ideal: { ramGb: 32, cores: 12, discoGb: 200, texto: '32 GB de RAM o más, Apple Pro/Max o NVIDIA de 12 GB o más. IA local grande (escribe mejor), transcripción más precisa y exportaciones más rápidas.' },
} as const;

/** Elige la configuración según el equipo. `installed` son los modelos de IA ya descargados. */
export function planFor(m: Machine, installed: string[] = []): Plan {
  const nvidia = m.gpus.filter((g) => g.vendor === 'nvidia').reduce((a, g) => Math.max(a, g.vramGb ?? 0), 0);
  // Memoria para la IA: en Apple, la unificada menos lo que necesitan el sistema y el render; con
  // NVIDIA, la de la tarjeta; si no, una parte de la RAM (corre en el procesador: más lenta).
  const aiMemGb = m.unifiedMemory ? Math.max(0, m.ramGb - 8) : nvidia >= 4 ? nvidia : Math.max(0, m.ramGb * 0.45);
  // Un modelo cuantizado (q4) ocupa ~0,65 GB por cada mil millones de parámetros, más el contexto.
  const maxB = aiMemGb / 0.75;
  const llm = maxB >= 14 ? 'qwen3:14b' : maxB >= 8 ? 'qwen3:8b' : maxB >= 4 ? 'qwen3:4b' : 'qwen3:1.7b';
  const vision = maxB >= 8 ? 'qwen3-vl:8b' : maxB >= 4 ? 'qwen3-vl:4b' : null;
  const fast = m.accel !== 'cpu';
  const whisper: Plan['whisper'] = m.ramGb >= 24 && fast ? 'medium' : m.ramGb >= 8 ? 'small' : 'base';
  // La voz IA local (Qwen3-TTS 1,7B) necesita ~6 GB y aceleración; sin eso tarda demasiado.
  const voz: Plan['voz'] = (m.unifiedMemory && m.ramGb >= 16) || nvidia >= 8 ? 'qwen' : 'sistema';
  const renderProcesos = Math.max(1, Math.min(8, Math.floor(m.cores / 2), Math.floor(m.ramGb / 4)));
  // 4K: 16 GB y 8 núcleos (o un Apple Silicon de 6 o más, que exporta 4K sin problema).
  const uhd = m.ramGb >= 15.5 && (m.cores >= 8 || (m.unifiedMemory && m.cores >= 6));
  const ok = m.ramGb >= REQUISITOS.minimo.ramGb - 0.5 && m.cores >= REQUISITOS.minimo.cores && m.diskFreeGb >= REQUISITOS.minimo.discoGb;
  const nivel: Plan['nivel'] = !ok ? 'insuficiente' : m.ramGb >= 32 && (m.unifiedMemory || nvidia >= 12) ? 'muy alto' : m.ramGb >= 16 && (fast || m.cores >= 8) ? (m.ramGb >= 24 ? 'alto' : 'medio') : 'basico';
  const limites: string[] = [];
  if (m.ramGb < REQUISITOS.minimo.ramGb - 0.5) limites.push(`Tiene ${m.ramGb} GB de RAM y el mínimo es ${REQUISITOS.minimo.ramGb} GB: exportar puede fallar por falta de memoria.`);
  if (m.cores < REQUISITOS.minimo.cores) limites.push(`Tiene ${m.cores} núcleos y el mínimo es ${REQUISITOS.minimo.cores}: todo irá lento.`);
  if (m.diskFreeGb < REQUISITOS.minimo.discoGb) limites.push(`Quedan ${m.diskFreeGb} GB libres y se necesitan al menos ${REQUISITOS.minimo.discoGb} GB.`);
  if (!fast) limites.push('Sin aceleración para IA (ni Apple Silicon ni NVIDIA): la IA local y la voz IA corren en el procesador y tardan bastante.');
  if (voz === 'sistema') limites.push('La voz IA natural local no cabe bien: se usa la voz del computador (o ElevenLabs con su clave).');
  if (!vision) limites.push('No cabe la IA que mira las tomas: la sincronía usa el modelo CLIP, más liviano y menos preciso.');
  if (!uhd) limites.push('Sin 4K: exportar en 4K necesita 16 GB de RAM y 8 núcleos (6 en Apple Silicon).');
  if (maxB < 8) limites.push('La IA local será pequeña: los guiones y ganchos salen más simples (Claude, si lo conectas, escribe mejor).');
  const razones = [
    `IA para escribir: ${llm}, porque hay unos ${aiMemGb.toFixed(0)} GB para la IA${m.unifiedMemory ? ' (memoria unificada de Apple)' : nvidia >= 4 ? ` (tarjeta NVIDIA de ${nvidia} GB)` : ' (corre en el procesador)'}.`,
    vision ? `IA que mira las tomas: ${vision}.` : 'Sin IA de visión: no cabe junto a lo demás.',
    `Transcripción: Whisper ${whisper}${whisper === 'medium' ? ' (más precisa)' : whisper === 'base' ? ' (más rápida, menos precisa)' : ''}.`,
    `Voz por defecto: ${voz === 'qwen' ? 'voz IA local (natural)' : 'la del computador'}.`,
    `Exportar con ${renderProcesos} proceso${renderProcesos === 1 ? '' : 's'} a la vez${uhd ? ' · 4K disponible' : ''}.`,
  ];
  void installed;
  return { nivel, ok, aiMemGb: +aiMemGb.toFixed(1), llm, vision, whisper, voz, renderProcesos, uhd, limites, razones };
}
