import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME, publishPack, publishText, type Project } from '@axioma/schema';
import { api, useProject, waitJob, type Job, type ProjectStore } from './useProject.ts';
import { Audio } from './screens/Audio.tsx';
import { Brief } from './screens/Brief.tsx';
import { Editor } from './screens/Editor.tsx';
import { Projects } from './screens/Projects.tsx';
import { Referencias } from './screens/Referencias.tsx';
import { Storyboard } from './screens/Storyboard.tsx';
import { Variantes } from './screens/Variantes.tsx';
import { Imagenes } from './screens/Imagenes.tsx';
import { Texto } from './screens/Texto.tsx';
import { Calendario } from './screens/Calendario.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './icons.ts';
import { Listo } from './screens/Listo.tsx';

export type Screen = 'proyectos' | 'calendario' | 'listo' | 'brief' | 'storyboard' | 'editor' | 'texto' | 'variantes' | 'audio' | 'imagenes' | 'referencias';

export interface Ctx {
  store: ProjectStore;
  id: string | null;
  sceneId: string | null;
  go: (screen: Screen, params?: { p?: string | null; s?: string | null }) => void;
  toast: (msg: string) => void;
  /** Abre la ventana de exportar el video. */
  exportVideo: () => void;
  /** Exporta ya con los ajustes del proyecto, sin ventana. */
  exportNow: () => Promise<void>;
  /** Exportación en curso de ESTE proyecto (con su avance y lo que está haciendo). */
  exporting: Job | null;
  /** Se está exportando otro proyecto: hay que esperar a que termine. */
  exportBusyElsewhere: boolean;
  /** Última exportación de este proyecto (sale del servidor: sobrevive a recargar). `stale` = el video cambió después. */
  lastExport: LastExport | null;
  /** Por qué falló el último intento de exportar este proyecto (null si no falló). */
  exportError: string | null;
  /** Subida y preparación de un video nuevo en curso (sigue aunque se cambie de pantalla). */
  creating: Job | null;
  /** Sube y crea un proyecto: `run` hace la subida (avisando el avance) y devuelve la tarea del servidor. */
  startCreate: (run: (tick: (j: Job) => void) => Promise<Job>) => Promise<void>;
}

/** Lo que devuelve GET /api/ultimo-export. `file` es relativo al proyecto (para /media/<id>/<file>). */
export interface LastExport { file: string | null; path: string; at: string; stale: boolean; error?: string; files?: ExportFile[] }
/** Cada archivo de una exportación de varios (los 3 formatos o las 3 versiones del gancho). `file` null = fuera del proyecto. */
export interface ExportFile { id: string; label: string; file?: string | null }

/**
 * Firma del contenido del video para saber si cambió después de exportar. Deja fuera lo que escribe
 * la propia exportación (formato, calidad, carpeta, volumen final) y la fecha de guardado.
 */
const firma = (p: Project) => JSON.stringify({ ...p, updatedAt: '', export: null, audio: { ...p.audio, targetLufs: 0 } });

/** Atajos según el sistema: ⌘ en Mac, Ctrl en Windows. */
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? '⌘' : 'Ctrl+';
const REDO = MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z';

function parseHash(): { screen: Screen; p: string | null; s: string | null } {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const screen = (['proyectos', 'calendario', 'listo', 'brief', 'storyboard', 'editor', 'texto', 'variantes', 'audio', 'imagenes', 'referencias'] as Screen[]).find((x) => x === path) ?? 'proyectos';
  return { screen, p: q.get('p'), s: q.get('s') };
}

// En el orden del trabajo real: casi siempre se llega al Editor (modo automático).
// Lo de todos los días a la vista; lo avanzado, guardado en «Más».
const TABS: [Screen, IconName, string][] = [['brief', 'brief', 'Brief'], ['listo', 'result', 'Resultado'], ['editor', 'editor', 'Editor']];
const MORE: [Screen, IconName, string][] = [['texto', 'scissors', 'Cortar por texto'], ['storyboard', 'storyboard', 'Storyboard'], ['variantes', 'variants', 'Variantes'], ['audio', 'audio', 'Audio'], ['imagenes', 'image', 'Imágenes'], ['referencias', 'reference', 'Referencias']];

export const App: React.FC = () => {
  const [route, setRoute] = useState(parseHash);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('tema') ?? 'oscuro'; } catch { return 'oscuro'; }
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [render, setRender] = useState<Job | null>(null);
  const [formato, setFormato] = useState('9:16');
  // Ventana de exportar: formato, calidad y carpeta se eligen al exportar, no durante la edición.
  const [exportOpen, setExportOpen] = useState(false);
  const [calidad, setCalidad] = useState<'maxima' | 'alta' | 'ligera'>('alta');
  const [carpeta, setCarpeta] = useState('');
  const [lufs, setLufs] = useState(-14);
  const [ganchos, setGanchos] = useState(false);
  // ¿Ya se revisó la IA local? null = todavía comprobando. (Claude ya no se usa: todo es local.)
  const [claude, setClaude] = useState<boolean | null>(null);
  const [local, setLocal] = useState(false);
  useEffect(() => { api('/api/claude').then((d) => { setClaude(d.conectado); setLocal(Boolean(d.local)); }).catch(() => setClaude(false)); }, []);
  // Ayuda: las explicaciones largas están ocultas; se muestran con el botón ❔.
  const [help, setHelp] = useState(() => { try { return localStorage.getItem('ayuda') === '1'; } catch { return false; } });
  useEffect(() => {
    if (help) document.documentElement.dataset.ayuda = '1'; else delete document.documentElement.dataset.ayuda;
    try { localStorage.setItem('ayuda', help ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }, [help]);
  const store = useProject(route.p);
  const { project } = store;

  useEffect(() => {
    const on = () => setRoute(parseHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tema', theme); } catch { /* sin almacenamiento */ }
  }, [theme]);

  const go = useCallback<Ctx['go']>((screen, params = {}) => {
    const cur = parseHash();
    const p = params.p === undefined ? cur.p : params.p;
    const s = params.s === undefined ? cur.s : params.s;
    const q = new URLSearchParams();
    if (p) q.set('p', p);
    if (s) q.set('s', s);
    location.hash = `/${screen}${q.size ? `?${q}` : ''}`;
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    // Los mensajes largos se quedan más tiempo en pantalla.
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), Math.min(20000, 3500 + msg.length * 45));
  }, []);

  // Atajos: deshacer / rehacer.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      e.preventDefault();
      (e.shiftKey ? store.redo : store.undo)();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [store.undo, store.redo]);

  const [pubAi, setPubAi] = useState<string | null>(null);
  const [pubBusy, setPubBusy] = useState(false);
  const pubText = pubAi ?? (project ? publishText(publishPack(project, store.transcript, store.kit?.sector)) : '');
  const openExport = () => {
    if (!project) return;
    setCalidad(project.export.quality);
    setCarpeta(project.export.folder ?? '');
    setLufs(project.audio.targetLufs <= -15 ? -16 : -14);
    setPubAi(null);
    setExportOpen(true);
  };
  const pickFolder = async () => {
    try {
      const d = await api<{ folder: string | null }>('/api/elegir-carpeta', { method: 'POST' });
      if (d.folder) setCarpeta(d.folder);
    } catch (e: any) { toast(e.message); }
  };
  // --- Exportar ---------------------------------------------------------------------------
  // Solo hay una exportación a la vez. `renderRef` evita lanzar dos con clics seguidos (o desde un
  // cierre de pantalla viejo) y `renderId` dice de qué proyecto es.
  const renderRef = useRef<Job | null>(null);
  const renderIdRef = useRef<string | null>(null);
  const [renderId, setRenderIdState] = useState<string | null>(null);
  const setRenderId = (id: string | null) => { renderIdRef.current = id; setRenderIdState(id); };
  const pendingExport = useRef<string | null>(null);
  const [exported, setExported] = useState<{ id: string; data: LastExport | null } | null>(null);
  const [sigs, setSigs] = useState<Record<string, string>>({});
  const [exportError, setExportError] = useState<{ id: string; message: string } | null>(null);
  const loadExport = useCallback((id: string) => api<LastExport | null>(`/api/ultimo-export?id=${encodeURIComponent(id)}`)
    .then((d) => setExported((cur) => (parseHash().p !== id ? cur
      // El servidor no guarda la lista de archivos de una exportación múltiple: se conserva la de esta sesión.
      : { id, data: d ? { ...d, files: cur?.id === id && cur.data?.path === d.path ? cur.data.files : undefined } : null })))
    .catch(() => { /* sin dato del servidor: se queda lo que había */ }), []);

  /** Sigue una exportación hasta el final y deja el resultado (o el error) a la vista. */
  const followRender = async (job: Job, id: string, sig?: string): Promise<Job | null> => {
    renderRef.current = job; setRenderId(id); setRender(job);
    setExportError((e) => (e?.id === id ? null : e));
    try {
      const done = await waitJob(job, (j) => { renderRef.current = j; setRender(j); });
      setSigs((all) => { const n = { ...all }; if (sig) n[id] = sig; else delete n[id]; return n; });
      const files = done.result?.files as ExportFile[] | undefined;
      setExported({ id, data: { file: (done.result?.file as string | undefined) ?? files?.find((f) => f.file)?.file ?? null, path: String(done.result?.path ?? ''), at: String(done.result?.at ?? new Date().toISOString()), stale: false, files } });
      void loadExport(id);
      return done;
    } catch (e: any) {
      setExportError({ id, message: e.message });
      toast(`No se pudo exportar: ${e.message}`);
      return null;
    } finally {
      renderRef.current = null; setRender(null); setRenderId(null);
      // Si durante la exportación se pidió otra (p. ej. «Editar mi video» otra vez), se hace ahora.
      if (pendingExport.current) { const again = pendingExport.current; pendingExport.current = null; if (store.latest()?.id === again) void exportNowRef.current(); }
    }
  };
  /** Antes de mandar la tarea: bloquea otro clic al instante. Devuelve false si ya hay una en marcha. */
  const claimRender = (id: string) => {
    if (renderRef.current) {
      if (renderIdRef.current === id) { pendingExport.current = id; toast('Ya se está exportando. Cuando termine, lo exporto otra vez con los cambios.'); }
      else toast('Hay otro video exportándose. Espera a que termine.');
      return false;
    }
    const start: Job = { id: '', status: 'running', message: 'Preparando la exportación…', progress: 0, projectId: id };
    renderRef.current = start; setRenderId(id); setRender(start);
    return true;
  };
  const releaseRender = (id: string, e: any) => {
    renderRef.current = null; setRender(null); setRenderId(null);
    setExportError({ id, message: e.message });
    toast(`No se pudo exportar: ${e.message}`);
  };

  const exportar = async () => {
    if (!project) return;
    setExportOpen(false);
    const p = store.latest() ?? project;
    if (!claimRender(p.id)) return;
    const sig = firma(p);
    let job: Job;
    try {
      job = await api<Job>(`/api/op?id=${encodeURIComponent(p.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'render', formato, calidad, carpeta, lufs, ganchos: ganchos && formato !== 'todos' }),
      });
    } catch (e: any) { return releaseRender(p.id, e); }
    const done = await followRender(job, p.id, sig);
    if (!done) return;
    const files = done.result?.files as { id: string; label: string }[] | undefined;
    toast(files ? (formato === 'todos' ? `Los 3 formatos exportados en ${done.result?.path}.` : `${files.length} versiones exportadas en ${done.result?.path}: ${files.map((f) => `${f.id} · ${f.label}`).join(' · ')}`) : `Exportado en: ${done.result?.path}`);
  };

  /** Exporta ya, sin preguntar nada: 9:16 con la calidad y la carpeta del proyecto. Lo usa la edición automática. */
  const exportNow = async () => {
    const p = store.latest() ?? store.project;
    if (!p) return;
    if (!claimRender(p.id)) return;
    const sig = firma(p);
    let job: Job;
    try {
      job = await api<Job>(`/api/op?id=${encodeURIComponent(p.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'render', formato: '9:16', calidad: p.export.quality, carpeta: p.export.folder ?? '', lufs: p.audio.targetLufs <= -15 ? -16 : -14, ganchos: false }),
      });
    } catch (e: any) { return releaseRender(p.id, e); }
    const done = await followRender(job, p.id, sig);
    if (done) toast(`Video exportado en: ${done.result?.path}`);
  };
  const exportNowRef = useRef(exportNow);
  exportNowRef.current = exportNow;

  // Al abrir un proyecto (o recargar): la última exportación y, si hay una en marcha, retomar su avance.
  useEffect(() => {
    if (!route.p) return;
    const id = route.p;
    void loadExport(id);
    if (renderRef.current) return;
    api<Job[]>(`/api/jobs?id=${encodeURIComponent(id)}`).then((list) => {
      const r = Array.isArray(list) ? list.find((j) => j.kind === 'render' && j.status === 'running') : undefined;
      if (r && !renderRef.current) void followRender(r, id);
    }).catch(() => { /* servidor sin esta consulta: no hay nada que retomar */ });
  }, [route.p]);
  // Si el video cambia, el servidor vuelve a decir si la exportación quedó vieja (con calma: no en cada tecla).
  useEffect(() => {
    if (!route.p || route.screen !== 'listo' || !project?.updatedAt) return;
    const t = window.setTimeout(() => void loadExport(route.p!), 1200);
    return () => window.clearTimeout(t);
  }, [project?.updatedAt, route.screen]);

  // --- Crear un proyecto (subir) ----------------------------------------------------------------
  // Vive aquí y no en Proyectos: el avance no se pierde al cambiar de pantalla, y tras recargar se retoma.
  const [creating, setCreating] = useState<Job | null>(null);
  const creatingRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; href: string } | null>(null);
  const finishCreate = async (job: Job) => {
    // La subida ocupa el primer 30 % de la barra; la preparación en el servidor, el resto.
    let shown = 0.3;
    const done = await waitJob(job, (j) => { shown = Math.max(shown, 0.3 + j.progress * 0.7); setCreating({ ...j, progress: shown }); });
    if (done.result?.summary) toast((done.result.summary as string[]).join(' '));
    const id = done.result?.id as string | undefined;
    if (!id) return;
    // Solo se lleva al Brief a quien sigue esperando en Proyectos; si ya se fue, se le avisa.
    const cur = parseHash();
    if (cur.screen === 'proyectos' && !cur.p) go('brief', { p: id, s: null });
    else setNotice({ text: 'Tu video nuevo ya está listo para el brief.', href: `#/brief?p=${encodeURIComponent(id)}` });
  };
  const startCreate: Ctx['startCreate'] = async (run) => {
    if (creatingRef.current) { toast('Espera a que termine el video que se está subiendo.'); return; }
    creatingRef.current = true;
    setCreating({ id: '', status: 'running', message: 'Subiendo el video…', progress: 0 });
    try {
      const started = await run((j) => setCreating(j));
      await finishCreate(started);
    } catch (e: any) {
      toast(`No se pudo crear: ${e.message}`);
    } finally {
      creatingRef.current = false; setCreating(null);
    }
  };
  // Tras recargar: si el servidor sigue creando un proyecto, se retoma su avance.
  useEffect(() => {
    // /api/jobs?kind=crear devuelve solo las creaciones de proyecto (tipo 'nuevo'); por si acaso, solo
    // se retoma la de un proyecto que aún no tiene escenas, que es el que se está creando.
    Promise.all([api<Job[]>('/api/jobs?kind=crear'), api<{ id: string; scenes: number }[]>('/api/projects')]).then(([list, projects]) => {
      const fresh = new Set((Array.isArray(projects) ? projects : []).filter((x) => !x.scenes).map((x) => x.id));
      const j = Array.isArray(list) ? list.find((x) => x.status === 'running' && x.projectId && fresh.has(x.projectId)) : undefined;
      if (!j || creatingRef.current) return;
      creatingRef.current = true;
      finishCreate(j).catch((e: any) => toast(`No se pudo crear: ${e.message}`)).finally(() => { creatingRef.current = false; setCreating(null); });
    }).catch(() => { /* nada que retomar */ });
  }, []);

  const ex = exported && exported.id === route.p ? exported.data : null;
  // Tras recargar no hay firma propia: cada vez que se guarda un cambio se le pregunta al servidor
  // si el video exportado quedó viejo.
  const savedAt = project?.id === route.p ? project?.updatedAt : undefined;
  useEffect(() => {
    if (!route.p || !savedAt || (route.p && sigs[route.p])) return;
    const t = window.setTimeout(() => { void loadExport(route.p!); }, 600);
    return () => window.clearTimeout(t);
  }, [route.p, savedAt]);
  const sigNow = useMemo(() => (project ? firma(project) : ''), [project]);
  const mySig = route.p ? sigs[route.p] : undefined;
  const lastExport: LastExport | null = ex && (ex.file || ex.path)
    ? { ...ex, stale: mySig && project?.id === route.p ? sigNow !== mySig : Boolean(ex.stale) }
    : null;
  const mine = Boolean(render) && renderId === route.p;
  const ctx: Ctx = {
    store, id: route.p, sceneId: route.s, go, toast, exportVideo: () => openExport(), exportNow,
    exporting: mine ? render : null,
    exportBusyElsewhere: Boolean(render) && renderId !== route.p,
    lastExport,
    exportError: (exportError && exportError.id === route.p ? exportError.message : null) ?? (ex?.error && !mine ? ex.error : null),
    creating, startCreate,
  };
  const moreRef = useRef<HTMLDetailsElement>(null);
  const needsProject = route.screen !== 'proyectos';

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/proyectos" title="Todos los proyectos" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="logo" aria-hidden="true" />{route.p ? <span className="sr-only">{APP_NAME}</span> : APP_NAME}
        </a>
        {route.p && route.screen !== 'calendario' && (
          <nav className="nav" aria-label="Vistas">
            <a href="#/proyectos" className="back"><Icon name="back" />Proyectos</a>
            {TABS.map(([s, icon, label]) => (
              <a key={s} href={`#/${s}?p=${encodeURIComponent(route.p!)}${route.s ? `&s=${route.s}` : ''}`} className={route.screen === s ? 'on' : ''} aria-current={route.screen === s ? 'page' : undefined}><Icon name={icon} />{label}</a>
            ))}
            <details className="more" ref={moreRef}>
              <summary className={MORE.some(([s]) => s === route.screen) ? 'on' : ''}>{(() => { const m = MORE.find(([s]) => s === route.screen); return m ? <><Icon name={m[1]} /> {m[2]}</> : <><Icon name="more" /> Más</>; })()}</summary>
              <div className="more-menu">
                {MORE.map(([s, icon, label]) => (
                  <a key={s} href={`#/${s}?p=${encodeURIComponent(route.p!)}${route.s ? `&s=${route.s}` : ''}`} className={route.screen === s ? 'on' : ''} onClick={() => moreRef.current?.removeAttribute('open')}><Icon name={icon} />{label}</a>
                ))}
              </div>
            </details>
          </nav>
        )}
        <div className="row spacer">
          {project && <strong className="pname" style={{ maxWidth: 260 }} title={project.name}>{project.name}</strong>}
          {project && <span className="pill">{project.client ?? 'personal'}</span>}
          {project && <span className={`small ${store.error ? '' : 'muted'}`} style={store.error ? { color: 'var(--pinkText)' } : undefined} aria-live="polite">{store.error ? <><Icon name="warning" />{store.error}</> : store.saving ? 'Guardando…' : <><Icon name="check" />Guardado</>}</span>}
        </div>
        <div className="row">
          {project && (
            <>
              <button className="btn sq" aria-label="Deshacer" title={`Deshacer (${MOD}Z)`} disabled={!store.canUndo} onClick={store.undo}><Icon name="undo" /></button>
              <button className="btn sq" aria-label="Rehacer" title={`Rehacer (${REDO})`} disabled={!store.canRedo} onClick={store.redo}><Icon name="redo" /></button>
            </>
          )}
          {/* Quién atiende los pedidos de cambios. Con la IA local lista, conectar Claude queda en el mismo botón. */}
          {/* Todo es local: los pedidos los hace la IA de este computador (Ollama), sin gastar créditos. */}
          {claude === null ? null : local ? <span className="pill" title="Los pedidos de cambios los hace la IA de tu computador (Ollama), ajustada a lo que aguanta tu PC. No gasta créditos."><Icon name="sparkle" />IA local</span>
            : <span className="pill" title="Abre Ollama para que la IA local atienda los pedidos. Mientras tanto quedan guardados."><Icon name="warning" />IA local apagada</span>}
          <button className="btn sq" aria-pressed={help} aria-label={help ? 'Ocultar las explicaciones' : 'Mostrar las explicaciones'} title={help ? 'Ocultar las explicaciones' : 'Mostrar las explicaciones de cada función'} style={help ? { borderColor: 'var(--pink)' } : undefined} onClick={() => setHelp(!help)}><Icon name="help" /></button>
          <button className="btn sq" aria-label={`Cambiar a tema ${theme === 'oscuro' ? 'claro' : 'oscuro'}`} title={`Tema ${theme === 'oscuro' ? 'claro' : 'oscuro'}`} onClick={() => setTheme(theme === 'oscuro' ? 'claro' : 'oscuro')}>
            <Icon name={theme === 'oscuro' ? 'sun' : 'moon'} />
          </button>
          {/* Brief y Resultado ya tienen su propia forma de exportar: aquí solo se ve el avance. En las
              pantallas avanzadas queda como botón secundario que abre las opciones. */}
          {project && (render || (route.screen !== 'brief' && route.screen !== 'listo')) && (
            <button className="btn rect" disabled={Boolean(render) || !project.scenes.length} onClick={openExport} title="Formato, calidad y carpeta">
              {render ? (mine ? `Exportando ${Math.round(render.progress * 100)} %` : 'Otro video exportándose') : <><Icon name="export" />Exportar…</>}
            </button>
          )}
          {creating && (route.p || route.screen !== 'proyectos') && (
            <a className="pill" href="#/proyectos" title="Ver el avance en Proyectos"><Icon name="upload" />Preparando tu video… {Math.round(creating.progress * 100)} %</a>
          )}
        </div>
      </header>

      {route.screen === 'calendario' ? <div className="scroll"><Calendario ctx={ctx} /></div>
        : !needsProject || !route.p ? <Projects ctx={ctx} />
        : !project ? (
          <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
            {store.error
              ? <div className="col" style={{ alignItems: 'center', textAlign: 'center' }}><strong>No se pudo abrir el proyecto</strong><span className="muted">{store.error}</span><a className="btn rect" href="#/proyectos">Volver a proyectos</a></div>
              : <span className="muted" role="status">Cargando proyecto…</span>}
          </div>
        )
        : route.screen === 'brief' ? <Brief ctx={ctx} />
        : route.screen === 'listo' ? <div className="scroll"><Listo ctx={ctx} /></div>
        : route.screen === 'storyboard' ? <Storyboard ctx={ctx} />
        : route.screen === 'editor' ? <Editor ctx={ctx} />
        : route.screen === 'texto' ? <div className="scroll"><Texto ctx={ctx} /></div>
        : route.screen === 'variantes' ? <div className="scroll"><Variantes ctx={ctx} /></div>
        : route.screen === 'audio' ? <Audio ctx={ctx} />
        : route.screen === 'imagenes' ? <div className="scroll"><Imagenes ctx={ctx} /></div>
        : <Referencias ctx={ctx} />}

      {exportOpen && project && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
          <div className="modal card col" role="dialog" aria-modal="true" aria-label="Exportar video">
            <h2 style={{ fontSize: 22 }}>Exportar video</h2>
            <span className="small muted">Formato</span>
            <div className="opts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {([['9:16', 'Vertical', 'Reels, TikTok, historias'], ['4:5', 'Post vertical', 'Feed de Instagram'], ['1:1', 'Cuadrado', 'Feed y anuncios'], ['16:9', 'Horizontal', 'YouTube: el video centrado'], ['todos', 'Los 3 verticales', '9:16, 4:5 y 1:1 de una vez']] as const).map(([id, name, desc]) => (
                <button key={id} className={`opt ${formato === id ? 'on' : ''}`} aria-pressed={formato === id} onClick={() => setFormato(id)}>
                  <strong>{name}{id === 'todos' ? '' : ` · ${id}`}</strong><span className="muted small">{desc}</span>
                </button>
              ))}
            </div>
            <span className="small muted">Calidad</span>
            <div className="opts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {([['maxima', 'Máxima', 'Casi sin compresión. Archivo grande.'], ['alta', 'Alta', 'Recomendada para redes.'], ['ligera', 'Ligera', 'Para enviar rápido.']] as const).map(([id, name, desc]) => (
                <button key={id} className={`opt ${calidad === id ? 'on' : ''}`} aria-pressed={calidad === id} onClick={() => setCalidad(id)}>
                  <strong>{name}</strong><span className="muted small">{desc}</span>
                </button>
              ))}
            </div>
            <span className="small muted">Volumen</span>
            <div className="opts" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {([[-14, 'Redes sociales', 'Reels, TikTok y YouTube (−14 LUFS).'], [-16, 'Más suave', 'Para web o presentaciones (−16 LUFS).']] as const).map(([v, name, desc]) => (
                <button key={v} className={`opt ${lufs === v ? 'on' : ''}`} aria-pressed={lufs === v} onClick={() => setLufs(v)}>
                  <strong>{name}</strong><span className="muted small">{desc}</span>
                </button>
              ))}
            </div>
            <span className="small muted">¿Dónde lo guardo?</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} value={carpeta} onChange={(e) => setCarpeta(e.target.value)} placeholder="Dentro del proyecto (carpeta renders)" />
              <button className="btn rect" onClick={pickFolder}>Elegir carpeta…</button>
            </div>
            <span className="small muted">Se recuerda para la próxima vez. Vacío = dentro del proyecto.</span>
            <span className="small muted">Texto para publicar (junto al video se guardan también el .txt y los subtítulos en .srt)</span>
            <textarea className="input" readOnly rows={6} style={{ resize: 'vertical', fontFamily: 'inherit' }} value={pubText} />
            {local && (
              <button className="btn rect" style={{ alignSelf: 'flex-start' }} disabled={pubBusy} onClick={async () => {
                setPubBusy(true);
                try { setPubAi(publishText(await api(`/api/publicar?id=${encodeURIComponent(project.id)}`, { method: 'POST' }))); } catch (e: any) { toast(e.message); } finally { setPubBusy(false); }
              }}>{pubBusy ? 'Escribiendo…' : 'Redactar con IA local'}</button>
            )}
            <button className="btn rect" style={{ alignSelf: 'flex-start' }} onClick={() => { navigator.clipboard?.writeText(pubText).then(() => toast('Texto copiado.')).catch(() => toast('No se pudo copiar; selecciónalo y cópialo a mano.')); }}>Copiar texto</button>
            <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', opacity: formato === 'todos' ? 0.5 : 1 }}><input type="checkbox" style={{ marginTop: 3 }} disabled={formato === 'todos'} checked={ganchos && formato !== 'todos'} onChange={(e) => setGanchos(e.target.checked)} /> Exportar 3 versiones del gancho para probar cuál funciona mejor (A tal cual · B con tu frase más fuerte primero · C con otro texto de gancho). Tarda el triple.</label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setExportOpen(false)}>Cancelar</button>
              <button className="btn primary" onClick={exportar}>{formato === 'todos' ? 'Exportar los 3 formatos' : ganchos ? 'Exportar 3 versiones' : 'Exportar MP4'}</button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast notice" role="status">
          {notice.text} <a href={notice.href} onClick={() => setNotice(null)}>Abrir</a>
          <button className="btn sq" aria-label="Cerrar aviso" onClick={() => setNotice(null)}><Icon name="close" /></button>
        </div>
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
};
