import { useCallback, useEffect, useRef, useState } from 'react';
import type { Brand, FacePoint, Preset, Project, Scene, Transcript } from '@snz/schema';

export interface Extras { voiceover?: { src: string; words: Transcript['words'] }; faces: FacePoint[] }

export interface Job { id: string; status: 'running' | 'done' | 'error'; message: string; progress: number; result?: Record<string, any> }

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
  return data as T;
}

/** Espera a que termine una tarea del servidor, informando el avance. */
export async function waitJob(job: Job, onTick: (j: Job) => void): Promise<Job> {
  let j = job;
  for (;;) {
    onTick(j);
    if (j.status === 'error') throw new Error(j.message);
    if (j.status === 'done') return j;
    await new Promise((r) => setTimeout(r, 700));
    j = await api<Job>(`/api/jobs/${j.id}`);
  }
}

export const sceneDuration = (s: Scene) => s.ranges.reduce((a, r) => a + Math.max(0, r.end - r.start), 0);

/** Lo que se dice en una escena, según la transcripción. */
export function sceneSpeech(s: Scene, t: Transcript | null): string {
  if (!t) return '';
  return s.ranges
    .flatMap((r) => t.words.filter((w) => { const m = (w.start + w.end) / 2; return m >= r.start && m < r.end; }))
    .map((w) => w.text).join(' ');
}

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
  presets: Preset[];
  setPresets: (p: Preset[]) => void;
  error: string | null;
  saving: boolean;
  /** Cambia el proyecto: guarda, y queda en el historial de deshacer. */
  update: (fn: (p: Project) => void) => void;
  /** Reemplaza el proyecto con uno que devolvió el servidor. */
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useProject(id: string | null): ProjectStore {
  const [project, setProject] = useState<Project | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [brand, setBrand] = useState<Brand | undefined>();
  const [extras, setExtras] = useState<Extras | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const current = useRef<Project | null>(null);
  const lastSaved = useRef('');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);

  const sync = () => setHist({ past: past.current.length, future: future.current.length });
  const show = (p: Project) => { current.current = p; setProject(p); };

  useEffect(() => {
    past.current = []; future.current = []; sync();
    setProject(null); setError(null); current.current = null;
    if (!id) return;
    let alive = true;
    api(`/api/project?id=${encodeURIComponent(id)}`).then((d) => {
      if (!alive) return;
      lastSaved.current = d.project.updatedAt;
      show(d.project); setTranscript(d.transcript); setPresets(d.presets); setBrand(d.brand); setExtras(d.extras);
    }).catch((e) => alive && setError(e.message));
    // Cambios hechos fuera del studio (Claude, CLI): llegan en vivo.
    const es = new EventSource(`/api/events?id=${encodeURIComponent(id)}`);
    es.onmessage = (ev) => {
      const p = JSON.parse(ev.data) as Project;
      if (p.updatedAt === lastSaved.current || pending.current) return;
      lastSaved.current = p.updatedAt;
      if (current.current) past.current.push(current.current);
      future.current = [];
      show(p); sync();
    };
    return () => { alive = false; es.close(); };
  }, [id]);

  const save = useCallback((p: Project) => {
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const d = await api(`/api/project?id=${encodeURIComponent(p.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        lastSaved.current = d.project.updatedAt;
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        pending.current = false;
        setSaving(false);
      }
    }, 250);
  }, []);

  const update = useCallback((fn: (p: Project) => void) => {
    const cur = current.current;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    past.current.push(cur);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    show(next); sync(); save(next);
  }, [save]);

  const replace = useCallback((p: Project) => {
    if (current.current) past.current.push(current.current);
    future.current = [];
    lastSaved.current = p.updatedAt;
    show(p); sync();
  }, []);

  const step = (from: Project[], to: Project[]) => {
    const p = from.pop();
    if (!p || !current.current) return;
    to.push(current.current);
    show(p); sync(); save(p);
  };
  const undo = useCallback(() => step(past.current, future.current), [save]);
  const redo = useCallback(() => step(future.current, past.current), [save]);

  return { project, transcript, brand, extras, presets, setPresets, error, saving, update, replace, undo, redo, canUndo: hist.past > 0, canRedo: hist.future > 0 };
}
