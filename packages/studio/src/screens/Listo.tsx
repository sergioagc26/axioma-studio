import React, { useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { CAPTION_DESIGNS, outputDuration } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import type { Ctx } from '../App.tsx';
import { timelineFor } from '../timeline.ts';
import { api, askAssistant, waitJob, type Job } from '../useProject.ts';

/** Cambios que se piden con un toque (los hace la IA con la lista de cambios que sabe hacer). */
const QUICK: [string, string, string][] = [
  ['⚡', 'Más rápido', 'Hazlo más rápido: intensidad fuerte y quita la escena menos importante del medio.'],
  ['🧘', 'Más calmado', 'Hazlo más calmado: intensidad suave.'],
  ['🔠', 'Letras más grandes', 'Pon los subtítulos en mayúsculas y con 2 palabras por línea.'],
  ['🎨', 'Otro look', 'Cambia el diseño de los subtítulos por otro distinto que se lea bien.'],
];

/**
 * Resultado: lo primero que se ve al terminar la edición. El video grande, qué se le hizo
 * (en iconos) y tres caminos: exportar, pedir un cambio con palabras o abrir los ajustes avanzados.
 */
export const Listo: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const timeline = useMemo(() => timelineFor(project, store), [project, store.transcript, store.brand, store.extras]);
  const total = Math.max(1, timeline.durationInFrames);
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');

  const reload = async () => {
    const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
    store.replace(d.project);
    await store.reloadExtras();
  };
  const ask = async (request: string) => {
    if (!request.trim() || busy) return;
    setBusy('Pensando…');
    try {
      const r = await askAssistant(project.id, request.trim(), undefined, setBusy);
      await reload();
      setText('');
      ctx.toast(`${r.text} Vuelve a exportar para tener el video con el cambio.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };
  const otherMusic = async () => {
    if (busy) return;
    setBusy('Buscando otra canción…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'otra-musica' }) });
      const done = await waitJob(job, (j) => setBusy(j.message));
      await reload();
      ctx.toast(String(done.result?.text ?? 'Canción cambiada.'));
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  const texts = project.scenes.filter((s) => s.onScreenText).length;
  const motions = project.scenes.filter((s) => s.visual === 'motion').length;
  const broll = project.scenes.filter((s) => s.visual === 'broll').length;
  const trans = project.scenes.filter((s) => s.transition).length;
  const song = project.assets.find((a) => a.file === project.audio.music)?.source?.replace(/^Biblioteca de música:\s*/, '');
  const done: [string, string, string][] = [
    ['✂️', `${outputDuration(project).toFixed(0)} s`, `${project.scenes.length} escenas, sin silencios ni tomas repetidas`],
    ['💬', 'Subtítulos', CAPTION_DESIGNS.find((d) => d.id === project.captions.design)?.name ?? project.captions.design],
    ...(texts ? [['🔤', `${texts} textos`, 'Gancho, ideas clave y cierre en pantalla'] as [string, string, string]] : []),
    ...(motions ? [['📊', `${motions} gráfico${motions > 1 ? 's' : ''}`, 'Animados con tus cifras y frases'] as [string, string, string]] : []),
    ...(broll ? [['🎞️', `${broll} b-roll`, 'Videos de apoyo según lo que dices'] as [string, string, string]] : []),
    ...(trans ? [['✨', `${trans} transiciones`, 'Entre escenas'] as [string, string, string]] : []),
    project.audio.music ? ['🎵', 'Música', song ?? 'Puesta'] : ['🔇', 'Sin música', 'Toca «Otra canción» para ponerle'],
    ...(project.audio.sfxAuto ? [['🔊', 'Efectos', 'Sonidos en transiciones y textos'] as [string, string, string]] : []),
    ...(project.finish.lowerThird ? [['🏷️', 'Rótulo', project.finish.lowerThird.name] as [string, string, string]] : []),
  ];

  return (
    <div className="cols" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <div className="listo-player">
        <Player
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
      </div>

      <main className="card col" style={{ flex: '1 1 340px', maxWidth: 460, gap: 18, padding: 24, borderRadius: 20 }}>
        <header className="col" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>🎉 Tu video está listo</h1>
          <span className="muted">Míralo. Si te gusta, expórtalo; si no, dime qué cambiar.</span>
        </header>

        <div className="done-grid">
          {done.map(([icon, title, detail]) => (
            <div key={title} className="done-item" title={detail}>
              <span aria-hidden="true" style={{ fontSize: 22 }}>{icon}</span>
              <strong className="small">{title}</strong>
            </div>
          ))}
        </div>

        {ctx.exporting ? (
          <div className="col" style={{ gap: 6 }} role="status">
            <strong>⏳ Exportando tu video… {Math.round(ctx.exporting.progress * 100)} %</strong>
            <div className="progress"><div style={{ width: `${Math.round(ctx.exporting.progress * 100)}%` }} /></div>
          </div>
        ) : ctx.lastExport ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--cyanSoft)' }}>
            <strong>✅ Video exportado</strong>
            <span className="small" style={{ wordBreak: 'break-all' }}>{ctx.lastExport.path}</span>
            <div className="row">
              {ctx.lastExport.file && <a className="btn primary" href={`/media/${encodeURIComponent(project.id)}/${ctx.lastExport.file}`} target="_blank" rel="noreferrer">▶️ Abrir</a>}
              {ctx.lastExport.file && <a className="btn rect" href={`/media/${encodeURIComponent(project.id)}/${ctx.lastExport.file}`} download>⬇️ Descargar</a>}
              <button className="btn rect" disabled={Boolean(busy)} onClick={ctx.exportVideo} title="Otro formato, calidad o carpeta">⚙️ Exportar de otra forma</button>
            </div>
          </div>
        ) : (
          <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={Boolean(busy)} onClick={() => void ctx.exportNow()}>⬇️ Exportar video</button>
        )}

        <section className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>✏️ ¿Cambiamos algo?</h2>
          <div className="bchips">
            {QUICK.map(([icon, label, request]) => (
              <button key={label} className="bchip" disabled={Boolean(busy)} onClick={() => ask(request)}><span aria-hidden="true">{icon}</span> {label}</button>
            ))}
            <button className="bchip" disabled={Boolean(busy)} onClick={otherMusic}><span aria-hidden="true">🎵</span> Otra canción</button>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input style={{ flex: 1, minWidth: 0 }} value={text} disabled={Boolean(busy)} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(text); }}
              placeholder="Escríbelo con tus palabras: «quita la parte del medio»" aria-label="Pedir un cambio" />
            <button className="btn rect" disabled={Boolean(busy) || !text.trim()} onClick={() => ask(text)}>Pedir</button>
          </div>
          {busy && <span className="pill" role="status" style={{ alignSelf: 'flex-start' }}>{busy}</span>}
        </section>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => ctx.go('brief')}>‹ Cambiar respuestas</button>
          <button className="btn ghost" onClick={() => ctx.go('editor', { s: null })}>🎛️ Ajustes avanzados</button>
        </div>
      </main>
    </div>
  );
};
