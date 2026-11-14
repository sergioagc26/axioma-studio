import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChildProcess } from 'node:child_process';

/**
 * Cancelar trabajos: cada trabajo corre dentro de su «contexto de cancelación». Todo lo que lance
 * dentro (ffmpeg, la voz IA, Whisper, el render) se registra ahí; al cancelar se cierran esos
 * procesos y el trabajo termina en el siguiente punto de control.
 */
export class Cancelled extends Error {
  constructor() { super('Cancelado.'); this.name = 'Cancelled'; }
}

export interface CancelScope {
  controller: AbortController;
  children: Set<ChildProcess>;
  /** Otras formas de parar (p. ej. la señal del render de Remotion). */
  hooks: Set<() => void>;
}

const store = new AsyncLocalStorage<CancelScope>();

export function newCancelScope(): CancelScope {
  return { controller: new AbortController(), children: new Set(), hooks: new Set() };
}

/** Corre `fn` dentro del contexto: lo que lance queda ligado a este trabajo. */
export function runCancellable<T>(scope: CancelScope, fn: () => Promise<T>): Promise<T> {
  return store.run(scope, fn);
}

/** Pide parar: cierra los procesos del trabajo y avisa a quien esté escuchando. */
export function cancelScope(scope: CancelScope) {
  if (scope.controller.signal.aborted) return;
  scope.controller.abort(new Cancelled());
  for (const c of scope.children) { try { c.kill('SIGTERM'); } catch { /* ya terminó */ } }
  // Si un proceso no se cierra por las buenas, a los 3 s se fuerza.
  setTimeout(() => { for (const c of scope.children) { try { if (c.exitCode === null) c.kill('SIGKILL'); } catch { /* nada */ } } }, 3000).unref();
  for (const h of scope.hooks) { try { h(); } catch { /* nada */ } }
}

/** La señal del trabajo actual (para fetch y para lo que acepte AbortSignal). */
export const currentSignal = (): AbortSignal | undefined => store.getStore()?.controller.signal;

/** Punto de control: si el trabajo fue cancelado, se para aquí. */
export function checkCancelled() {
  if (store.getStore()?.controller.signal.aborted) throw new Cancelled();
}

export const isCancelled = (e: unknown) => e instanceof Cancelled || (e instanceof Error && e.name === 'Cancelled');

/** Registra un proceso hijo en el trabajo actual (se cierra si se cancela). */
export function trackChild(child: ChildProcess) {
  const s = store.getStore();
  if (!s) return;
  if (s.controller.signal.aborted) { try { child.kill('SIGTERM'); } catch { /* nada */ } return; }
  s.children.add(child);
  child.once('close', () => s.children.delete(child));
}

/** Registra otra forma de parar (se llama al cancelar). Devuelve cómo quitarla. */
export function onCancel(fn: () => void): () => void {
  const s = store.getStore();
  if (!s) return () => {};
  // Si ya se canceló (la orden llegó antes de que esto empezara), se para enseguida.
  if (s.controller.signal.aborted) { queueMicrotask(fn); return () => {}; }
  s.hooks.add(fn);
  return () => s.hooks.delete(fn);
}
