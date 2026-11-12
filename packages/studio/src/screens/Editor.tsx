import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { FONT_FAMILIES, MIN_CLIP, recommendPreset, applyVariant, buildTimeline, effectiveRanges, keywordOf, sceneLength, suggestVariants, type Scene } from '@snz/schema';
import { Reel } from '@snz/remotion/src/Reel.tsx';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL } from '../SceneFrame.tsx';
import { api, applyPunchZooms, askAssistant, sceneSpeech } from '../useProject.ts';

const COLORS = ['#FE2C55', '#25F4EE', '#FFFFFF', '#FACC15'];

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
  ['etiqueta', 'Etiqueta', 'Una píldora oscura con un punto de color; discreta, para b-roll o datos.'],
];

const TEXT_ANIMS: [Scene['textAnim'], string][] = [['subir', 'Sube'], ['pop', 'Salta'], ['deslizar', 'Desliza'], ['fundido', 'Aparece'], ['barrido', 'Se revela']];
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

/** Barra para recortar segundos de un clip; guarda al soltar. */
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

export const Editor: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const player = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [safe, setSafe] = useState(true);
  const media = (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;

  const timeline = useMemo(() => buildTimeline(project, store.transcript, {
    video: media(project.source.proxy ?? 'media/master.mp4'),
    voice: project.audio.processedVoice ? media(project.audio.processedVoice) : undefined,
    music: project.audio.music ? media(project.audio.music) : undefined,
    asset: media,
    brand: store.brand,
    voiceover: store.extras?.voiceover,
    faces: store.extras?.faces,
    transitions: store.extras?.transitions,
  }), [project, store.transcript, store.brand, store.extras]);

  /** Inicio y duración (en frames) de cada escena en la salida. */
  const spans = useMemo(() => project.scenes.map((s) => {
    const clips = timeline.clips.filter((c) => c.sceneId === s.id);
    const from = clips[0]?.fromFrame ?? 0;
    return { id: s.id, from, dur: clips.reduce((a, c) => a + c.durationInFrames, 0) };
  }), [project.scenes, timeline]);

  const playing = spans.find((x) => frame >= x.from && frame < x.from + x.dur)?.id;
  const selId = ctx.sceneId && project.scenes.some((s) => s.id === ctx.sceneId) ? ctx.sceneId : playing ?? project.scenes[0]?.id;
  const scene = project.scenes.find((s) => s.id === selId);
  const idx = project.scenes.findIndex((s) => s.id === selId);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', on);
    return () => p.removeEventListener('frameupdate', on);
  }, [timeline.durationInFrames > 0]);

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

  // Atajos: espacio reproduce/pausa, flechas cambian de escena.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); player.current?.toggle(); }
      if (e.key === 'ArrowRight' && project.scenes[idx + 1]) select(project.scenes[idx + 1].id);
      if (e.key === 'ArrowLeft' && project.scenes[idx - 1]) select(project.scenes[idx - 1].id);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  // Siempre hay 3 variantes para el clip seleccionado: las guardadas o, si no hay, sugeridas al instante.
  const quick = useMemo(
    () => (!scene ? [] : scene.variants.length ? scene.variants.slice(0, 4) : suggestVariants(project, scene, store.transcript)),
    [project, scene, store.transcript],
  );

  /** Arrastre del borde de un clip: recorta (hacia dentro) o alarga (hacia fuera). */
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
    const clip = timeline.clips.find((c) => frame >= c.fromFrame && frame < c.fromFrame + c.durationInFrames);
    if (!clip) return;
    const at = (clip.sourceStartFrame + (frame - clip.fromFrame)) / timeline.fps;
    const i = project.scenes.findIndex((s) => s.id === clip.sceneId);
    const ranges = effectiveRanges(project.scenes[i], project.source.duration);
    const a = ranges.filter((r) => r.end <= at).concat(ranges.filter((r) => r.start < at && r.end > at).map((r) => ({ start: r.start, end: at })));
    const b = ranges.filter((r) => r.start < at && r.end > at).map((r) => ({ start: at, end: r.end })).concat(ranges.filter((r) => r.start >= at));
    const len = (x: typeof ranges) => x.reduce((n, r) => n + r.end - r.start, 0);
    if (len(a) < MIN_CLIP || len(b) < MIN_CLIP) return ctx.toast('Mueve el cursor más al centro del clip para dividirlo.');
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
  const rec = useMemo(() => recommendPreset(project, store.transcript), [project.kind, store.transcript]);
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
      ctx.toast(`Transiciones recomendadas: ${used} con efecto y ${d.advice.length - used} con corte seco. Deshacer con ⌘Z.`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  /** Claude crea una transición nueva a partir de la descripción y la aplica a la escena elegida. */
  const createTransition = async () => {
    const desc = trText.trim();
    if (!desc || !scene) return;
    setBusy('Enviando a Claude…');
    try {
      const target = jointScene?.id ?? (idx > 0 ? scene.id : project.scenes[1]?.id);
      const r = await askAssistant(project.id, `Crea una transición nueva con crear_transicion según esta descripción: "${desc}". Tiene que encajar con el estilo del reel (preset ${project.presetId}).${target ? ` Luego aplícala a la escena ${target} con poner_transicion.` : ''}`, target, setBusy);
      setTrText('');
      await store.reloadExtras();
      ctx.toast(r.saved || r.text.length <= 220 ? r.text : r.text.slice(0, 218) + '…');
    } catch (e: any) { ctx.toast(`Claude no pudo hacerlo: ${e.message}`); } finally { setBusy(''); }
  };

  const applyPreset = async (presetId: string) => {
    try {
      const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'preset', presetId }) });
      store.replace(d.project);
    } catch (e: any) { ctx.toast(e.message); }
  };

  const total = Math.max(1, timeline.durationInFrames);
  const pct = (f: number) => `${(f / total) * 100}%`;
  const fmt = (f: number) => `${Math.floor(f / timeline.fps / 60)}:${String(Math.floor(f / timeline.fps) % 60).padStart(2, '0')}`;
  const seekLane = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.current?.seekTo(Math.round(((e.clientX - r.left) / r.width) * total));
  };

  if (!project.scenes.length) return <div className="page"><p className="muted">No hay escenas todavía. Pídele a Claude que arme el storyboard.</p></div>;

  return (
    <>
      <div className="editor">
        <aside className="side l">
          <details className="grp" open>
            <summary>Estilos</summary>
            <div className="col">
              {rec && rec.id !== project.presetId && (
                <div className="col" style={{ padding: 10, borderRadius: 10, background: 'var(--cyanSoft)', gap: 6 }}>
                  <strong className="small">Recomendado: {store.presets.find((p) => p.id === rec.id)?.name}</strong>
                  <span className="small muted">{rec.reason}</span>
                  <button className="btn cyan" style={{ height: 34 }} onClick={() => applyPreset(rec.id)}>Aplicar este estilo</button>
                </div>
              )}
          {store.presets.map((p) => (
            <button key={p.id} className={`tpl ${project.presetId === p.id ? 'on' : ''}`} onClick={() => applyPreset(p.id)}>
              <span style={{ width: 30, height: 52, borderRadius: 6, background: '#1E1E22', flex: 'none', display: 'grid', placeItems: 'end center', paddingBottom: 6 }} aria-hidden="true">
                <span style={{ width: 18, height: 4, borderRadius: 2, background: p.captions.highlightColor }} />
              </span>
              <span className="col" style={{ gap: 2, minWidth: 0 }}>
                <strong>{p.name}</strong>
                <span className="small muted">{p.description}</span>
              </span>
            </button>
          ))}
            </div>
          </details>
          <details className="grp">
            <summary>Subtítulos</summary>
            <div className="col">
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className={project.captions.mode === 'word' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'word'; })}>Palabra a palabra</button>
            <button className={project.captions.mode === 'phrase' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'phrase'; })}>Frase completa</button>
          </div>
          <label className="field">Cómo se marca la palabra que suena
            <select value={project.captions.effect} onChange={(e) => store.update((p) => { p.captions.effect = e.target.value as typeof p.captions.effect; })}>
              <option value="color">Cambia de color</option><option value="caja">Caja de color detrás</option><option value="pop">Salta y crece</option><option value="subrayado">Subrayado</option>
            </select>
          </label>
          <label className="row"><input type="checkbox" checked={project.captions.emphasis} onChange={(e) => store.update((p) => { p.captions.emphasis = e.target.checked; })} /> Remarcar la palabra más importante</label>
          <span className="small muted">Color de resaltado</span>
          <ColorRow value={project.captions.highlightColor} label="Color de resaltado de subtítulos" onPick={(c) => store.update((p) => { p.captions.highlightColor = c; })} />
          <span className="small muted">Color de las letras</span>
          <ColorRow value={project.captions.color} label="Color de las letras de subtítulos" swatches={['#FFFFFF', '#FACC15', '#25F4EE', '#000000']} onPick={(c) => store.update((p) => { p.captions.color = c; })} />
          <label className="field">Tipografía
            <select value={project.captions.fontFamily} onChange={(e) => store.update((p) => { p.captions.fontFamily = e.target.value; p.captions.fontWeight = ['Anton', 'Bebas Neue', 'Archivo Black'].includes(e.target.value) ? 400 : e.target.value === 'Oswald' ? 700 : 800; })}>
              {FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <SizeSlider value={project.captions.fontSize} onCommit={(v) => store.update((p) => { p.captions.fontSize = v; })} />
          <label className="row"><input type="checkbox" checked={project.captions.uppercase} onChange={(e) => store.update((p) => { p.captions.uppercase = e.target.checked; })} /> Mayúsculas</label>
          <label className="row"><input type="checkbox" checked={project.captions.stroke} onChange={(e) => store.update((p) => { p.captions.stroke = e.target.checked; })} /> Borde negro en las letras</label>

            </div>
          </details>
        </aside>

        <main className="stage">
          <div className="row small muted">
            <span className="pill line">9:16 · {project.format.width}×{project.format.height}</span>
            <label className="row"><input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Zonas seguras</label>
            <span>{fmt(frame)} / {fmt(total)}</span>
          </div>
          <div className="playerbox">
            <Player
              ref={player}
              component={Reel}
              inputProps={timeline}
              durationInFrames={total}
              fps={timeline.fps}
              compositionWidth={timeline.width}
              compositionHeight={timeline.height}
              style={{ width: '100%', height: '100%' }}
              controls
              acknowledgeRemotionLicense
            />
            {safe && <div className="safe" aria-hidden="true" />}
          </div>
          <div className="row">
            <button className="btn sq" aria-label="Escena anterior" disabled={idx <= 0} onClick={() => select(project.scenes[idx - 1].id)}>⏮</button>
            <button className="btn primary sq" style={{ borderRadius: 999, width: 44, height: 44 }} aria-label="Reproducir o pausar" onClick={() => player.current?.toggle()}>▶</button>
            <button className="btn sq" aria-label="Escena siguiente" disabled={idx >= project.scenes.length - 1} onClick={() => select(project.scenes[idx + 1].id)}>⏭</button>
          </div>
        </main>

        {scene && (
          <aside className="side r">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ fontSize: 18 }}>Escena {idx + 1} · {scene.title || ROLE_LABEL[scene.role]}</h2>
              <span className="small muted">{((spans[idx]?.dur ?? 0) / timeline.fps).toFixed(1)} s</span>
            </div>
            <label className="field">Título
              <input key={scene.id + 't'} defaultValue={scene.title} onBlur={(e) => e.target.value !== scene.title && edit((s) => { s.title = e.target.value; })} />
            </label>
            <label className="field">Rol
              <select value={scene.role} onChange={(e) => edit((s) => { s.role = e.target.value as Scene['role']; })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <div className="col" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--panel2)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Duración del clip</strong>
                <span className="small muted">{sceneLength(scene).toFixed(1)} s de {fullLength.toFixed(1)} s</span>
              </div>
              <TrimSlider label="Quitar del inicio" value={scene.trimStart} max={Math.max(0, fullLength - MIN_CLIP - scene.trimEnd)} onCommit={(v) => edit((s) => { s.trimStart = v; })} />
              <TrimSlider label="Quitar del final" value={scene.trimEnd} max={Math.max(0, fullLength - MIN_CLIP - scene.trimStart)} onCommit={(v) => edit((s) => { s.trimEnd = v; })} />
              {(scene.trimStart > 0 || scene.trimEnd > 0) && <button className="btn ghost" style={{ alignSelf: 'flex-start', height: 28 }} onClick={() => edit((s) => { s.trimStart = 0; s.trimEnd = 0; })}>Recuperar el clip entero</button>}
            </div>
            <details className="grp" open>
              <summary>Variantes para este clip</summary>
              <div className="col">
            <div className="col">
                            <span className="muted small">Una de cada tipo: gráficos, b-roll, color y tipografía. Toca una para aplicarla.</span>
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
              <button className="btn cyan" onClick={() => ctx.go('variantes', { s: scene.id })}>Más opciones y pedir a Claude</button>
            </div>
              </div>
            </details>
            <details className="grp" open>
              <summary>Texto en pantalla</summary>
              <div className="col">
            <label className="field">Texto en pantalla
              <textarea key={scene.id + 'o'} rows={2} defaultValue={scene.onScreenText ?? ''} placeholder="Máximo 6 palabras"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (scene.onScreenText ?? '')) edit((s) => { s.onScreenText = v || undefined; }); }} />
            </label>
            <div className="col">
              <span className="small muted">Color del texto</span>
              <ColorRow value={scene.textColor ?? project.captions.highlightColor} label="Color del texto" onPick={(c) => edit((s) => { s.textColor = c; })} />
            </div>
            <label className="field">Estilo del texto
              <select value={scene.textStyle} onChange={(e) => edit((s) => { s.textStyle = e.target.value as Scene['textStyle']; })}>
                {TEXT_STYLES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <span className="small muted">{TEXT_STYLES.find(([id]) => id === scene.textStyle)?.[2]}</span>
            <label className="field">Palabra a remarcar
              <input key={scene.id + 'k' + (scene.onScreenText ?? '')} defaultValue={scene.textKeyword ?? ''} placeholder={keywordOf(scene.onScreenText ?? '') || 'Automática'}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (scene.textKeyword ?? '')) edit((s) => { s.textKeyword = v || undefined; }); }} />
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Tipografía
                <select value={scene.textFont ?? ''} onChange={(e) => edit((s) => { s.textFont = e.target.value || undefined; })}>
                  <option value="">Igual que los subtítulos</option>
                  {FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>Entrada
                <select value={scene.textAnim} onChange={(e) => edit((s) => { s.textAnim = e.target.value as Scene['textAnim']; })}>
                  {TEXT_ANIMS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            <Slider label="Tamaño" value={scene.textSize} min={0.5} max={2} step={0.05} show={(v) => `${Math.round(v * 100)} %`} onCommit={(v) => edit((s) => { s.textSize = v; })} />
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
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Imagen
                <select value={scene.look} onChange={(e) => edit((s) => { s.look = e.target.value as Scene['look']; })}>
                  <option value="normal">Normal</option><option value="bn">Blanco y negro</option><option value="calido">Cálido</option><option value="frio">Frío</option><option value="contraste">Alto contraste</option>
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>Cámara
                <select value={scene.camera} onChange={(e) => edit((s) => { s.camera = e.target.value as Scene['camera']; })}>
                  <option value="ninguno">Quieta</option><option value="acercar">Se acerca</option><option value="alejar">Se aleja</option>
                </select>
              </label>
            </div>
            <label className="row"><input type="checkbox" checked={scene.punchZoom} onChange={(e) => edit((s) => { s.punchZoom = e.target.checked; })} /> Zoom de golpe al entrar</label>
              </div>
            </details>
            <details className="grp">
              <summary>Lo que se dice</summary>
              <div className="col">
            <div className="col">
              <span className="small muted">Lo que se dice</span>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)' }}>{sceneSpeech(scene, store.transcript) || '—'}</div>
            </div>
              </div>
            </details>
            <button className="btn rect" onClick={() => store.update((p) => { p.scenes = p.scenes.filter((s) => s.id !== scene.id); applyPunchZooms(p.scenes, p.pacing.punchZoomEvery); })}>Eliminar escena</button>
          </aside>
        )}
      </div>

      {jointScene && jointIdx > 0 && (
        <section className="trbar" aria-label="Transición entre clips">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Transición entre la escena {jointIdx} y la {jointIdx + 1}</strong>
            <div className="row">
              <label className="row small muted">Duración
                <input className="input hex" type="number" min={0.1} max={1.5} step={0.05} disabled={!jointScene.transition}
                  value={jointScene.transition?.duration ?? transitions.find((x) => x.id === jointScene.transition?.id)?.duration ?? 0.35}
                  onChange={(e) => { const v = Math.min(1.5, Math.max(0.1, Number(e.target.value) || 0.35)); store.update((p) => { const s = p.scenes[jointIdx]; if (s.transition) s.transition.duration = v; }); }} /> s
              </label>
              <button className="btn rect" style={{ height: 34 }} onClick={() => previewJoint(jointIdx)}>Ver</button>
              <button className="btn rect" style={{ height: 34 }} onClick={recommend}>Recomendar todas</button>
              <button className="btn sq" style={{ height: 34, width: 34 }} aria-label="Cerrar" onClick={() => setJoint(null)}>✕</button>
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
            <button className="btn cyan rect" disabled={!trText.trim() || Boolean(busy)} onClick={createTransition}>{busy ? 'Claude trabajando…' : 'Crear con Claude'}</button>
            {busy && <span className="pill" role="status">{busy}</span>}
          </div>
        </section>
      )}

      <section className="tl" aria-label="Línea de tiempo">
        <div className="row small muted" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button className="btn rect" style={{ height: 30 }} onClick={split} title="Corta en dos el clip donde está el cursor rojo">✂ Dividir en el cursor</button>
            <button className="btn rect" style={{ height: 30 }} disabled={!scene} onClick={() => edit((s) => { s.trimStart = 0; s.trimEnd = 0; })}>Recuperar clip entero</button>
            <button className="btn rect" style={{ height: 30 }} disabled={!scene} onClick={() => store.update((p) => { p.scenes = p.scenes.filter((s) => s.id !== selId); applyPunchZooms(p.scenes, p.pacing.punchZoomEvery); })}>Eliminar clip</button>
          </div>
          <span>{drag ? `${drag.side === 'l' ? 'Inicio' : 'Final'}: ${drag.delta > 0 ? '+' : ''}${drag.delta.toFixed(1)} s` : 'Arrastra los bordes blancos del clip seleccionado para recortarlo o alargarlo.'}</span>
        </div>
        <div className="track">
          <span>Video</span>
          <div className="lane" ref={lane} onClick={seekLane}>
            {spans.map((x, i) => (
              <button key={x.id} className={`clip ${x.id === selId ? 'sel' : ''}`} style={{ left: pct(x.from), width: pct(x.dur), background: 'var(--chip)', color: 'var(--text)' }}
                onClick={(e) => { e.stopPropagation(); select(x.id); }}>
                {project.scenes[i].title || ROLE_LABEL[project.scenes[i].role]}
              </button>
            ))}
            {spans.filter((x) => x.id === selId).map((x) => (
              <React.Fragment key={`h${x.id}`}>
                <div className="handle" style={{ left: `calc(${pct(x.from)} + ${drag?.side === 'l' ? drag.delta / (total / timeline.fps) * 100 : 0}%)` }} onPointerDown={startDrag('l')} role="slider" aria-label="Borde inicial del clip: arrastra para recortar o alargar" aria-valuenow={scene?.trimStart ?? 0} tabIndex={0} />
                <div className="handle r" style={{ left: `calc(${pct(x.from + x.dur)} + ${drag?.side === 'r' ? drag.delta / (total / timeline.fps) * 100 : 0}%)` }} onPointerDown={startDrag('r')} role="slider" aria-label="Borde final del clip: arrastra para recortar o alargar" aria-valuenow={scene?.trimEnd ?? 0} tabIndex={0} />
              </React.Fragment>
            ))}
            {spans.map((x, i) => {
              if (i === 0) return null;
              const tr = project.scenes[i].transition;
              const name = tr ? transitions.find((y) => y.id === tr.id)?.name ?? tr.id : 'Corte seco';
              return (
                <button key={`j${x.id}`} className={`joint ${tr ? 'has' : ''} ${joint === x.id ? 'open' : ''}`} style={{ left: pct(x.from) }}
                  aria-label={`Transición entre la escena ${i} y la ${i + 1}: ${name}`} title={`Transición: ${name}`}
                  onClick={(e) => { e.stopPropagation(); setJoint(joint === x.id ? null : x.id); }}>
                  {tr ? '◆' : '+'}
                </button>
              );
            })}
            <div className="playhead" style={{ left: pct(frame) }} />
          </div>
        </div>
        <div className="track">
          <span>Texto</span>
          <div className="lane" onClick={seekLane}>
            {timeline.overlays.map((o, i) => (
              <div key={i} className="clip" style={{ left: pct(o.fromFrame), width: pct(o.durationInFrames), background: 'var(--pink)', color: 'var(--onPink)' }}>{o.text}</div>
            ))}
            <div className="playhead" style={{ left: pct(frame) }} />
          </div>
        </div>
        <div className="track">
          <span>Subtítulos</span>
          <div className="lane" onClick={seekLane}>
            {timeline.words.map((w, i) => (
              <div key={i} className="clip" style={{ left: pct(w.startFrame), width: pct(Math.max(1, w.endFrame - w.startFrame)), background: 'var(--cyan)', padding: 0, opacity: 0.8 }} />
            ))}
            <div className="playhead" style={{ left: pct(frame) }} />
          </div>
        </div>
        <div className="track">
          <span>Voz</span>
          <div className="lane" onClick={() => ctx.go('audio')} title="Abrir la pantalla de Audio">
            {timeline.sfx.map((e, i) => <div key={i} className="clip" style={{ left: pct(e.fromFrame), width: 6, padding: 0, background: 'var(--cyan)', zIndex: 1 }} />)}
            <div className="clip" style={{ left: 0, width: '100%', background: 'var(--violet)', color: 'var(--onViolet)' }}>{project.audio.voiceover ? `Voz en off · ${project.audio.voiceover.provider}` : project.kind === 'montaje' ? `Sonido original · ${Math.round(project.audio.originalVolume * 100)}%` : `Voz limpia · ${project.audio.targetLufs} LUFS`}{project.audio.music ? ' · con música' : ''}</div>
            <div className="playhead" style={{ left: pct(frame) }} />
          </div>
        </div>
      </section>
    </>
  );
};
