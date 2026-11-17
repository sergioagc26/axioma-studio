import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneLength, speechOf } from '@axioma/schema';
import type { Brand, BrandKit, VisionReport, FacePoint, SpeakerTurn, Preset, Project, Scene, Transcript, TransitionSpec } from '@axioma/schema';

export interface Extras { voiceover?: { src: string; words: Transcript['words'] }; faces: FacePoint[]; speakers?: SpeakerTurn[]; captionWords?: Transcript['words']; transitions: TransitionSpec[]; cutout?: string; cutoutCoverage?: number[]; depth?: string[]; front?: { src: string; key: string } }

export interface Job { id: string; kind?: string; projectId?: string; status: 'running' | 'done' | 'error'; message: string; progress: number; result?: Record<string, any> }

/** Error de la app con el código HTTP (sin código = no hubo respuesta del servidor). */
export type ApiError = Error & { status?: number };

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    // El navegador solo dice «Failed to fetch»: el servidor no respondió (cerrado, reiniciando o sin red).
    throw new Error('No hay conexión con la app. Revisa que siga abierta.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: ApiError = new Error(data.error ?? `Error ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data as T;
}

/**
 * Sube un archivo informando el avance real (fetch no lo da). Mismo método, URL y cuerpo que api().
 */
export function uploadFile<T = any>(url: string, file: File, onProgress: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* respuesta sin JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(Object.assign(new Error(data.error ?? `Error ${xhr.status}`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Se cortó la conexión al subir el video. Revisa que la app siga abierta y vuelve a intentarlo.'));
    xhr.send(file);
  });
}

/**
 * Espera a que termine una tarea del servidor, informando el avance. Aguanta cortes cortos de red
 * o un reinicio del servidor: reintenta unos segundos antes de rendirse, con un mensaje claro.
 */
export async function waitJob(job: Job, onTick: (j: Job) => void): Promise<Job> {
  // Un trabajo cancelado termina con «Cancelado.» (quien espera lo muestra como cualquier aviso).
  let j = job;
  let fails = 0, misses = 0;
  for (;;) {
    onTick(j);
    if (j.status === 'error') throw new Error(j.message);
    if (j.status === 'done') return j;
    await new Promise((r) => setTimeout(r, fails || misses ? 1500 : 700));
    try {
      j = await api<Job>(`/api/jobs/${j.id}`);
      fails = 0; misses = 0;
    } catch (e: any) {
      const status = (e as ApiError).status;
      if (status === 404) {
        // La tarea ya no existe: casi siempre porque la app se reinició a mitad del trabajo.
        if (++misses > 3) throw new Error('La app se reinició a mitad del trabajo. Vuelve a pulsar el botón para hacerlo otra vez.');
      } else if (!status || status >= 500) {
        if (++fails > 12) throw new Error('Se perdió la conexión con la app. Revisa que siga abierta y vuelve a intentarlo.');
      } else throw e;
      j = { ...j, message: 'Reconectando con la app…' };
    }
  }
}

export const sceneDuration = (s: Scene) => sceneLength(s);

/** Lo que se dice en una escena (con su recorte), según la transcripción. */
export const sceneSpeech = (s: Scene, t: Transcript | null): string => speechOf(s, t);

/** Mismo criterio que el engine: zoom en la primera escena tras cada intervalo. */
export function applyPunchZooms(scenes: Scene[], every: number) {
  let t = 0, next = every;
  for (const s of scenes) {
    s.punchZoom = false;
    if (every > 0 && t >= next) { s.punchZoom = true; next = t + every; }
    t += sceneDuration(s);
  }
}

export interface ProjectStore {
  project: Project | null;
  transcript: Transcript | null;
  brand: Brand | undefined;
  extras: Extras | undefined;
  /** Efectos de sonido incluidos y proveedores de voz disponibles. */
  catalog: { sfx: { id: string; name: string; description: string }[]; voices: string[] };
  /** Perfil de la marca del cliente (null si aún no tiene). */
  kit: BrandKit | null;
  /** Lo que la app vio en el video. */
  vision: VisionReport | null;
  setKit: (k: BrandKit | null) => void;
  presets: Preset[];
  setPresets: (p: Preset[]) => void;
  error: string | null;
  saving: boolean;
  /** Vuelve a pedir al servidor lo que no vive en project.json (transiciones propias, voz en off…).
   *  Si ya se tiene la respuesta de GET /api/project, se pasa y no se vuelve a pedir. */
  reloadExtras: (data?: { extras?: Extras; presets?: Preset[]; brand?: Brand }) => Promise<void>;
  /** Cambia el proyecto: guarda, y queda en el historial de deshacer. */
  update: (fn: (p: Project) => void) => void;
  /** Reemplaza el proyecto con uno que devolvió el servidor. `reset` limpia el historial de deshacer (ops que crean o borran archivos). */
  replace: (p: Project, opts?: { reset?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** El proyecto más reciente (aunque la pantalla aún no se haya vuelto a dibujar). */
  latest: () => Project | null;
  /** Espera a que se guarde el último cambio pendiente; lanza error si el guardado falla. */
  flush: () => Promise<void>;
}

export function useProject(id: string | null): ProjectStore {
  const [project, setProject] = useState<Project | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [brand, setBrand] = useState<Brand | undefined>();
  const [extras, setExtras] = useState<Extras | undefined>();
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [vision, setVision] = useState<VisionReport | null>(null);
  const [catalog, setCatalog] = useState<ProjectStore['catalog']>({ sfx: [], voices: [] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const current = useRef<Project | null>(null);
  const lastSaved = useRef('');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  // true mientras llegan cambios del servidor seguidos (una tarea, Claude, la CLI) sin una edición
  // local en medio: toda la racha ocupa un solo paso de deshacer (el estado de antes).
  const external = useRef(false);
  // Envío del guardado (lo usa también flush) y el que esté en curso.
  const sendRef = useRef<(() => Promise<boolean>) | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const lastError = useRef('');

  const sync = () => setHist({ past: past.current.length, future: future.current.length });
  const show = (p: Project) => { current.current = p; setProject(p); };

  useEffect(() => {
    past.current = []; future.current = []; sync();
    setProject(null); setError(null); current.current = null; external.current = false;
    if (!id) return;
    let alive = true;
    api(`/api/project?id=${encodeURIComponent(id)}`).then((d) => {
      if (!alive) return;
      lastSaved.current = d.project.updatedAt;
      show(d.project); setTranscript(d.transcript); setPresets(d.presets); setBrand(d.brand); setExtras(d.extras); setCatalog({ sfx: d.sfx ?? [], voices: d.voices ?? [] }); setKit(d.kit ?? null); setVision(d.vision ?? null);
    }).catch((e) => alive && setError(e.message));
    // Cambios hechos fuera del studio (Claude, CLI): llegan en vivo.
    const es = new EventSource(`/api/events?id=${encodeURIComponent(id)}`);
    es.onmessage = (ev) => {
      const p = JSON.parse(ev.data) as Project;
      if (p.updatedAt === lastSaved.current || pending.current) return;
      lastSaved.current = p.updatedAt;
      if (current.current && !external.current) past.current.push(current.current);
      external.current = true;
      future.current = [];
      show(p); sync();
    };
    return () => { alive = false; es.close(); };
  }, [id]);

  // Avisa antes de cerrar la pestaña si queda un cambio sin guardar.
  useEffect(() => {
    const on = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', on);
    return () => removeEventListener('beforeunload', on);
  }, []);

  /**
   * Guarda (con una pequeña espera para juntar cambios seguidos). Si el servidor no responde, reintenta
   * cada pocos segundos con lo último que hay en pantalla, hasta que vuelva.
   */
  const save = useCallback((_p: Project) => {
    pending.current = true;
    window.clearTimeout(timer.current);
    const send = async (): Promise<boolean> => {
      const p = current.current;
      if (!p) { pending.current = false; return true; }
      setSaving(true);
      const run = (async () => {
        try {
          const d = await api(`/api/project?id=${encodeURIComponent(p.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
          lastSaved.current = d.project.updatedAt;
          setError(null); lastError.current = '';
          // Si mientras se guardaba hubo otra edición, su propio envío ya está programado.
          if (current.current === p) pending.current = false;
          return true;
        } catch (e: any) {
          const status = (e as ApiError).status;
          if (!status || status >= 500) {
            lastError.current = 'Sin conexión con la app: tu cambio se guardará cuando vuelva.';
            setError(lastError.current);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => void send(), 3000);
          } else {
            lastError.current = e.message;
            setError(e.message);
            pending.current = false;
          }
          return false;
        } finally {
          setSaving(false);
        }
      })();
      inflight.current = run;
      const ok = await run;
      if (inflight.current === run) inflight.current = null;
      return ok;
    };
    sendRef.current = send;
    timer.current = window.setTimeout(() => void send(), 250);
  }, []);

  const update = useCallback((fn: (p: Project) => void) => {
    const cur = current.current;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    external.current = false;
    past.current.push(cur);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    show(next); sync(); save(next);
  }, [save]);

  const replace = useCallback((p: Project, opts?: { reset?: boolean }) => {
    if (opts?.reset) {
      past.current = []; future.current = []; external.current = false;
      lastSaved.current = p.updatedAt;
      show(p); sync();
      return;
    }
    // Ya llegó en vivo por /api/events: solo se muestra, sin otro paso de deshacer.
    if (p.updatedAt === lastSaved.current) { external.current = false; show(p); return; }
    if (current.current && !external.current) past.current.push(current.current);
    external.current = false;
    future.current = [];
    lastSaved.current = p.updatedAt;
    show(p); sync();
  }, []);

  const step = (from: Project[], to: Project[]) => {
    const p = from.pop();
    if (!p || !current.current) return;
    to.push(current.current);
    external.current = false;
    show(p); sync(); save(p);
  };
  const flush = useCallback(async () => {
    if (inflight.current) await inflight.current;
    if (!pending.current || !sendRef.current) return;
    window.clearTimeout(timer.current);
    if (!(await sendRef.current())) throw new Error(lastError.current || 'No se pudo guardar el cambio.');
  }, []);
  const reloadExtras = useCallback(async (data?: { extras?: Extras; presets?: Preset[]; brand?: Brand }) => {
    if (!id) return;
    const d = data && data.presets ? data : await api(`/api/project?id=${encodeURIComponent(id)}`);
    setExtras(d.extras); setPresets(d.presets); setBrand(d.brand);
  }, [id]);

  const undo = useCallback(() => step(past.current, future.current), [save]);
  const redo = useCallback(() => step(future.current, past.current), [save]);

  return { project, transcript, brand, extras, catalog, kit, vision, setKit, reloadExtras, presets, setPresets, error, saving, update, replace, undo, redo, canUndo: hist.past > 0, canRedo: hist.future > 0, latest: () => current.current, flush };
}

/**
 * Le pide un cambio a la IA local (Ollama) y espera el resultado. Si la IA local
 * está apagada, la petición queda guardada y se avisa.
 */
export async function askAssistant(projectId: string, text: string, sceneId: string | undefined, onStep: (msg: string) => void): Promise<{ text: string; saved?: boolean }> {
  const job = await api<Job>(`/api/op?id=${encodeURIComponent(projectId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'ia', text, sceneId }),
  });
  const done = await waitJob(job, (j) => onStep(j.message));
  return done.result as { text: string; saved?: boolean };
}

/** Redes donde la app puede publicar. Hoy solo Instagram; TikTok queda para después. */
export type Red = 'instagram' | 'facebook' | 'tiktok';

/**
 * Publica el reel en una red y espera a que termine. Es público y no se puede deshacer:
 * solo se llama cuando la persona lo confirmó en pantalla (por eso `confirmado` es obligatorio).
 */
export async function publishTo(projectId: string, body: { red: Red; confirmado: true; cuenta?: string; texto?: string; entrada?: string; repetir?: boolean }, onTick: (j: Job) => void): Promise<Job> {
  const job = await api<Job>(`/api/redes/publicar?id=${encodeURIComponent(projectId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return waitJob(job, onTick);
}

/** Trae de la red las cifras reales de lo publicado desde la app (de una publicación o de un cliente). */
export async function syncResults(body: { entrada?: string; cliente?: string }, onTick: (j: Job) => void): Promise<Job> {
  const job = await api<Job>('/api/redes/metricas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return waitJob(job, onTick);
}
