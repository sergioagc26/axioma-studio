import React, { useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { CAPTION_DESIGNS, outputDuration } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import type { Ctx } from '../App.tsx';
import { timelineFor } from '../timeline.ts';
import { Icon } from '../Icon.tsx';
import type { IconName } from '../icons.ts';
import { api, askAssistant, waitJob, type Job } from '../useProject.ts';
import { CuentasPanel, PublicarBox, useCuentas } from '../Cuentas.tsx';

/** Cambios que se piden con un toque (los hace la IA con la lista de cambios que sabe hacer). */
const QUICK: [IconName, string, string][] = [
  ['bolt', 'Más rápido', 'Hazlo más rápido: intensidad fuerte y quita la escena menos importante del medio.'],
  ['calm', 'Más calmado', 'Hazlo más calmado: intensidad suave.'],
  ['letters', 'Letras más grandes', 'Pon los subtítulos en mayúsculas y con 2 palabras por línea.'],
  ['palette', 'Otro look', 'Cambia el diseño de los subtítulos por otro distinto que se lea bien.'],
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
  // Publicar en Instagram: sin cuenta conectada se abre primero el panel de cuentas.
  const [publicar, setPublicar] = useState(false);
  const [cuentasOpen, setCuentasOpen] = useState(false);
  const sinCuenta = useCuentas()?.instagram.cuentas.length === 0;

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
  const done: [IconName, string, string][] = [
    ['scissors', `${outputDuration(project).toFixed(0)} s`, `${project.scenes.length} escenas, sin silencios ni tomas repetidas`],
    ['captions', 'Subtítulos', CAPTION_DESIGNS.find((d) => d.id === project.captions.design)?.name ?? project.captions.design],
    ...(texts ? [['title', `${texts} textos`, 'Gancho, ideas clave y cierre en pantalla'] as [IconName, string, string]] : []),
    ...(motions ? [['chart', `${motions} gráfico${motions > 1 ? 's' : ''}`, 'Animados con tus cifras y frases'] as [IconName, string, string]] : []),
    ...(broll ? [['film', `${broll} b-roll`, 'Videos de apoyo según lo que dices'] as [IconName, string, string]] : []),
    ...(trans ? [['transition', `${trans} transiciones`, 'Entre escenas'] as [IconName, string, string]] : []),
    project.audio.music ? ['music', 'Música', song ?? 'Puesta'] : ['mute', 'Sin música', 'Toca «Otra canción» para ponerle'],
    ...(project.audio.sfxAuto ? [['sound', 'Efectos', 'Sonidos en transiciones y textos'] as [IconName, string, string]] : []),
    ...(project.finish.lowerThird ? [['tag', 'Rótulo', project.finish.lowerThird.name] as [IconName, string, string]] : []),
  ];

  return (
    <div className="cols" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      {publicar && <PublicarBox projectId={project.id} red="instagram" onClose={() => setPublicar(false)} onCuentas={() => setCuentasOpen(true)} toast={ctx.toast} />}
      {cuentasOpen && <CuentasPanel onClose={() => setCuentasOpen(false)} toast={ctx.toast} />}
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
          <h1 style={{ fontSize: 26 }}>Tu video está listo</h1>
          <span className="muted">Míralo. Si te gusta, expórtalo; si no, dime qué cambiar.</span>
        </header>

        <div className="done-grid">
          {done.map(([icon, title, detail]) => (
            <div key={title} className="done-item" title={detail}>
              <Icon name={icon} size={24} />
              <strong className="small">{title}</strong>
            </div>
          ))}
        </div>

        {ctx.exporting ? (
          <div className="col" style={{ gap: 6 }} role="status">
            <strong>Exportando tu video… {Math.round(ctx.exporting.progress * 100)} %</strong>
            <div className="progress"><div style={{ width: `${Math.round(ctx.exporting.progress * 100)}%` }} /></div>
          </div>
        ) : ctx.lastExport ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--cyanSoft)' }}>
            <strong><Icon name="check" style={{ marginRight: 6 }} />Video exportado</strong>
            <span className="small" style={{ wordBreak: 'break-all' }}>{ctx.lastExport.path}</span>
            <div className="row">
              {ctx.lastExport.file && <a className="btn primary" href={`/media/${encodeURIComponent(project.id)}/${ctx.lastExport.file}`} target="_blank" rel="noreferrer"><Icon name="play" />Abrir</a>}
              {ctx.lastExport.file && <a className="btn rect" href={`/media/${encodeURIComponent(project.id)}/${ctx.lastExport.file}`} download><Icon name="export" />Descargar</a>}
              <button className="btn rect" disabled={Boolean(busy)} onClick={ctx.exportVideo} title="Otro formato, calidad o carpeta"><Icon name="settings" />Exportar de otra forma</button>
            </div>
            <div className="row">
              <span className="small muted"><Icon name="publish" style={{ marginRight: 6 }} />Publicar</span>
              <button className="btn rect" title={sinCuenta ? 'Conecta primero tu cuenta de Instagram' : 'Revisas la cuenta y el texto antes de publicar'}
                onClick={() => (sinCuenta ? setCuentasOpen(true) : setPublicar(true))}><Icon name="instagram" />Instagram</button>
            </div>
          </div>
        ) : (
          <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={Boolean(busy)} onClick={() => void ctx.exportNow()}><Icon name="export" />Exportar video</button>
        )}

        <section className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>¿Cambiamos algo?</h2>
          <div className="bchips">
            {QUICK.map(([icon, label, request]) => (
              <button key={label} className="bchip" disabled={Boolean(busy)} onClick={() => ask(request)}><Icon name={icon} />{label}</button>
            ))}
            <button className="bchip" disabled={Boolean(busy)} onClick={otherMusic}><Icon name="music" />Otra canción</button>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input style={{ flex: 1, minWidth: 0 }} value={text} disabled={Boolean(busy)} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(text); }}
              placeholder="Escríbelo con tus palabras: «quita la parte del medio»" aria-label="Pedir un cambio" />
            <button className="btn rect" disabled={Boolean(busy) || !text.trim()} onClick={() => ask(text)}>Pedir</button>
          </div>
          {busy && <span className="pill" role="status" style={{ alignSelf: 'flex-start' }}>{busy}</span>}
        </section>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => ctx.go('brief')}><Icon name="back" />Cambiar respuestas</button>
          <button className="btn ghost" onClick={() => ctx.go('editor', { s: null })}><Icon name="editor" />Ajustes avanzados</button>
        </div>
      </main>
    </div>
  );
};
