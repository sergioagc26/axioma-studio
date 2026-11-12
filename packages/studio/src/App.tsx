import React, { useCallback, useEffect, useState } from 'react';
import { APP_NAME } from '@snz/schema';
import { api, useProject, waitJob, type Job, type ProjectStore } from './useProject.ts';
import { Audio } from './screens/Audio.tsx';
import { Brief } from './screens/Brief.tsx';
import { Editor } from './screens/Editor.tsx';
import { Projects } from './screens/Projects.tsx';
import { Referencias } from './screens/Referencias.tsx';
import { Storyboard } from './screens/Storyboard.tsx';
import { Variantes } from './screens/Variantes.tsx';

export type Screen = 'proyectos' | 'brief' | 'storyboard' | 'editor' | 'variantes' | 'audio' | 'referencias';

export interface Ctx {
  store: ProjectStore;
  id: string | null;
  sceneId: string | null;
  go: (screen: Screen, params?: { p?: string | null; s?: string | null }) => void;
  toast: (msg: string) => void;
}

function parseHash(): { screen: Screen; p: string | null; s: string | null } {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const screen = (['proyectos', 'brief', 'storyboard', 'editor', 'variantes', 'audio', 'referencias'] as Screen[]).find((x) => x === path) ?? 'proyectos';
  return { screen, p: q.get('p'), s: q.get('s') };
}

const TABS: [Screen, string][] = [['brief', 'Brief'], ['storyboard', 'Storyboard'], ['editor', 'Editor'], ['variantes', 'Variantes'], ['audio', 'Audio'], ['referencias', 'Referencias']];

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
  // ¿Claude tiene sesión iniciada? null = todavía comprobando.
  const [claude, setClaude] = useState<boolean | null>(null);
  useEffect(() => { api('/api/claude').then((d) => setClaude(d.conectado)).catch(() => setClaude(false)); }, []);
  const connect = async () => {
    try {
      await api('/api/claude', { method: 'POST' });
      setToastMsg('Se abrió una terminal. Escribe /login, entra con tu cuenta y vuelve aquí. Lo compruebo solo en unos segundos.');
      // Se vuelve a comprobar varias veces mientras el usuario inicia sesión.
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 15000));
        const d = await api('/api/claude?revisar=1');
        if (d.conectado) { setClaude(true); setToastMsg('Claude conectado. Ya puedes usar los botones de pedir a Claude.'); return; }
      }
    } catch (e: any) { setToastMsg(e.message); }
  };
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

  const openExport = () => {
    if (!project) return;
    setCalidad(project.export.quality);
    setCarpeta(project.export.folder ?? '');
    setExportOpen(true);
  };
  const pickFolder = async () => {
    try {
      const d = await api<{ folder: string | null }>('/api/elegir-carpeta', { method: 'POST' });
      if (d.folder) setCarpeta(d.folder);
    } catch (e: any) { toast(e.message); }
  };
  const exportar = async () => {
    if (!project) return;
    setExportOpen(false);
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'render', formato, calidad, carpeta }),
      });
      const done = await waitJob(job, setRender);
      toast(`Exportado en: ${done.result?.path}`);
      if (done.result?.file) window.open(`/media/${encodeURIComponent(project.id)}/${done.result.file}`, '_blank');
    } catch (e: any) {
      toast(`No se pudo exportar: ${e.message}`);
    } finally {
      setRender(null);
    }
  };

  const ctx: Ctx = { store, id: route.p, sceneId: route.s, go, toast };
  const needsProject = route.screen !== 'proyectos';

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/proyectos" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="logo" aria-hidden="true" />{APP_NAME}
        </a>
        {route.p && (
          <nav className="nav" aria-label="Vistas">
            {TABS.map(([s, label]) => (
              <a key={s} href={`#/${s}?p=${encodeURIComponent(route.p!)}${route.s ? `&s=${route.s}` : ''}`} className={route.screen === s ? 'on' : ''}>{label}</a>
            ))}
          </nav>
        )}
        <div className="row spacer">
          {project && <strong>{project.name}</strong>}
          {project && <span className="pill">Cliente: {project.client ?? 'personal'}</span>}
          {project && <span className="muted small" aria-live="polite">{store.error ? `Error: ${store.error}` : store.saving ? 'Guardando…' : 'Guardado'}</span>}
        </div>
        <div className="row">
          {project && (
            <>
              <button className="btn sq" aria-label="Deshacer" title="Deshacer (⌘Z)" disabled={!store.canUndo} onClick={store.undo}>↶</button>
              <button className="btn sq" aria-label="Rehacer" title="Rehacer (⇧⌘Z)" disabled={!store.canRedo} onClick={store.redo}>↷</button>
            </>
          )}
          {claude === false && (
            <button className="btn rect" title="Abre una terminal: escribe /login y vuelve aquí" onClick={connect}>Conectar Claude</button>
          )}
          {claude === true && <span className="pill">Claude conectado</span>}
          <button className="btn rect" onClick={() => setTheme(theme === 'oscuro' ? 'claro' : 'oscuro')}>
            Tema {theme === 'oscuro' ? 'claro' : 'oscuro'}
          </button>
          {project && (
            <button className="btn primary" disabled={Boolean(render) || !project.scenes.length} onClick={openExport}>
              {render ? `Exportando ${Math.round(render.progress * 100)}%` : 'Exportar'}
            </button>
          )}
        </div>
      </header>

      {!needsProject || !route.p ? <Projects ctx={ctx} />
        : !project ? <div className="page"><p className="muted">{store.error ?? 'Cargando proyecto…'}</p></div>
        : route.screen === 'brief' ? <Brief ctx={ctx} />
        : route.screen === 'storyboard' ? <Storyboard ctx={ctx} />
        : route.screen === 'editor' ? <Editor ctx={ctx} />
        : route.screen === 'variantes' ? <div className="scroll"><Variantes ctx={ctx} /></div>
        : route.screen === 'audio' ? <Audio ctx={ctx} />
        : <Referencias ctx={ctx} />}

      {exportOpen && project && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
          <div className="modal card col" role="dialog" aria-modal="true" aria-label="Exportar video">
            <h2 style={{ fontSize: 22 }}>Exportar video</h2>
            <span className="small muted">Formato</span>
            <div className="opts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {([['9:16', 'Vertical', 'Reels, TikTok, historias'], ['4:5', 'Post vertical', 'Feed de Instagram'], ['1:1', 'Cuadrado', 'Feed y anuncios']] as const).map(([id, name, desc]) => (
                <button key={id} className={`opt ${formato === id ? 'on' : ''}`} aria-pressed={formato === id} onClick={() => setFormato(id)}>
                  <strong>{name} · {id}</strong><span className="muted small">{desc}</span>
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
            <span className="small muted">¿Dónde lo guardo?</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} value={carpeta} onChange={(e) => setCarpeta(e.target.value)} placeholder="Dentro del proyecto (carpeta renders)" />
              <button className="btn rect" onClick={pickFolder}>Elegir carpeta…</button>
            </div>
            <span className="small muted">Se recuerda para la próxima vez. Vacío = dentro del proyecto.</span>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setExportOpen(false)}>Cancelar</button>
              <button className="btn primary" onClick={exportar}>Exportar MP4</button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
};
