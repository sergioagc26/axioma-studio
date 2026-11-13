import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME, publishPack, publishText } from '@axioma/schema';
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
  /** Exportación en curso (con su avance) y la última terminada de este proyecto. */
  exporting: Job | null;
  lastExport: { id: string; path: string; file?: string } | null;
}

function parseHash(): { screen: Screen; p: string | null; s: string | null } {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const screen = (['proyectos', 'calendario', 'listo', 'brief', 'storyboard', 'editor', 'texto', 'variantes', 'audio', 'imagenes', 'referencias'] as Screen[]).find((x) => x === path) ?? 'proyectos';
  return { screen, p: q.get('p'), s: q.get('s') };
}

// En el orden del trabajo real: casi siempre se llega al Editor (modo automático).
// Lo de todos los días a la vista; lo avanzado, guardado en «Más».
const TABS: [Screen, IconName, string][] = [['brief', 'brief', 'Brief'], ['listo', 'result', 'Resultado'], ['editor', 'editor', 'Editor']];
const MORE: [Screen, IconName, string][] = [['texto', 'text', 'Texto'], ['storyboard', 'storyboard', 'Storyboard'], ['variantes', 'variants', 'Variantes'], ['audio', 'audio', 'Audio'], ['imagenes', 'image', 'Imágenes'], ['referencias', 'reference', 'Referencias']];

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
  const exportar = async () => {
    if (!project) return;
    setExportOpen(false);
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'render', formato, calidad, carpeta, lufs, ganchos: ganchos && formato !== 'todos' }),
      });
      const done = await waitJob(job, setRender);
      const files = done.result?.files as { id: string; label: string }[] | undefined;
      toast(files ? (formato === 'todos' ? `Los 3 formatos exportados en ${done.result?.path}.` : `${files.length} versiones exportadas en ${done.result?.path}: ${files.map((f) => `${f.id} · ${f.label}`).join(' · ')}`) : `Exportado en: ${done.result?.path}`);
      if (done.result?.file) { setLastExport({ id: project.id, path: String(done.result?.path ?? ''), file: done.result.file as string }); window.open(`/media/${encodeURIComponent(project.id)}/${done.result.file}`, '_blank'); }
    } catch (e: any) {
      toast(`No se pudo exportar: ${e.message}`);
    } finally {
      setRender(null);
    }
  };

  /** Exporta ya, sin preguntar nada: 9:16 con la calidad y la carpeta del proyecto. Lo usa la edición automática. */
  const [lastExport, setLastExport] = useState<{ id: string; path: string; file?: string } | null>(null);
  const exportNow = async () => {
    const p = store.project;
    if (!p || render) return;
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(p.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'render', formato: '9:16', calidad: p.export.quality, carpeta: p.export.folder ?? '', lufs: p.audio.targetLufs <= -15 ? -16 : -14, ganchos: false }),
      });
      const done = await waitJob(job, setRender);
      setLastExport({ id: p.id, path: String(done.result?.path ?? ''), file: done.result?.file as string | undefined });
      toast(`Video exportado en: ${done.result?.path}`);
    } catch (e: any) {
      toast(`No se pudo exportar: ${e.message}`);
    } finally {
      setRender(null);
    }
  };

  const ctx: Ctx = { store, id: route.p, sceneId: route.s, go, toast, exportVideo: () => openExport(), exportNow, exporting: render, lastExport: lastExport && lastExport.id === route.p ? lastExport : null };
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
          {project && <span className={`small ${store.error ? '' : 'muted'}`} style={store.error ? { color: 'var(--pinkText)' } : undefined} aria-live="polite">{store.error ? `Error: ${store.error}` : store.saving ? 'Guardando…' : '✓ Guardado'}</span>}
        </div>
        <div className="row">
          {project && (
            <>
              <button className="btn sq" aria-label="Deshacer" title="Deshacer (⌘Z)" disabled={!store.canUndo} onClick={store.undo}><Icon name="undo" /></button>
              <button className="btn sq" aria-label="Rehacer" title="Rehacer (⇧⌘Z)" disabled={!store.canRedo} onClick={store.redo}><Icon name="redo" /></button>
            </>
          )}
          {/* Quién atiende los pedidos de cambios. Con la IA local lista, conectar Claude queda en el mismo botón. */}
          {/* Todo es local: los pedidos los hace la IA de este computador (Ollama), sin gastar créditos. */}
          {claude === null ? null : local ? <span className="pill" title="Los pedidos de cambios los hace la IA de tu computador (Ollama), ajustada a lo que aguanta tu PC. No gasta créditos.">● IA local</span>
            : <span className="pill" title="Abre Ollama para que la IA local atienda los pedidos. Mientras tanto quedan guardados.">○ IA local apagada</span>}
          <button className="btn sq" aria-pressed={help} aria-label={help ? 'Ocultar las explicaciones' : 'Mostrar las explicaciones'} title={help ? 'Ocultar las explicaciones' : 'Mostrar las explicaciones de cada función'} style={help ? { borderColor: 'var(--pink)' } : undefined} onClick={() => setHelp(!help)}><Icon name="help" /></button>
          <button className="btn sq" aria-label={`Cambiar a tema ${theme === 'oscuro' ? 'claro' : 'oscuro'}`} title={`Tema ${theme === 'oscuro' ? 'claro' : 'oscuro'}`} onClick={() => setTheme(theme === 'oscuro' ? 'claro' : 'oscuro')}>
            <Icon name={theme === 'oscuro' ? 'sun' : 'moon'} />
          </button>
          {project && (
            <button className="btn primary" disabled={Boolean(render) || !project.scenes.length} onClick={openExport}>
              {render ? `Exportando ${Math.round(render.progress * 100)}%` : <><Icon name="export" />Exportar</>}
            </button>
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
              {([['9:16', 'Vertical', 'Reels, TikTok, historias'], ['4:5', 'Post vertical', 'Feed de Instagram'], ['1:1', 'Cuadrado', 'Feed y anuncios'], ['16:9', 'Horizontal', 'YouTube: el reel centrado'], ['todos', 'Los 3 verticales', '9:16, 4:5 y 1:1 de una vez']] as const).map(([id, name, desc]) => (
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
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
};
