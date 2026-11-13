import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { PresetPreview } from '../PresetPreview.tsx';
import { Icon } from '../Icon.tsx';
import type { IconName } from '../icons.ts';
import { reelScore, adviseProject, BASIC_TEXT_STYLES, CAPTION_DESIGNS, CAPTION_EFFECTS, FONT_GROUPS, SECTORS, TRENDS, TRENDS_DATE, MIN_CLIP, recommendPreset, applyVariant, buildTimeline, effectiveRanges, keywordOf, sceneLength, suggestVariants, BUILTIN_PRESETS, type Project, type Scene, VISION_TOPICS } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import type { Ctx } from '../App.tsx';
import { MOTION_NAMES, ROLE_LABEL } from '../SceneFrame.tsx';
import { api, applyPunchZooms, askAssistant, sceneSpeech, waitJob, type Job } from '../useProject.ts';

const COLORS = ['#FE2C55', '#25F4EE', '#FFFFFF', '#FACC15'];
/** Zonas seguras aproximadas de cada red (porcentaje del cuadro 9:16). */
const SAFE = {
  reel: { left: '6%', right: '14%', top: '12%', bottom: '22%' },
  historia: { left: '6%', right: '6%', top: '13%', bottom: '18%' },
  tiktok: { left: '6%', right: '17%', top: '10%', bottom: '26%' },
  short: { left: '6%', right: '15%', top: '9%', bottom: '20%' },
} as const;

const TEXT_STYLES: [Scene['textStyle'], string, string][] = [
  ['caja', 'Recuadro de color', 'El texto dentro de un recuadro del color elegido.'],
  ['resaltado', 'Palabra clave en color', 'Letras blancas con borde; la palabra clave más grande y en color.'],
  ['marcador', 'Marcador', 'Un trazo de marcador se pinta detrás de la palabra clave.'],
  ['gigante', 'Palabra gigante', 'La palabra clave enorme y el resto pequeño encima.'],
  ['subrayado', 'Subrayado', 'Letras blancas; la palabra clave se subraya con una línea que se dibuja.'],
  ['neon', 'Neón', 'Letras con brillo de neón en el color elegido.'],
  ['banda', 'Banda de titular', 'Una franja de color de lado a lado, como un titular.'],
  ['contorno', 'Contorno', 'Letras huecas con borde blanco; la palabra clave rellena de color.'],
  ['degradado', 'Degradado', 'Letras con degradado entre el color elegido y el secundario de la marca.'],
  ['sombra', 'Sombra retro', 'Letras blancas con una sombra dura de color, estilo cartel.'],
  ['etiqueta', 'Etiqueta', 'Una píldora oscura con un punto de color; discreta, para video de apoyo o datos.'],
  ['cinta', 'Tiras de color', 'Cada palabra en su tira torcida, entrando una tras otra. Divertido.'],
  ['sello', 'Sello', 'Cae como un sello de tinta y queda torcido. Para ofertas y avisos.'],
  ['glitch', 'Glitch', 'Letras con sombras de color que tiemblan. Rebelde y digital.'],
  ['trazo', 'Rodeado a mano', 'Un óvalo dibujado a mano rodea la palabra clave.'],
  ['apilado', 'Palabras apiladas', 'Una palabra por línea, cada una a todo el ancho. Editorial.'],
  ['tresd', 'Letras 3D', 'Letras con volumen: un canto de color que les da profundidad.'],
  ['fuego', 'Fuego', 'Degradado de amarillo a rojo con brillo. Para ofertas y retos.'],
  ['cromado', 'Cromado', 'Letras metálicas brillantes. Para autos, tecnología y lujo.'],
  ['burbuja', 'Burbuja', 'Letras de color con borde blanco grueso, tipo caricatura.'],
  ['retro', 'Retro en capas', 'Tres sombras de colores apiladas, estilo años 70.'],
  ['resplandor', 'Resplandor', 'Letras blancas con un halo de luz de color alrededor.'],
];
const BASIC = new Set<string>(BASIC_TEXT_STYLES);

const TEXT_ANIMS: [Scene['textAnim'], string][] = [
  ['subir', 'Sube'], ['pop', 'Salta'], ['rebote', 'Cae y rebota'], ['zoom', 'Llega desde cerca'], ['deslizar', 'Desliza'], ['girar', 'Entra girando'],
  ['fundido', 'Aparece'], ['desenfoque', 'Se enfoca'], ['barrido', 'Se revela'], ['palabra', 'Palabra por palabra'], ['maquina', 'Se escribe'],
  ['caer', 'Cae desde arriba'], ['derecha', 'Entra por la derecha'], ['voltear', 'Se voltea'], ['elastico', 'Elástico'], ['latido', 'Late'],
  ['golpe', 'Golpe con sacudida'], ['cortina', 'Sube tras una cortina'], ['estirar', 'Letras que se juntan'], ['parpadeo', 'Parpadea'],
];
const LOOK_NAMES: [Scene['look'], string][] = [
  ['normal', 'Normal'], ['vivo', 'Colores vivos'], ['calido', 'Cálido'], ['frio', 'Frío'], ['cine', 'Cine'], ['contraste', 'Alto contraste'],
  ['dramatico', 'Dramático'], ['suave', 'Suave'], ['vintage', 'Vintage'], ['sepia', 'Sepia'], ['bn', 'Blanco y negro'],
];
const CAMERA_NAMES: [Scene['camera'], string][] = [
  ['ninguno', 'Quieta'], ['acercar', 'Se acerca'], ['alejar', 'Se aleja'], ['izquierda', 'Paneo a la izquierda'], ['derecha', 'Paneo a la derecha'],
  ['arriba', 'Paneo hacia arriba'], ['abajo', 'Paneo hacia abajo'], ['pulso', 'Pulso al ritmo'], ['temblor', 'Cámara en mano'], ['orbita', 'Órbita alrededor (3D en fotos)'], ['foco', 'Cambio de foco (3D en fotos)'],
];
/** Campos para editar el contenido de un gráfico animado, según su plantilla. */
const MotionData: React.FC<{ scene: Scene; onChange: (d: Record<string, unknown>) => void }> = ({ scene, onChange }) => {
  const d = (scene.motionData ?? {}) as Record<string, any>;
  const tpl = scene.visual === 'texto' ? 'texto' : scene.motionTemplate;
  const text = (key: string, label: string, placeholder = '') => (
    <label className="field" key={key}>{label}
      <input key={scene.id + key + tpl + String(d[key] ?? '')} defaultValue={d[key] ?? ''} placeholder={placeholder} onBlur={(e) => e.target.value !== (d[key] ?? '') && onChange({ ...d, [key]: e.target.value || undefined })} />
    </label>
  );
  const num = (key: string, label: string) => (
    <label className="field" key={key}>{label}
      <input type="number" key={scene.id + key + tpl + String(d[key] ?? '')} defaultValue={d[key] ?? ''} placeholder="Tu dato" onBlur={(e) => onChange({ ...d, [key]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  );
  const lines = (label: string) => (
    <label className="field">{label} (uno por línea)
      <textarea rows={4} key={scene.id + tpl + JSON.stringify(d.items ?? [])} defaultValue={(Array.isArray(d.items) ? d.items : []).map((x: any) => (typeof x === 'string' ? x : `${x.label ?? ''}: ${x.value ?? ''}`)).join('\n')}
        onBlur={(e) => { const rows = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); onChange({ ...d, items: tpl === 'barras' ? rows.map((r) => { const [l, v] = r.split(':'); return { label: l.trim(), value: v === undefined || v.trim() === '' ? undefined : Number(v) }; }) : rows }); }} />
    </label>
  );
  if (tpl === 'pregunta') return text('pregunta', 'Pregunta');
  if (tpl === 'contador') return <>{num('valor', 'Número')}{text('prefijo', 'Antes del número', '$')}{text('sufijo', 'Después del número', ' h')}{text('etiqueta', 'Texto debajo')}</>;
  if (tpl === 'porcentaje') return <>{num('valor', 'Porcentaje (0–100)')}{text('etiqueta', 'Texto debajo')}</>;
  if (tpl === 'comparacion') return <>{text('tituloIzquierda', 'Título izquierdo', 'Antes')}{text('izquierda', 'Texto izquierdo')}{text('tituloDerecha', 'Título derecho', 'Ahora')}{text('derecha', 'Texto derecho')}</>;
  if (tpl === 'cita') return <>{text('texto', 'Frase')}{text('autor', 'Autor (opcional)')}</>;
  if (tpl === 'logo') return text('texto', 'Texto bajo el logo');
  if (tpl === 'barras') return <>{lines('Barras, como «Etiqueta: 10»')}{text('unidad', 'Unidad', ' min')}</>;
  if (tpl === 'lista' || tpl === 'checklist' || tpl === 'pasos') return lines('Puntos');
  return <span className="small muted">{tpl === 'palabras' ? 'Usa las palabras que se dicen en esta escena.' : 'Usa el texto en pantalla de esta escena.'}</span>;
};

/** Lista de tipografías agrupada. */
/** Lista agrupada con flechas para probar una opción tras otra sin abrir el menú. */
const Stepper: React.FC<{ label: string; items: { id: string; name: string; group: string }[]; value: string; onChange: (id: string) => void }> = ({ label, items, value, onChange }) => {
  const i = Math.max(0, items.findIndex((x) => x.id === value));
  const groups = [...new Set(items.map((x) => x.group))];
  const move = (n: number) => onChange(items[(i + n + items.length) % items.length].id);
  return (
    <label className="field">{label}
      <span className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        <button type="button" className="btn sq" aria-label="Anterior" onClick={() => move(-1)}><Icon name="back" /></button>
        <select style={{ flex: 1, minWidth: 0 }} value={items[i].id} onChange={(e) => onChange(e.target.value)}>
          {groups.map((g) => <optgroup key={g} label={g}>{items.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
        </select>
        <button type="button" className="btn sq" aria-label="Siguiente" onClick={() => move(1)}><Icon name="back" style={{ transform: 'scaleX(-1)' }} /></button>
      </span>
    </label>
  );
};

// Tipografías instaladas en este computador: se piden una vez y se comparten entre todas las listas.
let systemFontsMemo: Promise<string[]> | null = null;
const loadSystemFonts = () => (systemFontsMemo ??= api<{ fonts: string[] }>('/api/fonts').then((d) => d.fonts).catch(() => []));
const FontOptions: React.FC = () => {
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => { let on = true; loadSystemFonts().then((f) => { if (on) setMine(f); }); return () => { on = false; }; }, []);
  return (
    <>
      {FONT_GROUPS.map(([g, fonts]) => <optgroup key={g} label={g}>{fonts.map((f) => <option key={f}>{f}</option>)}</optgroup>)}
      {mine.length > 0 && <optgroup label={`De tu computador (${mine.length})`}>{mine.map((f) => <option key={f}>{f}</option>)}</optgroup>}
    </>
  );
};
/** Nueve posiciones rápidas para el texto (x, y de 0 a 1), dentro de las zonas seguras. */
const GRID: [number, number][] = [0.22, 0.45, 0.62].flatMap((y) => [0.3, 0.5, 0.7].map((x) => [x, y] as [number, number]));

/** Muestras rápidas más una rueda para elegir cualquier color. */
const ColorRow: React.FC<{ value: string; label: string; swatches?: string[]; onPick: (c: string) => void }> = ({ value, label, swatches = COLORS, onPick }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#FE2C55';
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  return (
    <div className="row" aria-label={label}>
      {swatches.map((c) => (
        <button key={c} className={`swatch ${hex.toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`${label}: ${c}`} onClick={() => onPick(c)} />
      ))}
      <label className="wheel" title="Elegir cualquier color">
        <input type="color" value={draft} aria-label={`${label}: elegir cualquier color`}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.toUpperCase() !== hex.toUpperCase() && onPick(draft.toUpperCase())} />
      </label>
      <input className="input hex" value={draft.toUpperCase()} aria-label={`${label}: código`} maxLength={7}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => /^#[0-9a-f]{6}$/i.test(draft) && draft.toUpperCase() !== hex.toUpperCase() ? onPick(draft.toUpperCase()) : setDraft(hex)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
};

/** Barra genérica que guarda al soltar (para no llenar el historial de deshacer). */
const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onCommit: (v: number) => void }> = ({ label, value, min, max, step, show, onCommit }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">{label}: {show(v)}
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => v !== value && onCommit(+v.toFixed(2))} onKeyUp={() => v !== value && onCommit(+v.toFixed(2))} />
    </label>
  );
};

/** Barra para recortar segundos de una escena; guarda al soltar. */
const TrimSlider: React.FC<{ label: string; value: number; max: number; onCommit: (v: number) => void }> = ({ label, value, max, onCommit }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const top = Math.max(max, value);
  return (
    <label className="field">{label}: {v.toFixed(1)} s
      <input type="range" min={0} max={top} step={0.05} value={Math.min(v, top)} disabled={top <= 0} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onCommit(+v.toFixed(2))} onKeyUp={() => v !== value && onCommit(+v.toFixed(2))} />
    </label>
  );
};

const SizeSlider: React.FC<{ value: number; onCommit: (v: number) => void }> = ({ value, onCommit }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">Tamaño de letra: {v}
      <input type="range" min={40} max={130} step={2} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => v !== value && onCommit(v)} onKeyUp={() => v !== value && onCommit(v)} />
    </label>
  );
};
const ROLES = Object.keys(ROLE_LABEL) as Scene['role'][];

type Spans = { id: string; from: number; dur: number }[];
/** Se vuelve a suscribir cuando el reproductor se vuelve a montar (tras «Volver a cargar»). */
function usePlayerFrame(player: React.RefObject<PlayerRef | null>, playerKey: number) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    setFrame(p.getCurrentFrame());
    const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', on);
    return () => p.removeEventListener('frameupdate', on);
  }, [player, playerKey]);
  return frame;
}
/** Contador de tiempo: es lo único que se redibuja en cada fotograma, no el editor entero. */
const TimeCounter: React.FC<{ player: React.RefObject<PlayerRef | null>; playerKey: number; total: number; fps: number }> = ({ player, playerKey, total, fps }) => {
  const frame = usePlayerFrame(player, playerKey);
  const fmt = (f: number) => `${Math.floor(f / fps / 60)}:${String(Math.floor(f / fps) % 60).padStart(2, '0')}`;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(frame)} / {fmt(total)}</span>;
};
/** Cursor rojo de una pista: se mueve solo, sin redibujar la línea de tiempo. */
const Playhead: React.FC<{ player: React.RefObject<PlayerRef | null>; playerKey: number; total: number }> = ({ player, playerKey, total }) => {
  const frame = usePlayerFrame(player, playerKey);
  return <div className="playhead" style={{ left: `${(frame / total) * 100}%` }} />;
};
/** Botón redondo: muestra pausa mientras suena. */
const PlayButton: React.FC<{ player: React.RefObject<PlayerRef | null>; playerKey: number }> = ({ player, playerKey }) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    setOn(p.isPlaying());
    const play = () => setOn(true);
    const pause = () => setOn(false);
    p.addEventListener('play', play);
    p.addEventListener('pause', pause);
    p.addEventListener('ended', pause);
    return () => { p.removeEventListener('play', play); p.removeEventListener('pause', pause); p.removeEventListener('ended', pause); };
  }, [player, playerKey]);
  return (
    <button className="btn primary sq" style={{ borderRadius: 999, width: 44, height: 44 }} aria-label={on ? 'Pausar' : 'Reproducir'} onClick={() => player.current?.toggle()}>
      <Icon name={on ? 'pause' : 'play'} />
    </button>
  );
};
/** Aviso cuando la vista previa se traba: un botón vuelve a montar el reproductor. */
const PreviewStuck: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.82)', color: '#fff', padding: 16, textAlign: 'center' }}>
    <div className="col" style={{ gap: 10, alignItems: 'center', maxWidth: 260 }}>
      <Icon name="warning" size={28} />
      <strong>La vista previa se trabó</strong>
      <span className="small" style={{ opacity: 0.85 }}>Tu video no se perdió. Vuelve a cargarla para seguir.</span>
      <button className="btn primary" onClick={onRetry}><Icon name="refresh" />Volver a cargar la vista previa</button>
    </div>
  </div>
);
/**
 * Archivos que ya no existen en el servidor (p. ej. tras Deshacer después de quitar un filtro de
 * color o la cámara lenta, que borran sus archivos). Se revisa cada vez que cambia la lista.
 */
function useMissing(urls: string[]) {
  const key = urls.join('\n');
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    if (!urls.length) { setMissing([]); return; }
    let on = true;
    Promise.all(urls.map((u) => fetch(u, { headers: { Range: 'bytes=0-0' } }).then((r) => { void r.body?.cancel(); return r.status === 404 ? u : null; }).catch(() => null)))
      .then((xs) => { if (on) setMissing(xs.filter((x): x is string => Boolean(x))); });
    return () => { on = false; };
  }, [key]);
  return missing;
}

/** Grupo plegable que recuerda si lo dejaste abierto (en este navegador) y muestra su valor actual. */
/** Un icono por panel: se reconoce de un vistazo. */
const GROUP_ICON: Record<string, IconName> = {
  sugerencias: 'bulb', estilos: 'palette', subtitulos: 'captions', color: 'color', herramientas: 'wand', acabados: 'finish', revision: 'eye', quitadas: 'trash',
  variantes: 'variants', motion: 'chart', texto: 'title', imagen: 'camera', fondo: 'layers', dice: 'speech',
};
const Group: React.FC<{ id: string; title: string; hint?: string; defaultOpen?: boolean; onOpen?: () => void; children: React.ReactNode }> = ({ id, title, hint, defaultOpen = false, onOpen, children }) => {
  const key = `axioma:grupo:${id}`;
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? defaultOpen : v === '1'; } catch { return defaultOpen; }
  });
  return (
    <details className="grp" open={open} onToggle={(e) => {
      const now = (e.target as HTMLDetailsElement).open;
      if (now === open) return;
      setOpen(now);
      try { localStorage.setItem(key, now ? '1' : '0'); } catch { /* sin almacenamiento: no pasa nada */ }
      if (now) onOpen?.();
    }}>
      <summary><span className="grp-title">{GROUP_ICON[id] ? <Icon name={GROUP_ICON[id]} style={{ marginRight: 8 }} /> : null}{title}</span>{hint ? <span className="grp-hint">{hint}</span> : null}</summary>
      {/* Lo plegado no se dibuja: el editor abre rápido y no gasta memoria en lo que no se ve. */}
      {open ? <div className="col">{children}</div> : null}
    </details>
  );
};

export const Editor: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  // Aspecto de imagen que va con lo que la app vio en el video.
  const seenLook = VISION_TOPICS.find((t) => t.id === store.vision?.topic)?.look ?? null;
  const player = useRef<PlayerRef>(null);
  // Vista previa: si se traba (error al dibujar o un video que no carga), se avisa y se puede volver a montar.
  const [playerKey, setPlayerKey] = useState(0);
  const [previewErr, setPreviewErr] = useState(false);
  const retryPreview = () => { setPreviewErr(false); setPlayerKey((k) => k + 1); };
  const [safe, setSafe] = useState(true);
  // Zona libre según la red (lo de fuera lo tapan los botones, el perfil o la barra de respuesta).
  const [safeNet, setSafeNet] = useState<keyof typeof SAFE>(() => /historia/i.test(project.brief.formato ?? '') ? 'historia' : /tiktok/i.test(project.brief.formato ?? '') ? 'tiktok' : /short/i.test(project.brief.formato ?? '') ? 'short' : 'reel');
  const media = (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;

  // Cámara lenta suave por escena (se crean los fotogramas intermedios en el servidor).
  const [slowing, setSlowing] = useState('');
  const slowMotion = async (sceneId: string, speed: number) => {
    setSlowing(speed < 1 ? 'Creando los fotogramas intermedios…' : 'Volviendo a velocidad normal…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'camara-lenta', sceneId, speed }) });
      await waitJob(job, (j) => setSlowing(j.message || 'Creando los fotogramas intermedios…'));
      const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
      store.replace(d.project);
      ctx.toast(speed < 1 ? 'Cámara lenta lista y suave.' : 'Escena a velocidad normal.');
    } catch (e: any) { ctx.toast(e.message); } finally { setSlowing(''); }
  };

  const [allAdvice, setAllAdvice] = useState(false);
  // Serie en partes (reels largos).
  const reelLength = useMemo(() => project.scenes.reduce((a, sc) => a + sceneLength(sc), 0), [project]);
  const [partMax, setPartMax] = useState(60);
  const [splitting, setSplitting] = useState('');
  const makeSeries = async () => {
    setSplitting('Creando las partes…');
    try {
      const d = await api<{ ids: string[]; names: string[] }>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'serie', max: partMax }) });
      ctx.toast(`Serie creada: ${d.names.length} partes. Abriendo la parte 1.`);
      ctx.go('listo', { p: d.ids[0], s: null });
    } catch (e: any) { ctx.toast(e.message); } finally { setSplitting(''); }
  };
  const score = useMemo(() => (project.scenes.length ? reelScore(project, store.transcript) : null), [project, store.transcript]);
  // Revisión del cliente: enlace y comentarios.
  const [review, setReview] = useState<{ token: string; exported: boolean; network: boolean; links: string[]; local: string } | null>(null);
  const shareReview = async (nuevo: boolean) => {
    try {
      const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: nuevo ? 'revision-nueva' : 'revision' }) });
      setReview(d);
      if (nuevo) ctx.toast('Enlace nuevo creado: el anterior ya no funciona.');
    } catch (e: any) { ctx.toast(e.message); }
  };
  useEffect(() => { if (project.review?.token) shareReview(false); }, [project.id]);
  const resolveRequest = async (requestId: string, status: 'hecha' | 'descartada') => {
    try {
      const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'resolver-peticion', requestId, status }) });
      store.replace(d.project);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Sube el logo a la marca del cliente. */
  const uploadLogo = async (file: File) => {
    try {
      await api(`/api/logo?id=${encodeURIComponent(project.id)}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      await store.reloadExtras();
      ctx.toast('Logo guardado en la marca.');
    } catch (e: any) { ctx.toast(e.message); }
  };
  // Subtítulos en otro idioma (traducidos con la IA local; la voz no cambia).
  const [translating, setTranslating] = useState('');
  const captionLanguage = async (idioma: string) => {
    setTranslating(idioma ? 'Traduciendo los subtítulos…' : 'Volviendo al idioma del video…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'idioma-subtitulos', idioma }) });
      await waitJob(job, (j) => setTranslating(j.message || 'Traduciendo…'));
      await reloadProject();
      await store.reloadExtras();
    } catch (e: any) { ctx.toast(e.message); } finally { setTranslating(''); }
  };
  // Calidad del video (videos de baja resolución): rehace el master desde el original.
  const [improving, setImproving] = useState('');
  const setQuality = async (calidad: 'normal' | 'nitido') => {
    setImproving('Rehaciendo el video…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'calidad', calidad }) });
      await waitJob(job, (j) => setImproving(j.message || 'Rehaciendo el video…'));
      await reloadProject();
      ctx.toast(calidad === 'nitido' ? 'Video más nítido.' : 'Video fiel al original.');
    } catch (e: any) { ctx.toast(e.message); } finally { setImproving(''); }
  };
  // Reencuadre al hablante (videos horizontales con varias personas).
  const [speakerBusy, setSpeakerBusy] = useState('');
  const followSpeaker = async (on: boolean) => {
    setSpeakerBusy(on ? 'Viendo quién habla…' : 'Volviendo al encuadre normal…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'seguir-hablante', on }) });
      const done = await waitJob(job, (j) => setSpeakerBusy(j.message));
      const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
      store.replace(d.project);
      await store.reloadExtras();
      const r = done.result as { people?: number; turns?: number } | undefined;
      ctx.toast(!on ? 'Encuadre normal: sigue a la cara principal.' : (r?.people ?? 0) < 2 ? 'Solo encontré una persona en cuadro: el encuadre la sigue a ella.' : `Listo: ${r?.people} personas; el encuadre cambia ${Math.max(0, (r?.turns ?? 1) - 1)} veces según quién habla.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setSpeakerBusy(''); }
  };

  // Tras Deshacer puede volver un filtro de color o una cámara lenta cuyos archivos ya se borraron:
  // en ese caso la vista previa usa el video normal en vez de quedarse en negro.
  const lutUrl = project.finish.lut ? `${media('proxies/proxy-lut.mp4')}?v=${encodeURIComponent(project.finish.lut.name + project.finish.lut.strength)}` : '';
  const slowUrls = project.scenes.flatMap((s) => ((s.speed ?? 1) < 1 ? (s.slowFiles ?? []).map((f) => media(f.file)) : []));
  const missing = useMissing([lutUrl, ...slowUrls].filter(Boolean));
  const lutGone = Boolean(lutUrl) && missing.includes(lutUrl);
  useEffect(() => {
    if (missing.length) ctx.toast(lutGone ? 'El filtro de color ya no está aplicado: vuelve a elegirlo en «Color».' : 'La cámara lenta de una escena ya no está: vuelve a elegirla en «Imagen y cámara».');
  }, [missing.join('|')]);
  const shown = useMemo<Project>(() => {
    if (!missing.length) return project;
    const p = structuredClone(project);
    for (const s of p.scenes) if (s.slowFiles) s.slowFiles = s.slowFiles.filter((f) => !missing.includes(media(f.file)));
    return p;
  }, [project, missing]);
  const timeline = useMemo(() => buildTimeline(shown, store.transcript, {
    video: lutUrl && !lutGone ? lutUrl : media(project.source.proxy ?? 'media/master.mp4'),
    voice: project.audio.processedVoice ? media(project.audio.processedVoice) : undefined,
    music: project.audio.music ? media(project.audio.music) : undefined,
    asset: media,
    brand: store.brand,
    voiceover: store.extras?.voiceover,
    cutout: store.extras?.cutout,
    cutoutCoverage: store.extras?.cutoutCoverage,
    depth: store.extras?.depth,
    faces: store.extras?.faces, speakers: store.extras?.speakers, captionWords: store.extras?.captionWords,
    transitions: store.extras?.transitions,
  }), [shown, lutGone, store.transcript, store.brand, store.extras]);

  /** Inicio y duración (en frames) de cada escena en la salida. */
  const spans = useMemo(() => project.scenes.map((s) => {
    const clips = timeline.clips.filter((c) => c.sceneId === s.id);
    const from = clips[0]?.fromFrame ?? 0;
    return { id: s.id, from, dur: clips.reduce((a, c) => a + c.durationInFrames, 0) };
  }), [project.scenes, timeline]);

  // La escena elegida no cambia mientras suena: el panel no salta y los ajustes caen donde miras.
  const selId = ctx.sceneId && project.scenes.some((s) => s.id === ctx.sceneId) ? ctx.sceneId : project.scenes[0]?.id;
  const scene = project.scenes.find((s) => s.id === selId);
  const idx = project.scenes.findIndex((s) => s.id === selId);

  // Al pausar, el panel pasa a la escena donde se paró. También se vigila que la vista previa no se trabe.
  const live = useRef({ spans, sceneId: ctx.sceneId, go: ctx.go });
  live.current = { spans, sceneId: ctx.sceneId, go: ctx.go };
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    let stall = 0;
    const onPause = () => {
      const f = p.getCurrentFrame();
      const id = live.current.spans.find((x) => f >= x.from && f < x.from + x.dur)?.id;
      if (id && id !== live.current.sceneId) live.current.go('editor', { s: id });
    };
    const onWaiting = () => { clearTimeout(stall); stall = window.setTimeout(() => setPreviewErr(true), 15000); };
    const onResume = () => clearTimeout(stall);
    p.addEventListener('pause', onPause);
    p.addEventListener('waiting', onWaiting);
    p.addEventListener('resume', onResume);
    return () => { clearTimeout(stall); p.removeEventListener('pause', onPause); p.removeEventListener('waiting', onWaiting); p.removeEventListener('resume', onResume); };
  }, [playerKey, timeline.durationInFrames > 0]);
  // Un video que no carga no avisa al reproductor: el error sale en la ventana.
  useEffect(() => {
    const on = (e: ErrorEvent) => { if (e.error?.name === 'MediaPlaybackError' || /MediaPlaybackError|error loading|could not play/i.test(e.message ?? '')) setPreviewErr(true); };
    addEventListener('error', on);
    return () => removeEventListener('error', on);
  }, []);

  // Al abrir el editor en una escena (o cambiarla desde otra pantalla), la vista previa salta a ella.
  useEffect(() => {
    const s = spans.find((x) => x.id === ctx.sceneId);
    const f = player.current?.getCurrentFrame() ?? 0;
    if (s && (f < s.from || f >= s.from + s.dur)) player.current?.seekTo(s.from);
  }, [ctx.sceneId]);

  const select = (id: string) => {
    const s = spans.find((x) => x.id === id);
    if (s) player.current?.seekTo(s.from);
    ctx.go('editor', { s: id });
  };

  // Atajos: espacio reproduce/pausa, flechas cambian de escena (se registra una sola vez).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); player.current?.toggle(); }
    if (e.key === 'ArrowRight' && project.scenes[idx + 1]) select(project.scenes[idx + 1].id);
    if (e.key === 'ArrowLeft' && project.scenes[idx - 1]) select(project.scenes[idx - 1].id);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  // Siempre hay 3 variantes para la escena elegida: las guardadas o, si no hay, sugeridas al instante.
  const quick = useMemo(
    () => {
      if (!scene) return [];
      if (scene.variants.length) return scene.variants.slice(0, 4);
      // Sin texto real (p. ej. montajes sin voz) no se ofrece poner el marcador «[TU TEXTO]» en el video.
      return suggestVariants(project, scene, store.transcript, 0, seenLook)
        .filter((v) => !(v.visual === 'texto' && (!v.onScreenText || v.onScreenText.includes('[TU TEXTO]'))))
        .map((v) => (v.onScreenText?.includes('[TU TEXTO]') ? { ...v, onScreenText: undefined } : v));
    },
    [project, scene, store.transcript],
  );

  /** Arrastre del borde de una escena: recorta (hacia dentro) o alarga (hacia fuera). */
  const lane = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ side: 'l' | 'r'; delta: number } | null>(null);
  const startDrag = (side: 'l' | 'r') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const width = lane.current?.getBoundingClientRect().width ?? 1;
    const perPx = total / timeline.fps / width; // segundos por píxel
    const x0 = e.clientX;
    let delta = 0;
    const move = (ev: PointerEvent) => { delta = (ev.clientX - x0) * perPx; setDrag({ side, delta }); };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      setDrag(null);
      if (Math.abs(delta) < 0.03) return;
      // Borde izquierdo a la derecha = quitar del inicio; borde derecho a la izquierda = quitar del final.
      edit((s) => {
        if (side === 'l') s.trimStart = +(s.trimStart + delta).toFixed(2);
        else s.trimEnd = +(s.trimEnd - delta).toFixed(2);
      });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  /** Divide en dos la escena que está bajo el cursor de reproducción. */
  const split = () => {
    const frame = player.current?.getCurrentFrame() ?? 0;
    const clip = timeline.clips.find((c) => frame >= c.fromFrame && frame < c.fromFrame + c.durationInFrames);
    if (!clip) return;
    const at = (clip.sourceStartFrame + (frame - clip.fromFrame)) / timeline.fps;
    const i = project.scenes.findIndex((s) => s.id === clip.sceneId);
    const ranges = effectiveRanges(project.scenes[i], project.source.duration);
    const a = ranges.filter((r) => r.end <= at).concat(ranges.filter((r) => r.start < at && r.end > at).map((r) => ({ start: r.start, end: at })));
    const b = ranges.filter((r) => r.start < at && r.end > at).map((r) => ({ start: at, end: r.end })).concat(ranges.filter((r) => r.start >= at));
    const len = (x: typeof ranges) => x.reduce((n, r) => n + r.end - r.start, 0);
    if (len(a) < MIN_CLIP || len(b) < MIN_CLIP) return ctx.toast('Mueve el cursor más al centro de la escena para dividirla.');
    const next = Math.max(0, ...project.scenes.map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1;
    const id = `s${String(next).padStart(2, '0')}`;
    store.update((p) => {
      const s = p.scenes[i];
      const second = { ...structuredClone(s), id, ranges: b, trimStart: 0, trimEnd: 0, transition: undefined, onScreenText: undefined, sfx: [], variants: [], chosenVariant: undefined, punchZoom: false };
      s.ranges = a; s.trimStart = 0; s.trimEnd = 0;
      p.scenes.splice(i + 1, 0, second);
    });
    ctx.go('editor', { s: id });
  };

  const fullLength = scene ? scene.ranges.reduce((a, r) => a + Math.max(0, r.end - r.start), 0) : 0;

  const edit = (fn: (s: Scene) => void) => store.update((p) => {
    const s = p.scenes.find((x) => x.id === selId);
    if (s) fn(s);
  });

  // La app estudia lo que se dice y recomienda un estilo profesional.
  const rec = useMemo(() => recommendPreset(project, store.transcript, store.vision), [project.kind, store.transcript, store.vision]);
  const transitions = store.extras?.transitions ?? [];
  /** Unión abierta: id de la escena que entra. */
  const [joint, setJoint] = useState<string | null>(null);
  const jointIdx = project.scenes.findIndex((s) => s.id === joint);
  const jointScene = jointIdx >= 0 ? project.scenes[jointIdx] : null;
  const previewJoint = (i: number) => {
    const s = spans[i];
    if (!s) return;
    player.current?.seekTo(Math.max(0, s.from - Math.round(timeline.fps * 0.8)));
    player.current?.play();
  };
  const [trText, setTrText] = useState('');
  const [busy, setBusy] = useState('');

  /** Recomienda una transición para cada escena según el estilo del reel. */
  const recommend = async () => {
    try {
      const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'recomendar-transiciones' }) });
      store.replace(d.project);
      const used = d.advice.filter((a: { transition: string | null }) => a.transition).length;
      ctx.toast(`Transiciones recomendadas: ${used} con efecto y ${d.advice.length - used} con corte seco. Si no te gustan, pulsa Deshacer.`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  /** La IA local crea una transición nueva a partir de la descripción y la aplica a la escena elegida. */
  const createTransition = async () => {
    const desc = trText.trim();
    if (!desc || !scene) return;
    setBusy('Enviando a la IA local…');
    try {
      const target = jointScene?.id ?? (idx > 0 ? scene.id : project.scenes[1]?.id);
      const r = await askAssistant(project.id, `Crea una transición nueva con crear_transicion según esta descripción: "${desc}". Tiene que encajar con el estilo del reel (preset ${project.presetId}).${target ? ` Luego aplícala a la escena ${target} con poner_transicion.` : ''}`, target, setBusy);
      setTrText('');
      await store.reloadExtras();
      ctx.toast(r.saved || r.text.length <= 220 ? r.text : r.text.slice(0, 218) + '…');
    } catch (e: any) { ctx.toast(`La IA local no pudo hacerlo: ${e.message}`); } finally { setBusy(''); }
  };

  /** Guarda cómo está vestido el reel ahora como un estilo propio, para reutilizarlo. */
  const saveStyle = async () => {
    const name = window.prompt('Nombre para tu estilo:', `Estilo ${project.client ?? 'propio'}`);
    if (!name?.trim()) return;
    try {
      const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'guardar-estilo', name: name.trim() }) });
      store.setPresets(d.presets);
      ctx.toast(`Estilo «${d.preset.name}» guardado. Aparece en la lista para este cliente.`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Estilos propios del cliente (los de la app no se tocan): cambiar el nombre o quitarlos. */
  const builtinIds = useMemo(() => new Set(BUILTIN_PRESETS.map((x) => x.id)), []);
  const presetUrl = (presetId: string) => `/api/presets?id=${encodeURIComponent(project.id)}&preset=${encodeURIComponent(presetId)}`;
  const renameStyle = async (presetId: string, now: string) => {
    const name = window.prompt('Nuevo nombre para el estilo:', now);
    if (!name?.trim() || name.trim() === now) return;
    try {
      store.setPresets(await api(presetUrl(presetId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }));
      ctx.toast(`Estilo renombrado a «${name.trim()}».`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  const deleteStyle = async (presetId: string, name: string) => {
    if (!window.confirm(`¿Quitar el estilo «${name}»? Los videos que ya lo usan no cambian.`)) return;
    try {
      store.setPresets(await api(presetUrl(presetId), { method: 'DELETE' }));
      ctx.toast(`Estilo «${name}» quitado.`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  // Nicho para las tendencias: el de la marca o el que corresponde a lo que se ve en el video.
  const sector = store.kit?.sector || VISION_TOPICS.find((t) => t.id === store.vision?.topic)?.sector || null;
  const trend = sector ? TRENDS[sector] ?? TRENDS.otro : null;
  // ¿Hay voz? En montajes sin voz no se muestran paneles ni pistas de voz vacíos.
  const hasSpeech = Boolean(store.transcript?.words?.length);

  // Partes con voz que quedaron fuera del reel (para recuperarlas una por una).
  const removed = useMemo(() => {
    const words = store.transcript?.words ?? [];
    const kept = project.scenes.flatMap((sc) => effectiveRanges(sc, project.source.duration));
    const inside = (t: number) => kept.some((r) => t >= r.start && t < r.end);
    const out: { start: number; end: number; text: string }[] = [];
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (inside(mid)) continue;
      const last = out[out.length - 1];
      if (last && w.start - last.end < 0.6) { last.end = w.end; last.text += ` ${w.text}`; }
      else out.push({ start: w.start, end: w.end, text: w.text });
    }
    return out;
  }, [project, store.transcript]);
  /** Devuelve una parte quitada a la escena que va justo antes en el tiempo. */
  const restore = (r: { start: number; end: number }) => store.update((p) => {
    const ordered = p.scenes.map((sc, i) => ({ i, at: sc.ranges[0]?.start ?? 0 }));
    const before = ordered.filter((x) => x.at <= r.start).sort((a, b) => b.at - a.at)[0] ?? ordered[0];
    const sc = p.scenes[before.i];
    sc.ranges = [...sc.ranges, { start: Math.max(0, r.start - 0.08), end: r.end + 0.08 }].sort((a, b) => a.start - b.start);
  });
  const [cutting, setCutting] = useState('');
  const [grading, setGrading] = useState('');
  const [pendingLut, setPendingLut] = useState('');
  const [luts, setLuts] = useState<{ id: string; name: string; description: string }[]>([]);
  useEffect(() => { api('/api/luts').then(setLuts).catch(() => {}); }, []);
  const [lutStrength, setLutStrength] = useState(project.finish.lut?.strength ?? 0.8);
  // Tras Deshacer (o al cambiar el filtro) la barra muestra la fuerza real.
  useEffect(() => setLutStrength(project.finish.lut?.strength ?? 0.8), [project.finish.lut?.strength]);
  /** Solo rehace el color si la fuerza cambió de verdad (un clic sin mover no relanza nada). */
  const commitStrength = () => { if (project.finish.lut && Math.abs(lutStrength - project.finish.lut.strength) > 0.001) setLut('actual', lutStrength); };
  /** Aplica un LUT incluido ('' lo quita) o cambia la fuerza del actual. */
  const setLut = async (lut: string, fuerza = lutStrength) => {
    try {
      if (!lut && !project.finish.lut) return;
      setGrading('Aplicando el color…');
      if (lut !== 'actual') setPendingLut(lut);
      const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lut === '' ? { op: 'quitar-lut' } : { op: 'lut', lut: lut === 'actual' ? undefined : lut, fuerza }) });
      if (d.project) store.replace(d.project);
      else { await waitJob(d, (j) => setGrading(j.message || 'Aplicando el color…')); await reloadProject(); ctx.toast('Color aplicado a todo el video.'); }
    } catch (e: any) { ctx.toast(`No se pudo aplicar el filtro de color: ${e.message}`); } finally { setGrading(''); setPendingLut(''); }
  };
  const uploadLut = async (file: File) => {
    setGrading('Subiendo el filtro…');
    try {
      const job = await api<Job>(`/api/lut?id=${encodeURIComponent(project.id)}&filename=${encodeURIComponent(file.name)}&fuerza=${lutStrength}`, { method: 'POST', body: file });
      await waitJob(job, (j) => setGrading(j.message || 'Aplicando el color…'));
      await reloadProject();
      ctx.toast(`Filtro «${file.name.replace(/\.cube$/i, '')}» aplicado.`);
    } catch (e: any) { ctx.toast(`No se pudo usar ese filtro: ${e.message}`); } finally { setGrading(''); }
  };
  /** Iguala el color a una imagen de referencia (se crea un LUT a la medida). */
  const matchReference = async (file: File) => {
    setGrading('Subiendo la referencia…');
    try {
      const job = await api<Job>(`/api/color-referencia?id=${encodeURIComponent(project.id)}&filename=${encodeURIComponent(file.name)}&fuerza=${lutStrength}`, { method: 'POST', body: file });
      await waitJob(job, (j) => setGrading(j.message || 'Igualando el color…'));
      await reloadProject();
      ctx.toast(`Color igualado a «${file.name}». Ajusta la fuerza si quieres menos.`);
    } catch (e: any) { ctx.toast(`No se pudo igualar el color: ${e.message}`); } finally { setGrading(''); }
  };
  const hasTeaser = project.scenes[0]?.id === 'adelanto';
  const teaser = async (on: boolean) => {
    try {
      const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: on ? 'adelanto' : 'quitar-adelanto' }) });
      store.replace(d.project);
      ctx.toast(on ? `Adelanto puesto: «${d.teaser.text}»` : 'Adelanto quitado.');
      player.current?.seekTo(0);
    } catch (e: any) { ctx.toast(e.message); }
  };
  const reloadProject = async () => {
    const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
    store.replace(d.project);
    await store.reloadExtras();
  };
  // Sugerencias que la app detecta; el usuario decide cuáles aplicar.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const advice = useMemo(() => adviseProject(project, store.transcript).filter((a) => !dismissed.includes(a.id)), [project, store.transcript, dismissed]);
  // Sugerencia que se está aplicando (con su mensaje): mientras tanto no se puede lanzar otra.
  const [applying, setApplying] = useState<{ id: string; msg: string } | null>(null);
  const applyAdvice = async (a: ReturnType<typeof adviseProject>[number]) => {
    if (applying) return;
    if (a.go) return ctx.go(a.go, {});
    if (a.fix) { store.update((p) => a.fix!(p)); return ctx.toast(`Aplicado: ${a.title.toLowerCase()}.`); }
    setApplying({ id: a.id, msg: 'Aplicando…' });
    try {
      const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.op) });
      if (d.id && d.status) await waitJob(d, (j) => setApplying({ id: a.id, msg: j.message || 'Aplicando…' }));
      await reloadProject();
      ctx.toast(`Aplicado: ${a.title.toLowerCase()}.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setApplying(null); }
  };
  // Clips para redes sacados del video largo (solo si el original dura más de 45 s).
  type Clip = { start: number; end: number; title: string; score: number; hook: number; flow: number; value: number; reasons: string[] };
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [makingClip, setMakingClip] = useState('');
  const longVideo = project.source.duration > 45 && !project.clipRange && project.kind === 'hablado';
  const [findingClips, setFindingClips] = useState(false);
  const findClips = async () => {
    setFindingClips(true);
    try { setClips((await api<{ clips: Clip[] }>(`/api/clips?id=${encodeURIComponent(project.id)}`)).clips); } catch (e: any) { ctx.toast(e.message); } finally { setFindingClips(false); }
  };
  const makeClip = async (c: Clip, n: number) => {
    setMakingClip('Creando el video de este tramo…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'crear-clip', ...c, n }) });
      const done = await waitJob(job, (j) => setMakingClip(j.message || 'Creando…'));
      ctx.toast(`Video listo. ${(done.result?.summary as string[] ?? []).join(' ')}`);
      ctx.go('listo', { p: done.result?.id, s: null });
    } catch (e: any) { ctx.toast(`No se pudo crear el video: ${e.message}`); } finally { setMakingClip(''); }
  };
  /** Recorta a la persona de todo el video; después cada escena puede cambiar de fondo. */
  const cutBackground = async () => {
    setCutting('Recortando a la persona…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'recortar-fondo' }) });
      await waitJob(job, (j) => setCutting(j.message || 'Recortando a la persona…'));
      await reloadProject();
      ctx.toast('Persona recortada. Elige el fondo de cada escena en «Fondo detrás de la persona».');
    } catch (e: any) { ctx.toast(`No se pudo recortar: ${e.message}`); } finally { setCutting(''); }
  };
  const uploadBackdrop = async (file: File) => {
    try {
      const d = await api(`/api/broll?id=${encodeURIComponent(project.id)}&scene=${scene?.id ?? ""}&fondo=1&filename=${encodeURIComponent(file.name)}&license=propia`, { method: 'POST', body: file });
      store.replace(d.project);
      ctx.toast('Fondo puesto detrás de la persona.');
    } catch (e: any) { ctx.toast(e.message); }
  };
  const backdropFromIdea = async () => {
    const idea = window.prompt('¿Qué fondo quieres? Ej.: oficina moderna de noche con luces de ciudad');
    if (!idea || idea.trim().length < 3) return;
    setCutting('Creando el fondo…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'broll-idea', sceneId: scene?.id, idea, fondo: true }) });
      await waitJob(job, (j) => setCutting(j.message || 'Creando el fondo…'));
      await reloadProject();
      ctx.toast('Fondo creado y puesto detrás de la persona.');
    } catch (e: any) { ctx.toast(`No se pudo crear el fondo: ${e.message}`); } finally { setCutting(''); }
  };

  const applyPreset = async (presetId: string) => {
    try {
      const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'preset', presetId }) });
      store.replace(d.project);
    } catch (e: any) { ctx.toast(e.message); }
  };

  const total = Math.max(1, timeline.durationInFrames);
  const pct = (f: number) => `${(f / total) * 100}%`;
  // Subtítulos: hay palabras si se habla o si hay voz en off (un montaje puede tenerla).
  const hasCaptions = hasSpeech || Boolean(project.audio.voiceover) || timeline.words.length > 0;
  // Uniones de la línea de tiempo: si hay muchas escenas, solo se dibujan grandes las de la escena elegida.
  const dense = spans.length > 24;
  const seekLane = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.current?.seekTo(Math.round(((e.clientX - r.left) / r.width) * total));
  };

  if (!project.scenes.length) return (
    <div className="page">
      <div className="col" style={{ gap: 12, alignItems: 'flex-start' }}>
        <p>Este video todavía no está editado. Responde el brief y pulsa «Editar mi video».</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => ctx.go('brief', { s: null })}><Icon name="brief" />Ir al brief</button>
          {store.canUndo ? <button className="btn rect" onClick={store.undo}><Icon name="undo" />Deshacer</button> : null}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="editor">
        <aside className="side l">
          <div className="col" style={{ padding: 12, borderRadius: 14, background: 'var(--pinkSoft)', gap: 8, marginBottom: 10 }}>
            <span className="small">Para que la IA rehaga toda la edición y exporte el video, hazlo desde el brief. Lo que cambiaste aquí se reemplaza.</span>
            <button className="btn primary" onClick={() => ctx.go('brief', { s: null })}><Icon name="brief" />Editar desde el brief</button>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-label="Intensidad de la edición">
              {(['suave', 'media', 'fuerte'] as const).map((lv) => (
                <button key={lv} className={project.intensity === lv ? 'on' : ''} aria-pressed={project.intensity === lv} onClick={() => store.update((p) => { p.intensity = lv; })}>
                  {lv === 'suave' ? 'Suave' : lv === 'media' ? 'Media' : 'Fuerte'}
                </button>
              ))}
            </div>
            <span className="small muted">Intensidad: cuántos textos, zooms, gráficos y sonidos pone la IA la próxima vez que edites desde el brief.</span>
            {trend && <span className="small muted help">La IA sigue lo que funciona en {SECTORS.find(([id]) => id === sector)?.[1]?.toLowerCase()}.</span>}
            {trend && (
              <details>
                <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>En tendencia para tu nicho</summary>
                <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {trend.points.map((t) => <li key={t}>{t}</li>)}
                </ul>
                <span className="small muted">Guía incluida en la app ({TRENDS_DATE}); no se consulta internet.</span>
              </details>
            )}
          </div>
          {score && (
            <details className="scorecard">
              <summary>
                <span className={`score ${score.grade}`} aria-label={`Puntaje del video: ${score.score} de 100`}>{score.score}</span>
                <span className="col" style={{ gap: 0 }}>
                  <strong className="small">Puntaje del video · {score.grade}</strong>
                  <span className="small muted">{score.parts.filter((x) => x.tip).length ? `${score.parts.filter((x) => x.tip).length} cosas para subirlo` : 'Todo en su punto'}</span>
                </span>
              </summary>
              <div className="col" style={{ gap: 8, paddingTop: 8 }}>
                {score.parts.map((x) => (
                  <div key={x.id} className="col" style={{ gap: 3 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{x.label}</span><span className="small muted">{x.points}/{x.max}</span></div>
                    <div className="meter" aria-hidden="true"><div style={{ width: `${(x.points / x.max) * 100}%` }} /></div>
                    {x.tip && <span className="small muted">{x.tip}</span>}
                  </div>
                ))}
                <span className="small muted help">Se calcula con buenas prácticas de retención (gancho, ritmo, movimiento, subtítulos, duración, cierre y audio); no predice las vistas.</span>
              </div>
            </details>
          )}
          {advice.length > 0 && (
            <Group id="sugerencias" title="Sugerencias" hint={String(advice.length)} defaultOpen>

                {(allAdvice ? advice : advice.slice(0, 2)).map((a) => (
                  <div key={a.id} className="col" style={{ padding: 10, borderRadius: 10, background: 'var(--panel2)', gap: 6 }}>
                    <strong className="small">{a.title}</strong>
                    <span className="small muted">{a.why}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn primary" style={{ height: 30 }} disabled={applying !== null} onClick={() => applyAdvice(a)}>{applying?.id === a.id ? 'Aplicando…' : a.go ? 'Ir' : 'Aplicar'}</button>
                      <button className="btn ghost" style={{ height: 30 }} disabled={applying?.id === a.id} onClick={() => setDismissed((d) => [...d, a.id])}>Ahora no</button>
                    </div>
                    {applying?.id === a.id && <span className="pill" role="status">{applying.msg}</span>}
                  </div>
                ))}
                            {advice.length > 2 && <button className="btn ghost" style={{ height: 30, alignSelf: 'flex-start' }} onClick={() => setAllAdvice((v) => !v)}>{allAdvice ? 'Ver menos' : `Ver las otras ${advice.length - 2}`}</button>}
            </Group>
          )}
          <Group id="estilos" title="Estilo" hint={store.presets.find((p) => p.id === project.presetId)?.name}>

              <button className="btn rect" style={{ height: 34 }} onClick={saveStyle} title="Guarda cómo está este video (subtítulos, textos, ritmo) para usarlo en otros"><Icon name="save" />Guardar como mi estilo</button>
              {rec && rec.id !== project.presetId && (
                <div className="col" style={{ padding: 10, borderRadius: 10, background: 'var(--cyanSoft)', gap: 6 }}>
                  <strong className="small">Recomendado: {store.presets.find((p) => p.id === rec.id)?.name}</strong>
                  <span className="small muted">{rec.reason}</span>
                  <button className="btn cyan" style={{ height: 34 }} onClick={() => applyPreset(rec.id)}>Aplicar este estilo</button>
                </div>
              )}
          <div className="presets">
            {store.presets.map((p) => (
              <div key={p.id} className="col" style={{ gap: 2 }}>
                <button className={`preset ${project.presetId === p.id ? 'on' : ''}`} onClick={() => applyPreset(p.id)} title={p.description} aria-pressed={project.presetId === p.id}>
                  <span className="preset-thumb"><PresetPreview project={project} preset={p} /></span>
                  <strong className="small">{p.name}</strong>
                </button>
                {!builtinIds.has(p.id) && (
                  <div className="row" style={{ gap: 2, justifyContent: 'center' }}>
                    <button className="btn ghost sq" style={{ height: 26, width: 26 }} aria-label={`Cambiar el nombre de «${p.name}»`} title="Cambiar el nombre" onClick={() => renameStyle(p.id, p.name)}><Icon name="edit" /></button>
                    <button className="btn ghost sq" style={{ height: 26, width: 26 }} aria-label={`Quitar el estilo «${p.name}»`} title="Quitar este estilo" onClick={() => deleteStyle(p.id, p.name)}><Icon name="trash" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
                      </Group>
          {hasCaptions && <Group id="subtitulos" title="Subtítulos" hint={CAPTION_DESIGNS.find((x) => x.id === project.captions.design)?.name}>

          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className={project.captions.mode === 'word' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'word'; })}>Palabra a palabra</button>
            <button className={project.captions.mode === 'phrase' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'phrase'; })}>Frase completa</button>
          </div>
          <label className="row"><input type="checkbox" checked={project.captions.emojis} onChange={(e) => store.update((p) => { p.captions.emojis = e.target.checked; })} /> Emojis automáticos en el video (cuando se dice la palabra)</label>
          <label className="field">Idioma de los subtítulos
            <select value={project.captions.language ?? ''} disabled={Boolean(translating)} onChange={(e) => captionLanguage(e.target.value)}>
              <option value="">El del video</option>
              <option value="en">Inglés</option><option value="pt">Portugués</option><option value="fr">Francés</option><option value="it">Italiano</option><option value="de">Alemán</option>
            </select>
          </label>
          {translating ? <span className="pill" role="status">{translating}</span> : project.captions.language ? <span className="small muted help">La voz sigue en el idioma original; solo cambian los subtítulos. Para cambiar también la voz, usa «Doblaje» en Audio.</span> : null}
          <Stepper label={`Diseño de los subtítulos (${CAPTION_DESIGNS.length})`} items={CAPTION_DESIGNS} value={project.captions.design} onChange={(id) => store.update((p) => { p.captions.design = id; })} />
          {CAPTION_DESIGNS.find((x) => x.id === project.captions.design)?.font && <span className="small muted">Este diseño trae su propia tipografía.</span>}
          <Stepper label={`Cómo se marca la palabra que suena (${CAPTION_EFFECTS.length})`} items={CAPTION_EFFECTS} value={project.captions.effect} onChange={(id) => store.update((p) => { p.captions.effect = id; })} />
          {CAPTION_DESIGNS.find((x) => x.id === project.captions.design)?.legacy && <span className="small muted help">Este diseño trae su propia forma de remarcar; elige otro diseño para cambiarla.</span>}
          <label className="row"><input type="checkbox" checked={project.captions.emphasis} onChange={(e) => store.update((p) => { p.captions.emphasis = e.target.checked; })} /> Remarcar la palabra más importante</label>
          <span className="small muted">Color de resaltado</span>
          <ColorRow value={project.captions.highlightColor} label="Color de resaltado de subtítulos" onPick={(c) => store.update((p) => { p.captions.highlightColor = c; })} />
          <span className="small muted">Color de las letras</span>
          <ColorRow value={project.captions.color} label="Color de las letras de subtítulos" swatches={['#FFFFFF', '#FACC15', '#25F4EE', '#000000']} onPick={(c) => store.update((p) => { p.captions.color = c; })} />
          <label className="field">Tipografía
            <select value={project.captions.fontFamily} onChange={(e) => store.update((p) => { p.captions.fontFamily = e.target.value; p.captions.fontWeight = ['Anton', 'Bebas Neue', 'Archivo Black'].includes(e.target.value) ? 400 : e.target.value === 'Oswald' ? 700 : 800; })}>
              <FontOptions />
            </select>
          </label>
          <SizeSlider value={project.captions.fontSize} onCommit={(v) => store.update((p) => { p.captions.fontSize = v; })} />
          <label className="row"><input type="checkbox" checked={project.captions.uppercase} onChange={(e) => store.update((p) => { p.captions.uppercase = e.target.checked; })} /> Mayúsculas</label>
          <Slider label="Altura en pantalla" value={project.captions.y} min={0.15} max={0.85} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => store.update((p) => { p.captions.y = v; })} />
          <Slider label="Palabras a la vez" value={project.captions.wordsPerLine} min={1} max={8} step={1} show={(v) => String(v)} onCommit={(v) => store.update((p) => { p.captions.wordsPerLine = Math.round(v); })} />
          <label className="field">Cómo entra cada línea
            <select value={project.captions.lineAnim} onChange={(e) => store.update((p) => { p.captions.lineAnim = e.target.value as typeof p.captions.lineAnim; })}>
              <option value="pop">Salta</option><option value="subir">Sube</option><option value="deslizar">Desliza</option><option value="ninguna">Sin animación</option>
            </select>
          </label>
          <Slider label="Grosor del borde" value={project.captions.strokeScale} min={0} max={2.5} step={0.05} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => store.update((p) => { p.captions.strokeScale = v; })} />
          <Slider label="Separación entre letras" value={project.captions.spacing} min={-0.05} max={0.3} step={0.01} show={(v) => v.toFixed(2)} onCommit={(v) => store.update((p) => { p.captions.spacing = v; })} />
          <label className="row"><input type="checkbox" checked={project.captions.plate} onChange={(e) => store.update((p) => { p.captions.plate = e.target.checked; })} /> Placa oscura detrás (se lee sobre cualquier fondo)</label>
          <label className="row"><input type="checkbox" checked={project.captions.stroke} onChange={(e) => store.update((p) => { p.captions.stroke = e.target.checked; })} /> Borde negro en las letras</label>

                      </Group>}
          <Group id="color" title="Color" hint={project.finish.lut && !lutGone ? project.finish.lut.name : 'Original'}>
              <div className="col" style={{ gap: 6 }}>
                <span className="small"><b>Filtro de color</b></span>
                {lutGone && <span className="small" style={{ color: 'var(--pinkText)' }}>El filtro «{project.finish.lut?.name}» ya no está aplicado: elígelo de nuevo o pon «Sin filtro».</span>}
                <select value={grading && pendingLut ? pendingLut : project.finish.lut?.builtin ?? (project.finish.lut ? 'propio' : '')} disabled={!!grading} onChange={(e) => e.target.value !== 'propio' && setLut(e.target.value)}>
                  <option value="">Sin filtro (color original)</option>
                  {luts.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.description}</option>)}
                  {project.finish.lut && !project.finish.lut.builtin && <option value="propio">{project.finish.lut.name} (tuyo)</option>}
                </select>
                {project.finish.lut && (
                  <label className="col small" style={{ gap: 2 }}>Fuerza: {Math.round(lutStrength * 100)} %
                    <input type="range" min={0.2} max={1} step={0.05} value={lutStrength} disabled={!!grading} onChange={(e) => setLutStrength(Number(e.target.value))} onPointerUp={commitStrength} onKeyUp={(e) => e.key !== 'Tab' && commitStrength()} />
                  </label>
                )}
                <label className="btn rect" style={{ height: 34, justifyContent: 'center', cursor: 'pointer' }}>
                  Subir mi filtro (.cube)
                  <input type="file" accept=".cube" hidden disabled={!!grading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLut(f); e.target.value = ''; }} />
                </label>
                <label className="btn rect" style={{ height: 34, cursor: grading ? 'default' : 'pointer' }} title="Sube una foto o un fotograma con el color que te gusta: la app crea un filtro para que tu video se parezca">
                  Igualar a una imagen
                  <input type="file" accept="image/*,video/*" hidden disabled={!!grading} onChange={(e) => { const f = e.target.files?.[0]; if (f) matchReference(f); e.target.value = ''; }} />
                </label>
                {grading ? <span className="small">{grading}</span> : <span className="small muted help">Se aplica solo al video: textos, subtítulos y gráficos mantienen tus colores.</span>}
              </div>
              <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <button className="btn rect" style={{ height: 34 }} onClick={() => store.update((p) => {
                p.scenes.forEach((sc) => { sc.look = 'cine'; if (sc.camera === 'ninguno') sc.camera = 'acercar'; });
                Object.assign(p.finish, { grain: true, vignette: true, halation: true });
              })}>Look de cine en un clic</button>
              <span className="small muted help">Pone en todas las escenas el color de cine, grano, bordes oscuros, brillo y la cámara acercándose despacio.</span>
              <button className="btn rect" style={{ height: 34 }} onClick={async () => {
                try {
                  const d = await api<any>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'igualar-color' }) });
                  store.replace(d.project);
                  ctx.toast(d.changed ? `Color igualado en ${d.changed} escena${d.changed > 1 ? 's' : ''}.` : 'Las escenas ya tenían un color parejo.');
                } catch (e: any) { ctx.toast(e.message); }
              }}>Igualar el color entre escenas</button>
              <span className="small muted help">Ajusta brillo y color de las escenas que se salen, para que todo parezca del mismo rodaje.</span>
              </div>
          </Group>
          <Group id="herramientas" title="Herramientas de un clic" hint={hasTeaser ? 'Con adelanto' : undefined}>
              <div className="col" style={{ gap: 6 }}>
                <strong className="small">Adelanto</strong>
                <button className="btn rect wrap" onClick={() => teaser(true)}>{hasTeaser ? 'Cambiar la frase del adelanto' : 'Poner la frase más fuerte en el primer segundo'}</button>
            {hasTeaser && <button className="btn ghost" style={{ height: 30 }} onClick={() => teaser(false)}>Quitar el adelanto</button>}
            <span className="small muted">{hasTeaser ? `Abre con: «${sceneSpeech(project.scenes[0], store.transcript).slice(0, 90)}»` : 'Como hacen los creadores grandes: el video abre con tu mejor frase y luego empieza la historia. La escena original sigue en su sitio.'}</span>
          
              </div>
              {reelLength > 66 && (
                <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <strong className="small">Serie en partes</strong>
                  <span className="small muted help">Dura {Math.round(reelLength)} s: divídelo en «Parte 1, 2…» que terminan con «Sigue en la parte 2 →». Cada parte es un proyecto nuevo; este no cambia.</span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <select value={partMax} onChange={(e) => setPartMax(Number(e.target.value))} aria-label="Duración máxima de cada parte">
                      <option value={60}>Hasta 60 s cada una</option><option value={90}>Hasta 90 s</option><option value={180}>Hasta 3 min</option>
                    </select>
                    <button className="btn rect" style={{ height: 34, flex: 'none' }} disabled={Boolean(splitting) || reelLength <= partMax * 1.1} onClick={makeSeries}>{splitting || `Crear ${Math.ceil(reelLength / partMax)} partes`}</button>
                  </div>
                </div>
              )}
              {Math.min(project.source.width, project.source.height) < 1000 && (
                <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <strong className="small">Calidad del video</strong>
                  <span className="small muted help">Tu video es de {project.source.width}×{project.source.height}: se agranda a 1080 quitando los bloques de la compresión (como los de WhatsApp).{project.source.quality ? '' : ' Este proyecto se preparó antes de esta mejora: elige una opción para aplicarla.'}</span>
                  <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Calidad del video">
                    {(['normal', 'nitido'] as const).map((q) => (
                      <button key={q} className={project.source.quality === q ? 'on' : ''} aria-pressed={project.source.quality === q} disabled={Boolean(improving)} onClick={() => q !== project.source.quality && setQuality(q)}>
                        {q === 'normal' ? 'Fiel al original' : 'Más nítido'}
                      </button>
                    ))}
                  </div>
                  {improving && <span className="pill" role="status">{improving}</span>}
                </div>
              )}
              {project.source.width > project.source.height * 1.1 && (
                <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <strong className="small">Encuadre</strong>

                <label className="row"><input type="checkbox" checked={project.source.followSpeaker} disabled={Boolean(speakerBusy)} onChange={(e) => followSpeaker(e.target.checked)} /> Seguir a quien habla</label>
                <span className="small muted help">Para pódcast y entrevistas con dos o más personas: el recorte vertical pasa a la persona que está hablando (se mira quién mueve la boca). La primera vez tarda un poco.</span>
                {speakerBusy && <span className="pill" role="status">{speakerBusy}</span>}
                              </div>
              )}
              {longVideo && (
                <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <strong className="small">Videos cortos para redes</strong>

                <span className="small muted help">Los mejores tramos de 20–60 s de este video, con puntaje de gancho, cierre y valor. Cada uno se vuelve un video nuevo ya editado.</span>
                {clips === null && <button className="btn rect" style={{ height: 32, alignSelf: 'flex-start' }} disabled={findingClips} onClick={findClips}>{findingClips ? 'Buscando…' : 'Buscar los mejores tramos'}</button>}
                {clips?.length === 0 && <span className="small muted">No encontré tramos con un gancho y un cierre claros.</span>}
                {clips?.map((c, i) => (
                  <div key={c.start} className="col" style={{ padding: 10, borderRadius: 10, background: 'var(--panel2)', gap: 4 }}>
                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                      <strong className="small" style={{ minWidth: 0 }}>«{c.title}»</strong>
                      <span className="pill" style={{ flex: 'none' }}>{c.score}</span>
                    </div>
                    <span className="small muted">{Math.round(c.end - c.start)} s · Gancho {c.hook} · Cierre {c.flow} · Valor {c.value}</span>
                    <span className="small muted">{c.reasons.join(' · ')}</span>
                    <button className="btn rect" style={{ height: 30, alignSelf: 'flex-start' }} disabled={Boolean(makingClip)} onClick={() => makeClip(c, i + 1)}>{makingClip || 'Crear un video con este tramo'}</button>
                  </div>
                ))}
                              </div>
              )}
          </Group>
          <Group id="acabados" title="Acabados" hint={(() => { const n = Number(Boolean(project.finish.lowerThird)) + Number(Boolean(project.finish.watermark)) + Number(project.finish.progressBar) + Number(project.finish.grain) + Number(project.finish.vignette) + Number(project.finish.keywordZoom) + Number(project.finish.halation) + Number(project.finish.letterbox); return n ? `${n} activos` : undefined; })()}>

              <label className="row"><input type="checkbox" checked={project.finish.progressBar} onChange={(e) => store.update((p) => { p.finish.progressBar = e.target.checked; })} /> Barra de progreso arriba</label>
              <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                <label className="row"><input type="checkbox" checked={Boolean(project.finish.watermark)} onChange={(e) => store.update((p) => { p.finish.watermark = e.target.checked ? { corner: 'arriba-der', size: 0.13, opacity: 0.85 } : undefined; })} /> Marca de agua {store.brand?.logoSrc ? '(tu logo)' : `(«${store.brand?.name ?? 'tu marca'}»)`}</label>
                {project.finish.watermark && (
                  <>
                    <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Esquina de la marca de agua">
                      {(['arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der'] as const).map((c) => (
                        <button key={c} className={project.finish.watermark?.corner === c ? 'on' : ''} aria-pressed={project.finish.watermark?.corner === c} onClick={() => store.update((p) => { if (p.finish.watermark) p.finish.watermark.corner = c; })}>
                          {{ 'arriba-izq': 'Arriba izq.', 'arriba-der': 'Arriba der.', 'abajo-izq': 'Abajo izq.', 'abajo-der': 'Abajo der.' }[c]}
                        </button>
                      ))}
                    </div>
                    <Slider label="Tamaño" value={project.finish.watermark.size} min={0.06} max={0.3} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => store.update((p) => { if (p.finish.watermark) p.finish.watermark.size = v; })} />
                    <Slider label="Opacidad" value={project.finish.watermark.opacity} min={0.2} max={1} step={0.05} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => store.update((p) => { if (p.finish.watermark) p.finish.watermark.opacity = v; })} />
                  </>
                )}
                <label className="btn rect" style={{ height: 34, cursor: 'pointer' }}>
                  {store.brand?.logoSrc ? 'Cambiar el logo de la marca' : 'Subir el logo de la marca'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
                </label>
                <span className="small muted help">El logo queda en la marca de {project.client ?? 'personal'}: se usa en todos sus videos (marca de agua, cierre e imágenes). Mejor PNG con fondo transparente.</span>
              </div>
              <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                <label className="row"><input type="checkbox" checked={Boolean(project.finish.lowerThird)} onChange={(e) => store.update((p) => { p.finish.lowerThird = e.target.checked ? { name: store.kit?.name ?? store.brand?.name ?? '', role: '', at: 0.8, duration: 4 } : undefined; })} /> Rótulo con nombre y cargo</label>
                {project.finish.lowerThird && (
                  <>
                    <input key={'lt-n' + project.finish.lowerThird.name} className="input" style={{ minHeight: 34 }} defaultValue={project.finish.lowerThird.name} placeholder="Nombre" aria-label="Nombre del rótulo" onBlur={(e) => store.update((p) => { if (p.finish.lowerThird) p.finish.lowerThird.name = e.target.value.trim(); })} />
                    <input key={'lt-r' + (project.finish.lowerThird.role ?? '')} className="input" style={{ minHeight: 34 }} defaultValue={project.finish.lowerThird.role ?? ''} placeholder="Cargo o a qué te dedicas (opcional)" aria-label="Cargo del rótulo" onBlur={(e) => store.update((p) => { if (p.finish.lowerThird) p.finish.lowerThird.role = e.target.value.trim() || undefined; })} />
                    <Slider label="Aparece en el segundo" value={project.finish.lowerThird.at} min={0} max={15} step={0.5} show={(v) => `${v} s`} onCommit={(v) => store.update((p) => { if (p.finish.lowerThird) p.finish.lowerThird.at = v; })} />
                    <Slider label="Dura" value={project.finish.lowerThird.duration} min={2} max={10} step={0.5} show={(v) => `${v} s`} onCommit={(v) => store.update((p) => { if (p.finish.lowerThird) p.finish.lowerThird.duration = v; })} />
                  </>
                )}
              </div>
              <label className="row"><input type="checkbox" checked={project.finish.grain} onChange={(e) => store.update((p) => { p.finish.grain = e.target.checked; })} /> Grano de película</label>
              <label className="row"><input type="checkbox" checked={project.finish.vignette} onChange={(e) => store.update((p) => { p.finish.vignette = e.target.checked; })} /> Bordes oscuros en todo el video</label>
              <label className="row"><input type="checkbox" checked={project.finish.keywordZoom} onChange={(e) => store.update((p) => { p.finish.keywordZoom = e.target.checked; })} /> Zoom en la palabra importante de cada frase</label>
              <label className="row"><input type="checkbox" checked={project.finish.halation} onChange={(e) => store.update((p) => { p.finish.halation = e.target.checked; })} /> Brillo de cine (halo en las luces)</label>
              <label className="row"><input type="checkbox" checked={project.finish.letterbox} onChange={(e) => store.update((p) => { p.finish.letterbox = e.target.checked; })} /> Barras de cine</label>
          </Group>
          <Group id="revision" title="Revisión del cliente" hint={project.requests.filter((r) => r.status === 'pendiente').length ? `${project.requests.filter((r) => r.status === 'pendiente').length} pendiente${project.requests.filter((r) => r.status === 'pendiente').length === 1 ? '' : 's'}` : project.approval === 'aprobado' ? 'Aprobado' : undefined}>
              <span className="small muted help">Un enlace para que tu cliente vea el último video exportado, comente en el segundo exacto y lo apruebe. Solo da acceso a este video.</span>
              {review ? (
                <div className="col" style={{ gap: 6 }}>
                  {(review.links.length ? review.links : [review.local]).map((l) => (
                    <div key={l} className="row" style={{ flexWrap: 'nowrap' }}>
                      <input className="input" style={{ flex: 1, minWidth: 0, minHeight: 34, fontSize: 12 }} readOnly value={l} onFocus={(e) => e.target.select()} aria-label="Enlace de revisión" />
                      <button className="btn rect" style={{ height: 34 }} onClick={() => navigator.clipboard?.writeText(l).then(() => ctx.toast('Enlace copiado.')).catch(() => ctx.toast('Selecciónalo y cópialo a mano.'))}>Copiar</button>
                    </div>
                  ))}
                  {!review.exported && <span className="small" style={{ color: 'var(--pinkText)' }}>Todavía no hay un video exportado: el cliente verá un aviso hasta que exportes el video.</span>}
                  {!review.network && <span className="small" style={{ color: 'var(--pinkText)' }}>La app no está abierta en modo red: el enlace solo funciona en este computador. Para que el cliente lo abra desde su equipo (misma Wi-Fi), abre la app con el ícono del Escritorio o «Abrir Axioma Studio».</span>}
                  {review.network && <span className="small muted help">Funciona en la misma Wi-Fi mientras la app esté abierta. Fuera de casa necesita una red privada como Tailscale.</span>}
                  <button className="btn ghost" style={{ height: 28, alignSelf: 'flex-start' }} onClick={() => shareReview(true)}>Cambiar el enlace (el anterior deja de funcionar)</button>
                </div>
              ) : <button className="btn rect" style={{ height: 34 }} onClick={() => shareReview(false)}>Crear enlace de revisión</button>}
              {project.requests.length > 0 && (
                <div className="col" style={{ gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <strong className="small">Comentarios y pedidos</strong>
                  {[...project.requests].sort((x, y) => Number(x.status !== 'pendiente') - Number(y.status !== 'pendiente') || y.at.localeCompare(x.at)).slice(0, 30).map((r) => (
                    <div key={r.id} className="col" style={{ gap: 4, padding: 8, borderRadius: 8, background: 'var(--panel2)', opacity: r.status === 'pendiente' ? 1 : 0.55 }}>
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                        <strong className="small">{r.author ?? 'Pedido a la IA'}</strong>
                        {r.time != null && <button className="btn ghost" style={{ height: 24, padding: '0 4px', fontVariantNumeric: 'tabular-nums' }} title="Ir a ese momento" onClick={() => player.current?.seekTo(Math.round(r.time! * timeline.fps))}>{Math.floor(r.time / 60)}:{String(Math.floor(r.time % 60)).padStart(2, '0')}</button>}
                      </div>
                      <span className="small">{r.text}</span>
                      {r.status === 'pendiente' ? (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn rect" style={{ height: 28 }} onClick={() => resolveRequest(r.id, 'hecha')}>Hecho</button>
                          <button className="btn ghost" style={{ height: 28 }} onClick={() => resolveRequest(r.id, 'descartada')}>Descartar</button>
                        </div>
                      ) : <span className="small muted">{r.status === 'hecha' ? 'Hecho' : 'Descartado'}</span>}
                    </div>
                  ))}
                </div>
              )}
          </Group>
          {hasSpeech && <Group id="quitadas" title="Partes quitadas" hint={String(removed.length)}>

              <span className="small muted help">Lo que el corte automático quitó: pausas largas, muletillas y tomas repetidas. Si quitó algo que querías, recupéralo.</span>
              {removed.length === 0 && <span className="small muted">No se quitó nada con voz.</span>}
              {removed.slice(0, 40).map((r) => (
                <div key={r.start} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', padding: '6px 8px', borderRadius: 8, background: 'var(--panel2)' }}>
                  <span className="small" style={{ minWidth: 0 }}><s style={{ opacity: 0.7 }}>{r.text}</s> <span className="muted">· {(r.end - r.start).toFixed(1)} s</span></span>
                  <button className="btn rect" style={{ height: 30, flex: 'none' }} onClick={() => restore(r)}>Recuperar</button>
                </div>
              ))}
                      </Group>}
        </aside>

        <main className="stage">
          <div className="row small muted">
            <span className="pill line">9:16 · {project.format.width}×{project.format.height}</span>
            <label className="row"><input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Zonas seguras
              <select value={safeNet} onChange={(e) => setSafeNet(e.target.value as keyof typeof SAFE)} style={{ marginLeft: 6 }} aria-label="Red para las zonas seguras">
                <option value="reel">Reel</option><option value="historia">Historia</option><option value="tiktok">TikTok</option><option value="short">Short</option>
              </select>
            </label>
            <TimeCounter player={player} playerKey={playerKey} total={total} fps={timeline.fps} />
          </div>
          <div className="playerbox" style={{ position: 'relative' }}>
            <Player
              key={playerKey}
              ref={player}
              component={Reel}
              inputProps={timeline}
              durationInFrames={total}
              fps={timeline.fps}
              compositionWidth={timeline.width}
              compositionHeight={timeline.height}
              style={{ width: '100%', height: '100%' }}
              controls
              spaceKeyToPlayOrPause={false}
              errorFallback={() => <PreviewStuck onRetry={retryPreview} />}
              acknowledgeRemotionLicense
            />
            {previewErr && <PreviewStuck onRetry={retryPreview} />}
            {safe && <div className="safe" aria-hidden="true" style={SAFE[safeNet]} title="Fuera de este recuadro los botones de la red tapan el contenido" />}
          </div>
          <div className="row">
            <button className="btn sq" aria-label="Escena anterior" disabled={idx <= 0} onClick={() => select(project.scenes[idx - 1].id)}><Icon name="prev" /></button>
            <PlayButton player={player} playerKey={playerKey} />
            <button className="btn sq" aria-label="Escena siguiente" disabled={idx >= project.scenes.length - 1} onClick={() => select(project.scenes[idx + 1].id)}><Icon name="next" /></button>
          </div>
        </main>

        {scene && (
          <aside className="side r">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ fontSize: 18 }}>Escena {idx + 1} · {scene.title || ROLE_LABEL[scene.role]}</h2>
              <span className="small muted">{((spans[idx]?.dur ?? 0) / timeline.fps).toFixed(1)} s</span>
            </div>
            <label className="field">Título
              <input key={scene.id + 't' + scene.title} defaultValue={scene.title} onBlur={(e) => e.target.value !== scene.title && edit((s) => { s.title = e.target.value; })} />
            </label>
            <label className="field">Rol
              <select value={scene.role} onChange={(e) => edit((s) => { s.role = e.target.value as Scene['role']; })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <div className="col" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--panel2)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Duración de la escena</strong>
                <span className="small muted">{(scene.speed ?? 1) < 1 ? `${sceneLength(scene).toFixed(1)} s en cámara lenta (${(sceneLength(scene) * (scene.speed ?? 1)).toFixed(1)} s del video, de ${fullLength.toFixed(1)} s)` : `${sceneLength(scene).toFixed(1)} s de ${fullLength.toFixed(1)} s`}</span>
              </div>
              <TrimSlider label="Quitar del inicio" value={scene.trimStart} max={Math.max(0, fullLength - MIN_CLIP - scene.trimEnd)} onCommit={(v) => edit((s) => { s.trimStart = v; })} />
              <TrimSlider label="Quitar del final" value={scene.trimEnd} max={Math.max(0, fullLength - MIN_CLIP - scene.trimStart)} onCommit={(v) => edit((s) => { s.trimEnd = v; })} />
              {(scene.trimStart > 0 || scene.trimEnd > 0) && <button className="btn ghost" style={{ alignSelf: 'flex-start', height: 28 }} onClick={() => edit((s) => { s.trimStart = 0; s.trimEnd = 0; })}>Recuperar la escena entera</button>}
            </div>
            <Group id="variantes" title="Variantes" defaultOpen>
              <span className="muted small">Una de cada tipo: gráficos, video de apoyo, color y tipografía. Toca una para aplicarla.</span>
              {quick.map((v) => {
                const on = scene.chosenVariant === v.id && scene.variants.length > 0;
                return (
                  <button key={v.id + v.label} className="tpl" style={on ? { borderColor: 'var(--pink)', background: 'var(--pinkSoft)' } : { background: 'var(--panel)' }} title={v.notes}
                    onClick={() => store.update((p) => { const s = p.scenes[idx]; if (!s.variants.length) s.variants = quick; applyVariant(s, v); })}>
                    <span className="col" style={{ gap: 2, minWidth: 0 }}>
                      <strong>{v.label}</strong>
                      <span className="small muted">{v.onScreenText ? `"${v.onScreenText}"` : v.notes}</span>
                    </span>
                  </button>
                );
              })}
              <button className="btn cyan" onClick={() => ctx.go('variantes', { s: scene.id })}>Más opciones</button>
            </Group>
            {(scene.visual === 'motion' || scene.visual === 'texto') && (
              <Group id="motion" title="Gráfico animado" defaultOpen>
                  <span className="small muted">Cambia su aspecto y su contenido aquí, sin generarlo de nuevo.</span>
                  <label className="field">Plantilla
                    <select value={scene.visual === 'texto' ? 'texto' : scene.motionTemplate ?? 'lista'} onChange={(e) => edit((s) => { if (e.target.value === 'texto') { s.visual = 'texto'; } else { s.visual = 'motion'; s.motionTemplate = e.target.value; } })}>
                      {MOTION_NAMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </label>
                  <label className="field">Fondo
                    <select value={scene.motionStyle.background} onChange={(e) => edit((s) => { s.motionStyle.background = e.target.value as typeof s.motionStyle.background; })}>
                      <option value="oscuro">Oscuro</option><option value="claro">Claro</option><option value="marca">Color de la marca</option>
                      <option value="degradado">Degradado que se mueve</option><option value="video">Tu video desenfocado</option>
                    </select>
                  </label>
                  <span className="small muted">Color principal</span>
                  <ColorRow value={scene.motionStyle.primary ?? store.brand?.primary ?? project.captions.highlightColor} label="Color principal del gráfico" onPick={(c) => edit((s) => { s.motionStyle.primary = c; })} />
                  <span className="small muted">Color secundario</span>
                  <ColorRow value={scene.motionStyle.secondary ?? store.brand?.secondary ?? '#25F4EE'} label="Color secundario del gráfico" swatches={['#25F4EE', '#FACC15', '#FFFFFF', '#A78BFA']} onPick={(c) => edit((s) => { s.motionStyle.secondary = c; })} />
                  <label className="field">Tipografía
                    <select value={scene.motionStyle.font ?? ''} onChange={(e) => edit((s) => { s.motionStyle.font = e.target.value || undefined; })}>
                      <option value="">Igual que los subtítulos</option>
                      <FontOptions />
                    </select>
                  </label>
                  <Slider label="Tamaño" value={scene.motionStyle.scale} min={0.6} max={1.5} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.motionStyle.scale = v; })} />
                  <MotionData scene={scene} onChange={(data) => edit((s) => { s.motionData = data; })} />
              </Group>
            )}
            <Group id="texto" title="Texto en pantalla" hint={scene.onScreenText ? `«${scene.onScreenText.slice(0, 22)}»` : 'Sin texto'} defaultOpen>

            <label className="field">Texto en pantalla
              <textarea key={scene.id + 'o' + (scene.onScreenText ?? '')} rows={2} defaultValue={scene.onScreenText ?? ''} placeholder="Máximo 6 palabras"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (scene.onScreenText ?? '')) edit((s) => { s.onScreenText = v || undefined; }); }} />
            </label>
            <div className="col">
              <span className="small muted">Color del texto</span>
              <ColorRow value={scene.textColor ?? project.captions.highlightColor} label="Color del texto" onPick={(c) => edit((s) => { s.textColor = c; })} />
            </div>
            <label className="field">Estilo del texto
              <select value={scene.textStyle} onChange={(e) => edit((s) => { s.textStyle = e.target.value as Scene['textStyle']; })}>
                <optgroup label="Básicos">{TEXT_STYLES.filter(([id]) => BASIC.has(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</optgroup>
                <optgroup label="Llamativos">{TEXT_STYLES.filter(([id]) => !BASIC.has(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</optgroup>
              </select>
            </label>
            <span className="small muted">{TEXT_STYLES.find(([id]) => id === scene.textStyle)?.[2]}</span>
            <label className="field">Palabra a remarcar
              <input key={scene.id + 'k' + (scene.onScreenText ?? '') + '|' + (scene.textKeyword ?? '')} defaultValue={scene.textKeyword ?? ''} placeholder={keywordOf(scene.onScreenText ?? '') || 'Automática'}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (scene.textKeyword ?? '')) edit((s) => { s.textKeyword = v || undefined; }); }} />
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Tipografía
                <select value={scene.textFont ?? ''} onChange={(e) => edit((s) => { s.textFont = e.target.value || undefined; })}>
                  <option value="">Igual que los subtítulos</option>
                  <FontOptions />
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>Entrada
                <select value={scene.textAnim} onChange={(e) => edit((s) => { s.textAnim = e.target.value as Scene['textAnim']; })}>
                  {TEXT_ANIMS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            <Slider label="Tamaño" value={scene.textSize} min={0.5} max={2} step={0.05} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.textSize = v; })} />
            <Slider label="Giro" value={scene.textRotate} min={-20} max={20} step={1} show={(v) => `${v}°`} onCommit={(v) => edit((s) => { s.textRotate = v; })} />
            <Slider label="Separación entre letras" value={scene.textSpacing} min={-0.05} max={0.4} step={0.01} show={(v) => v.toFixed(2)} onCommit={(v) => edit((s) => { s.textSpacing = v; })} />
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div className="col" style={{ gap: 4 }}>
                <span className="small muted">Posición</span>
                <div className="posgrid" role="group" aria-label="Posición del texto">
                  {GRID.map(([x, y], i) => {
                    const cx = scene.textX ?? 0.5, cy = scene.textY ?? (scene.textPosition === 'centro' ? 0.45 : 0.2);
                    const on = Math.abs(cx - x) < 0.06 && Math.abs(cy - y) < 0.06;
                    return <button key={i} className={on ? 'on' : ''} aria-label={`Posición ${i + 1} de 9`} aria-pressed={on} onClick={() => edit((s) => { s.textX = x; s.textY = y; })} />;
                  })}
                </div>
              </div>
              <div className="col" style={{ flex: 1, gap: 4 }}>
                <Slider label="Horizontal" value={scene.textX ?? 0.5} min={0.15} max={0.85} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.textX = v; })} />
                <Slider label="Vertical" value={scene.textY ?? (scene.textPosition === 'centro' ? 0.45 : 0.2)} min={0.1} max={0.85} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.textY = v; })} />
              </div>
            </div>
            </Group>
            <Group id="imagen" title="Imagen y cámara" hint={[LOOK_NAMES.find(([id]) => id === scene.look)?.[1], scene.camera !== 'ninguno' ? CAMERA_NAMES.find(([id]) => id === scene.camera)?.[1] : '', (scene.speed ?? 1) < 1 ? 'lenta' : ''].filter(Boolean).join(' · ')}>
            {scene.visual === 'broll' && scene.brollFile && (
              <label className="field">Cómo se ve el video de apoyo
                <select value={scene.brollLayout ?? 'completo'} onChange={(e) => edit((s) => { s.brollLayout = e.target.value as Scene['brollLayout']; })}>
                  <option value="completo">A pantalla completa</option>
                  <option value="arriba">Dividida: video de apoyo arriba, tú abajo</option>
                  <option value="abajo">Dividida: tú arriba, video de apoyo abajo</option>
                  <option value="recuadro">Tú en un recuadro sobre el video de apoyo</option>
                </select>
              </label>
            )}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Aspecto
                <select value={scene.look} onChange={(e) => edit((s) => { s.look = e.target.value as Scene['look']; })}>
                  {LOOK_NAMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>Cámara
                <select value={scene.camera} onChange={(e) => edit((s) => { s.camera = e.target.value as Scene['camera']; })}>
                  {CAMERA_NAMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Cámara lenta
              <select value={String(scene.speed ?? 1)} disabled={Boolean(slowing)} onChange={(e) => slowMotion(scene.id, Number(e.target.value))}>
                <option value="1">Normal</option>
                <option value="0.5">A la mitad (2×)</option>
                <option value="0.33">A un tercio (3×)</option>
                <option value="0.25">A un cuarto (4×)</option>
              </select>
            </label>
            {slowing ? <span className="pill" role="status">{slowing}</span> : (scene.speed ?? 1) < 1 ? <span className="small muted help">Suave: se crean los fotogramas intermedios. La voz de esta escena no suena (va bien con música).</span> : null}
            <Slider label="Tamaño del video" value={scene.videoScale} min={0.4} max={2.5} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.videoScale = v; })} />
            <span className="small muted help">Menos de 100 % lo deja como una tarjeta con tu video desenfocado de fondo; más lo acerca.</span>
            <Slider label="Fuerza del movimiento" value={scene.cameraAmount} min={0.03} max={0.5} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.cameraAmount = v; })} />
            <Slider label="Brillo" value={scene.brightness} min={0.5} max={1.6} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.brightness = v; })} />
            <Slider label="Contraste" value={scene.contrast} min={0.5} max={1.8} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.contrast = v; })} />
            <Slider label="Color (saturación)" value={scene.saturation} min={0} max={2} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.saturation = v; })} />
            <Slider label="Bordes oscuros (viñeta)" value={scene.vignette} min={0} max={1} step={0.02} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.vignette = v; })} />
            <div className="row">
              <button className="btn rect" style={{ height: 32 }} onClick={() => edit((s) => { s.brightness = 1; s.contrast = 1; s.saturation = 1; s.vignette = 0; s.look = 'normal'; })}>Imagen original</button>
              <button className="btn rect" style={{ height: 32 }} title="Copia el aspecto, los ajustes y la cámara de esta escena a todas" onClick={() => store.update((p) => { const o = p.scenes[idx]; for (const x of p.scenes) Object.assign(x, { look: o.look, brightness: o.brightness, contrast: o.contrast, saturation: o.saturation, vignette: o.vignette, camera: o.camera, cameraAmount: o.cameraAmount }); })}>Aplicar a todas las escenas</button>
            </div>
            <label className="row"><input type="checkbox" checked={scene.punchZoom} onChange={(e) => edit((s) => { s.punchZoom = e.target.checked; })} /> Zoom de golpe al entrar</label>
            </Group>
            <Group id="fondo" title="Fondo" hint={scene.backdrop === 'ninguno' ? 'El del video' : 'Cambiado'}>
            <label className="field">Fondo detrás de la persona
              <select value={scene.backdrop} disabled={!store.extras?.cutout} onChange={(e) => edit((s) => { s.backdrop = e.target.value as Scene['backdrop']; })}>
                <option value="ninguno">El del video (sin cambios)</option>
                <option value="cine">Desenfoque de cine (el fondo real, fuera de foco)</option>
                <option value="desenfoque">Mi video desenfocado</option>
                <option value="oscuro">Oscuro</option>
                <option value="claro">Claro</option>
                <option value="marca">Color de la marca</option>
                <option value="degradado">Degradado en movimiento</option>
                <option value="imagen" disabled={!scene.backdropFile}>Imagen o video{scene.backdropFile ? '' : ' (súbelo o créalo abajo)'}</option>
              </select>
            </label>
            {!store.extras?.cutout ? (
              <>
                <button className="btn rect" disabled={Boolean(cutting)} onClick={cutBackground}>{cutting || 'Recortar a la persona (sin pantalla verde)'}</button>
                <span className="small muted help">Se hace una sola vez por video y tarda unos minutos. Después eliges el fondo de cada escena.</span>
              </>
            ) : (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <label className="btn rect" style={{ cursor: 'pointer', height: 34 }}>Subir fondo
                  <input type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBackdrop(f); e.target.value = ''; }} />
                </label>
                <button className="btn rect" style={{ height: 34 }} disabled={Boolean(cutting)} onClick={backdropFromIdea}>{cutting || 'Crear fondo desde una idea'}</button>
              </div>
            )}
            </Group>
            {hasSpeech && sceneSpeech(scene, store.transcript) && (
              <Group id="dice" title="Lo que se dice">
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)' }}>{sceneSpeech(scene, store.transcript)}</div>
              </Group>
            )}
            <button className="btn rect" onClick={() => store.update((p) => { p.scenes = p.scenes.filter((s) => s.id !== scene.id); applyPunchZooms(p.scenes, p.pacing.punchZoomEvery); })}>Eliminar escena</button>
          </aside>
        )}
      </div>

      {jointScene && jointIdx > 0 && (
        <section className="trbar" aria-label="Transición entre escenas">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Transición entre la escena {jointIdx} y la {jointIdx + 1}</strong>
            <div className="row">
              <label className="row small muted">Duración
                {(() => {
                  const dur = jointScene.transition?.duration ?? transitions.find((x) => x.id === jointScene.transition?.id)?.duration ?? 0.35;
                  // Se escribe libre y se guarda al salir del campo (o con Enter).
                  return (
                    <input key={jointScene.id + String(dur)} className="input hex" type="number" min={0.1} max={1.5} step={0.05} disabled={!jointScene.transition} defaultValue={dur}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      onBlur={(e) => {
                        const n = Number(e.target.value.replace(',', '.'));
                        if (!Number.isFinite(n) || n <= 0) { e.target.value = String(dur); return; }
                        const v = Math.min(1.5, Math.max(0.1, n));
                        if (v !== dur) store.update((p) => { const s = p.scenes[jointIdx]; if (s.transition) s.transition.duration = v; });
                        else e.target.value = String(dur);
                      }} />
                  );
                })()} s
              </label>
              <button className="btn rect" style={{ height: 34 }} onClick={() => previewJoint(jointIdx)}>Ver</button>
              <button className="btn rect" style={{ height: 34 }} onClick={recommend}>Recomendar todas</button>
              <button className="btn sq" style={{ height: 34, width: 34 }} aria-label="Cerrar" onClick={() => setJoint(null)}><Icon name="close" /></button>
            </div>
          </div>
          <div className="row">
            <button className={`btn rect opt-tr ${!jointScene.transition ? 'on' : ''}`} onClick={() => store.update((p) => { p.scenes[jointIdx].transition = undefined; })}>Corte seco</button>
            {transitions.map((x) => (
              <button key={x.id} className={`btn rect opt-tr ${jointScene.transition?.id === x.id ? 'on' : ''}`} title={x.description}
                onClick={() => { store.update((p) => { p.scenes[jointIdx].transition = { id: x.id }; }); window.setTimeout(() => previewJoint(jointIdx), 350); }}>{x.name}</button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" style={{ flex: 1 }} value={trText} onChange={(e) => setTrText(e.target.value)} placeholder="¿Quieres otra? Descríbela: «que la escena caiga desde arriba como una cortina»"
              onKeyDown={(e) => { if (e.key === 'Enter' && trText.trim() && !busy) createTransition(); }} />
            <button className="btn cyan rect" disabled={!trText.trim() || Boolean(busy)} onClick={createTransition}>{busy ? 'IA trabajando…' : 'Crear con la IA'}</button>
            {busy && <span className="pill" role="status">{busy}</span>}
          </div>
        </section>
      )}

      <section className="tl" aria-label="Línea de tiempo">
        <div className="row small muted" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button className="btn rect" style={{ height: 30 }} onClick={split} title="Corta en dos la escena donde está el cursor rojo"><Icon name="scissors" />Dividir en el cursor</button>
          </div>
          <span>{drag ? `${drag.side === 'l' ? 'Inicio' : 'Final'}: ${drag.delta > 0 ? '+' : ''}${drag.delta.toFixed(1)} s` : 'Arrastra los bordes blancos de la escena elegida para recortarla o alargarla.'}</span>
        </div>
        <div className="track">
          <span>Video</span>
          <div className="lane" ref={lane} onClick={seekLane}>
            {spans.map((x, i) => (
              <button key={x.id} className={`clip ${x.id === selId ? 'sel' : ''}`} style={{ left: pct(x.from), width: pct(x.dur), background: 'var(--chip)', color: 'var(--text)' }}
                title={project.scenes[i].title || ROLE_LABEL[project.scenes[i].role]}
                onClick={(e) => { e.stopPropagation(); select(x.id); }}>
                {project.scenes[i].title || ROLE_LABEL[project.scenes[i].role]}
              </button>
            ))}
            {spans.filter((x) => x.id === selId).map((x) => (
              <React.Fragment key={`h${x.id}`}>
                <div className="handle" style={{ left: `calc(${pct(x.from)} + ${drag?.side === 'l' ? drag.delta / (total / timeline.fps) * 100 : 0}%)` }} onPointerDown={startDrag('l')} role="slider" aria-label="Borde inicial de la escena: arrastra para recortar o alargar" aria-valuenow={scene?.trimStart ?? 0} tabIndex={0} />
                <div className="handle r" style={{ left: `calc(${pct(x.from + x.dur)} + ${drag?.side === 'r' ? drag.delta / (total / timeline.fps) * 100 : 0}%)` }} onPointerDown={startDrag('r')} role="slider" aria-label="Borde final de la escena: arrastra para recortar o alargar" aria-valuenow={scene?.trimEnd ?? 0} tabIndex={0} />
              </React.Fragment>
            ))}
            {spans.map((x, i) => {
              if (i === 0) return null;
              const tr = project.scenes[i].transition;
              const name = tr ? transitions.find((y) => y.id === tr.id)?.name ?? tr.id : 'Corte seco';
              // Grande solo en las uniones de la escena elegida o la abierta; las demás son un punto
              // pequeño que no tapa las escenas (en montajes con muchos cortes se pisaban todas).
              const near = joint === x.id || x.id === selId || spans[i - 1].id === selId;
              if (dense && !near && !tr) return null;
              const small = !near;
              return (
                <button key={`j${x.id}`} className={`joint ${tr ? 'has' : ''} ${joint === x.id ? 'open' : ''}`}
                  style={{ left: pct(x.from), ...(small ? { width: 10, height: 10, margin: '-5px 0 0 -5px', borderWidth: 1, zIndex: 2 } : {}) }}
                  aria-label={`Transición entre la escena ${i} y la ${i + 1}: ${name}`} title={`Transición: ${name}`}
                  onClick={(e) => { e.stopPropagation(); setJoint(joint === x.id ? null : x.id); }}>
                  {small ? null : <Icon name={tr ? 'transition' : 'plus'} size={12} />}
                </button>
              );
            })}
            <Playhead player={player} playerKey={playerKey} total={total} />
          </div>
        </div>
        <div className="track">
          <span>Texto</span>
          <div className="lane" onClick={seekLane}>
            {timeline.overlays.map((o, i) => (
              <div key={i} className="clip" style={{ left: pct(o.fromFrame), width: pct(o.durationInFrames), background: 'var(--pink)', color: 'var(--onPink)' }}>{o.text}</div>
            ))}
            <Playhead player={player} playerKey={playerKey} total={total} />
          </div>
        </div>
        {hasCaptions && <div className="track">
          <span>Subtítulos</span>
          <div className="lane" onClick={seekLane}>
            {timeline.words.map((w, i) => (
              <div key={i} className="clip" style={{ left: pct(w.startFrame), width: pct(Math.max(1, w.endFrame - w.startFrame)), background: 'var(--cyan)', padding: 0, opacity: 0.8 }} />
            ))}
            <Playhead player={player} playerKey={playerKey} total={total} />
          </div>
        </div>}
        <div className="track">
          <span>{hasSpeech || project.audio.voiceover ? 'Voz' : 'Sonido'}</span>
          <div className="lane" onClick={() => ctx.go('audio')} title="Abrir la pantalla de Audio">
            {timeline.sfx.map((e, i) => <div key={i} className="clip" style={{ left: pct(e.fromFrame), width: 6, padding: 0, background: 'var(--cyan)', zIndex: 1 }} />)}
            <div className="clip" style={{ left: 0, width: '100%', background: 'var(--violet)', color: 'var(--onViolet)' }}>{project.audio.voiceover ? `Voz en off · ${project.audio.voiceover.provider}` : project.kind === 'montaje' ? `Sonido original · ${Math.round(project.audio.originalVolume * 100)}%` : 'Voz limpia'}{project.audio.music ? ' · con música' : ''}</div>
            <Playhead player={player} playerKey={playerKey} total={total} />
          </div>
        </div>
      </section>
    </>
  );
};
