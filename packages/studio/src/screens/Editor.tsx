import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { buildTimeline, type Scene } from '@snz/schema';
import { Reel } from '@snz/remotion/src/Reel.tsx';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL } from '../SceneFrame.tsx';
import { api, applyPunchZooms, sceneSpeech } from '../useProject.ts';

const COLORS = ['#FE2C55', '#25F4EE', '#FFFFFF', '#FACC15'];
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
  }), [project, store.transcript, store.brand]);

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

  const edit = (fn: (s: Scene) => void) => store.update((p) => {
    const s = p.scenes.find((x) => x.id === selId);
    if (s) fn(s);
  });

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
          <h2 style={{ fontSize: 16 }}>Presets</h2>
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
          <h2 style={{ fontSize: 16, marginTop: 6 }}>Subtítulos</h2>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className={project.captions.mode === 'word' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'word'; })}>Palabra a palabra</button>
            <button className={project.captions.mode === 'phrase' ? 'on' : ''} onClick={() => store.update((p) => { p.captions.mode = 'phrase'; })}>Frase completa</button>
          </div>
          <div className="row" aria-label="Color de resaltado de subtítulos">
            {COLORS.map((c) => (
              <button key={c} className={`swatch ${project.captions.highlightColor.toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Resaltado ${c}`}
                onClick={() => store.update((p) => { p.captions.highlightColor = c; })} />
            ))}
          </div>
          <label className="row"><input type="checkbox" checked={project.captions.uppercase} onChange={(e) => store.update((p) => { p.captions.uppercase = e.target.checked; })} /> Mayúsculas</label>
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
            <label className="field">Texto en pantalla
              <textarea key={scene.id + 'o'} rows={2} defaultValue={scene.onScreenText ?? ''} placeholder="Máximo 6 palabras"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (scene.onScreenText ?? '')) edit((s) => { s.onScreenText = v || undefined; }); }} />
            </label>
            <div className="col">
              <span className="small muted">Color del texto</span>
              <div className="row">
                {COLORS.map((c) => (
                  <button key={c} className={`swatch ${(scene.textColor ?? project.captions.highlightColor).toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`}
                    onClick={() => edit((s) => { s.textColor = c; })} />
                ))}
              </div>
            </div>
            <label className="row"><input type="checkbox" checked={scene.punchZoom} onChange={(e) => edit((s) => { s.punchZoom = e.target.checked; })} /> Zoom de golpe al entrar</label>
            <div className="col">
              <span className="small muted">Lo que se dice</span>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)' }}>{sceneSpeech(scene, store.transcript) || '—'}</div>
            </div>
            <button className="btn rect" onClick={() => store.update((p) => { p.scenes = p.scenes.filter((s) => s.id !== scene.id); applyPunchZooms(p.scenes, p.pacing.punchZoomEvery); })}>Eliminar escena</button>
            <div className="col" style={{ marginTop: 'auto', padding: 14, borderRadius: 12, background: 'var(--cyanSoft)' }}>
              <strong>¿No te convence esta escena?</strong>
              <span className="muted small">La IA te propone versiones con otro texto, color, b-roll o motion graphics.</span>
              <button className="btn cyan" onClick={() => ctx.go('variantes', { s: scene.id })}>Ver variantes</button>
            </div>
          </aside>
        )}
      </div>

      <section className="tl" aria-label="Línea de tiempo">
        <div className="track">
          <span>Video</span>
          <div className="lane" onClick={seekLane}>
            {spans.map((x, i) => (
              <button key={x.id} className={`clip ${x.id === selId ? 'sel' : ''}`} style={{ left: pct(x.from), width: pct(x.dur), background: 'var(--chip)', color: 'var(--text)' }}
                onClick={(e) => { e.stopPropagation(); select(x.id); }}>
                {project.scenes[i].title || ROLE_LABEL[project.scenes[i].role]}
              </button>
            ))}
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
          <div className="lane" onClick={seekLane}>
            <div className="clip" style={{ left: 0, width: '100%', background: 'var(--violet)', color: 'var(--onViolet)' }}>Voz limpia · {project.audio.targetLufs} LUFS</div>
            <div className="playhead" style={{ left: pct(frame) }} />
          </div>
        </div>
      </section>
    </>
  );
};
