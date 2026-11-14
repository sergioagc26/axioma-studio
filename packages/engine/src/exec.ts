import { spawn } from 'node:child_process';
import { Cancelled, checkCancelled, currentSignal, trackChild } from './cancel.ts';

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Ejecuta un programa sin shell (seguro con rutas con espacios en Mac y Windows). */
export function run(bin: string, args: string[], opts: { cwd?: string; quiet?: boolean } = {}): Promise<RunResult> {
  checkCancelled();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true });
    // Si el trabajo se cancela, este proceso se cierra.
    trackChild(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => reject(new Error(`No se pudo ejecutar ${bin}: ${e.message}`)));
    child.on('close', (code) => {
      if (currentSignal()?.aborted) return reject(new Cancelled());
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} terminó con código ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(process.env.SE_FFMPEG ?? 'ffmpeg', ['-hide_banner', '-y', ...args]);
export const ffprobe = (args: string[]) => run(process.env.SE_FFPROBE ?? 'ffprobe', ['-v', 'error', ...args]);
