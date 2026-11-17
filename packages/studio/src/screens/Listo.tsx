import React, { useEffect, useMemo, useState } from 'react';
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
  ['palette', 'Otro look', 'Cambia el diseño de los subtítulos por otro distinto que se lea bien.'],
];
/** Tope de «Letras más grandes»: más grande ya no cabe bien en pantalla. */
const MAX_FONT = 130;

/** Pasa a palabras simples los motivos más comunes de un fallo al exportar. */
function plainError(msg: string): string {
  if (/EACCES|EPERM|permission|permiso/i.test(msg)) return 'No se puede guardar en esa carpeta. Elige otra con «Más formatos».';
  if (/ENOSPC|no space|espacio/i.test(msg)) return 'No queda espacio en el disco. Libera espacio y vuelve a intentarlo.';
  if (/browser|chrom|navegador/i.test(msg)) return 'No se pudo abrir el programa que arma el video. Cierra otras ventanas pesadas y vuelve a intentarlo.';
  if (/conexión|reinició/i.test(msg)) return msg;
  return 'Algo falló mientras se armaba el video.';
}

/**
 * Qué está haciendo la exportación. Al principio (0 %) se prepara el material y al final (95 %+) se
 * nivela el volumen y se guarda: son pasos sin porcentaje, así que se dicen con palabras.
 */
function stage(progress: number, message: string): string {
  const generic = !message || /^(exportando…?|empezando…?|preparando la exportación…?)$/i.test(message.trim());
  if (!generic) return message;
  if (progress <= 0) return 'Preparando el material… (el primer paso tarda un poco)';
  if (progress >= 0.95) return 'Nivelando el volumen y guardando el archivo…';
  return 'Armando el video cuadro por cuadro…';
}

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
  // Lo que hizo la última edición automática: los avisos («No pude…», «Sin música…») se ven siempre.
  const [resumen, setResumen] = useState<{ at: string; summary: string[] } | null>(null);
  useEffect(() => { api(`/api/resumen-edicion?id=${encodeURIComponent(project.id)}`).then(setResumen).catch(() => setResumen(null)); }, [project.id, project.briefAppliedAt]);
  const warn = (l: string) => /^(no pude|sin música|no entend|tu nota|no se pudo|falta)/i.test(l.trim());
  const [text, setText] = useState('');
  // Publicar en Instagram: sin cuenta conectada se abre primero el panel de cuentas.
  const [publicar, setPublicar] = useState(false);
  const [cuentasOpen, setCuentasOpen] = useState(false);
  const sinCuenta = useCuentas()?.instagram.cuentas.length === 0;
  // Sin brief aplicado se avisa que aún no está editado (con la opción de verlo igual).
  const [verIgual, setVerIgual] = useState(false);
  // Si la vista previa se traba, se vuelve a montar el reproductor (el video no se pierde).
  const [playerKey, setPlayerKey] = useState(0);

  const reload = async () => {
    const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
    store.replace(d.project);
    // La misma respuesta trae extras, estilos y marca: no se pide el proyecto dos veces.
    await store.reloadExtras(d);
  };
  const ask = async (request: string) => {
    if (!request.trim() || busy) return;
    setBusy('Pensando…');
    try {
      const before = store.latest()?.updatedAt;
      const r = await askAssistant(project.id, request.trim(), undefined, setBusy);
      if (r.saved) {
        // No se cambió nada: el pedido quedó anotado. Se deja lo escrito y no se pide exportar otra vez.
        ctx.toast('No pude hacer el cambio ahora: lo dejé anotado. Abre la IA local (Ollama) y vuelve a pedirlo.');
        return;
      }
      await reload();
      setText('');
      const changed = store.latest()?.updatedAt !== before;
      ctx.toast(changed ? `${r.text}${ctx.lastExport ? ' Vuelve a exportar para tener el video con el cambio.' : ''}` : `${r.text} El video no cambió.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };
  /** Letras más grandes de verdad: sube el tamaño un 20 % (con tope) y deja 2 palabras por línea. */
  const biggerText = () => {
    const c = project.captions;
    if (c.fontSize >= MAX_FONT && c.wordsPerLine <= 2) return ctx.toast('Las letras ya están al tamaño máximo.');
    store.update((p) => {
      p.captions.fontSize = Math.min(MAX_FONT, Math.round(p.captions.fontSize * 1.2));
      p.captions.wordsPerLine = Math.min(p.captions.wordsPerLine, 2);
    });
    ctx.toast('Letras más grandes. Deshacer con la flecha de arriba.');
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
  // En un montaje sin voz no hay silencios que quitar ni subtítulos que mostrar.
  const montaje = project.kind === 'montaje';
  const hasWords = timeline.words.length > 0;
  const vo = project.audio.voiceover;
  const sfxCount = project.scenes.filter((s) => s.sfx?.length).length;
  const last = ctx.lastExport;
  const done: [IconName, string, string][] = [
    ['scissors', `${outputDuration(project).toFixed(0)} s`, montaje ? `${project.scenes.length} cortes${project.audio.music ? ' al ritmo de la música' : ''}` : `${project.scenes.length} escenas, sin silencios ni tomas repetidas`],
    ...(hasWords ? [['captions', 'Subtítulos', CAPTION_DESIGNS.find((d) => d.id === project.captions.design)?.name ?? project.captions.design] as [IconName, string, string]] : []),
    ...(texts ? [['title', `${texts} textos`, 'Gancho, ideas clave y cierre en pantalla'] as [IconName, string, string]] : []),
    ...(motions ? [['chart', `${motions} gráfico${motions > 1 ? 's' : ''}`, 'Animados con tus cifras y frases'] as [IconName, string, string]] : []),
    ...(broll ? [['film', `${broll} b-roll`, 'Videos de apoyo según lo que dices'] as [IconName, string, string]] : []),
    ...(trans ? [['transition', `${trans} transiciones`, 'Entre escenas'] as [IconName, string, string]] : []),
    project.audio.music ? ['music', 'Música', song ?? 'Puesta'] : ['mute', 'Sin música', 'Toca «Otra canción», sube canciones en Audio o pon la clave gratuita de Freesound (Proyectos → Ajustes → Claves)'],
    ...(vo ? [['mic', vo.language ? 'Doblaje' : 'Voz en off', vo.provider] as [IconName, string, string]] : []),
    ...(project.audio.sfxAuto ? [['sound', 'Efectos', 'Sonidos en transiciones y textos'] as [IconName, string, string]]
      : sfxCount ? [['sound', 'Efectos', `En ${sfxCount} escena${sfxCount > 1 ? 's' : ''}`] as [IconName, string, string]] : []),
    ...(project.finish.lowerThird ? [['tag', 'Rótulo', project.finish.lowerThird.name] as [IconName, string, string]] : []),
  ];

  const exp = ctx.exportError;
  const mediaHref = (file: string) => `/media/${encodeURIComponent(project.id)}/${file}`;
  const calendarLink = (
    <a className="btn rect" href={`#/calendario?s=${encodeURIComponent(project.id)}`} title="Elige el día y la hora para publicarlo"><Icon name="calendar" />Programar publicación</a>
  );

  // Todavía no se editó: no se dice «listo» sobre los cortes en bruto.
  // Ya editado también si tiene brief y escenas (lo armó Claude con sus herramientas) o ya se exportó.
  const editado = Boolean(project.briefAppliedAt) || Boolean(last) || (Object.keys(project.brief ?? {}).length >= 3 && project.scenes.length > 0);
  if (!editado && !verIgual) return (
    <div className="cols" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <main className="card col" style={{ flex: '1 1 340px', maxWidth: 460, gap: 18, padding: 24, borderRadius: 20 }}>
        <h1 style={{ fontSize: 26 }}>Aún no está editado</h1>
        <span className="muted">Responde el brief y lo edito solo: cortes, {montaje ? 'textos' : 'subtítulos'}, música y efectos. Al terminar se exporta solo.</span>
        <button className="btn primary" style={{ height: 54, fontSize: 18 }} onClick={() => ctx.go('brief')}><Icon name="brief" />Responder el brief</button>
        <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setVerIgual(true)}><Icon name="eye" />Ya lo edité de otra forma: verlo</button>
      </main>
    </div>
  );

  return (
    <div className="cols" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      {publicar && <PublicarBox projectId={project.id} red="instagram" onClose={() => setPublicar(false)} onCuentas={() => setCuentasOpen(true)} toast={ctx.toast} />}
      {cuentasOpen && <CuentasPanel onClose={() => setCuentasOpen(false)} toast={ctx.toast} />}
      <div className="listo-player" style={{ position: 'relative' }}>
        <Player
          key={playerKey}
          errorFallback={() => (
            <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.82)', color: '#fff', padding: 16, textAlign: 'center' }}>
              <div className="col" style={{ gap: 10, alignItems: 'center', maxWidth: 260 }}>
                <Icon name="warning" size={28} />
                <strong>La vista previa se trabó</strong>
                <span className="small" style={{ opacity: 0.85 }}>Tu video no se perdió. Vuelve a cargarla para seguir.</span>
                <button className="btn primary" onClick={() => setPlayerKey((k) => k + 1)}><Icon name="refresh" />Volver a cargar la vista previa</button>
              </div>
            </div>
          )}
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
          <h1 style={{ fontSize: 26 }}>{project.briefAppliedAt ? 'Tu video está listo' : 'Vista previa'}</h1>
          <span className="muted">{ctx.exporting ? 'Míralo mientras se guarda solo; si algo no te gusta, dime qué cambiar.'
            : last && !last.stale ? 'Ya está guardado. Si algo no te gusta, dime qué cambiar.'
            : 'Míralo. Si te gusta, expórtalo; si no, dime qué cambiar.'}</span>
        </header>

        {resumen && resumen.summary.some(warn) && (
          <div className="col" role="status" style={{ gap: 4, padding: 12, borderRadius: 12, border: '1px solid var(--pink)', background: 'var(--pinkSoft)' }}>
            {resumen.summary.filter(warn).map((l) => <span key={l} className="small"><Icon name="warning" style={{ marginRight: 6 }} />{l}</span>)}
          </div>
        )}
        {resumen && resumen.summary.length > 0 && (
          <details className="grp">
            <summary><Icon name="brief" /> Lo que hizo la app</summary>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>{resumen.summary.filter((l) => !warn(l)).map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        )}

        <div className="done-grid">
          {done.map(([icon, title, detail]) => (
            <div key={title} className="done-item" title={detail}>
              <Icon name={icon} size={24} />
              <strong className="small">{title}</strong>
              {(icon === 'music' || icon === 'mute' || icon === 'captions') && <span className="muted detail">{detail}</span>}
            </div>
          ))}
        </div>

        {ctx.exporting ? (
          <div className="col" style={{ gap: 6 }} role="status">
            <strong>Exportando tu video… {Math.round(ctx.exporting.progress * 100)} %</strong>
            <div className={`progress ${ctx.exporting.progress <= 0 || ctx.exporting.progress >= 0.95 ? 'busy' : ''}`}><div style={{ width: `${Math.round(ctx.exporting.progress * 100)}%` }} /></div>
            <span className="small muted">{stage(ctx.exporting.progress, ctx.exporting.message)}</span>
          </div>
        ) : ctx.exportBusyElsewhere ? (
          <div className="col" style={{ gap: 8 }}>
            <span className="small muted" role="status">Hay otro video exportándose. Cuando termine podrás exportar este.</span>
            <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled><Icon name="export" />Exportar video</button>
          </div>
        ) : exp ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--pinkSoft)' }} role="alert">
            <strong><Icon name="warning" style={{ marginRight: 6 }} />No se pudo exportar el video</strong>
            <span className="small">{plainError(exp)}</span>
            <details className="small muted"><summary>Detalle</summary><span style={{ wordBreak: 'break-word' }}>{exp}</span></details>
            <div className="row">
              <button className="btn primary" disabled={Boolean(busy)} onClick={() => void ctx.exportNow()}><Icon name="refresh" />Reintentar</button>
              <button className="btn rect" disabled={Boolean(busy)} onClick={ctx.exportVideo} title="Otro formato, calidad o carpeta"><Icon name="settings" />Más formatos</button>
            </div>
          </div>
        ) : last && last.stale ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--panel2)' }}>
            <strong><Icon name="warning" style={{ marginRight: 6 }} />Hiciste cambios después de exportar</strong>
            <span className="small muted">El archivo guardado es la versión anterior, sin tus últimos cambios.</span>
            <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={Boolean(busy)} onClick={() => void ctx.exportNow()}><Icon name="export" />Exportar de nuevo</button>
            {last.file && (
              <div className="row">
                <a className="btn ghost small" href={mediaHref(last.file)} target="_blank" rel="noreferrer"><Icon name="play" />Ver versión anterior</a>
                <a className="btn ghost small" href={mediaHref(last.file)} download><Icon name="export" />Descargar versión anterior</a>
              </div>
            )}
          </div>
        ) : last ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--cyanSoft)' }}>
            <strong><Icon name="check" style={{ marginRight: 6 }} />Video exportado</strong>
            <span className="small" style={{ wordBreak: 'break-all' }}>{last.file ? last.path : `Está en tu carpeta: ${last.path}`}</span>
            {last.files && last.files.length > 1 && (
              <div className="col" style={{ gap: 4 }}>
                {last.files.map((f) => (
                  <div key={f.id + f.label} className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                    <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.label}><strong>{f.id}</strong> · {f.label}</span>
                    {f.file ? (
                      <>
                        <a className="btn ghost small" href={mediaHref(f.file)} target="_blank" rel="noreferrer" aria-label={`Abrir ${f.label}`}><Icon name="play" />Abrir</a>
                        <a className="btn ghost small" href={mediaHref(f.file)} download aria-label={`Descargar ${f.label}`}><Icon name="export" />Descargar</a>
                      </>
                    ) : <span className="small muted">En tu carpeta</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="row">
              {last.file && <a className="btn primary" href={mediaHref(last.file)} target="_blank" rel="noreferrer"><Icon name="play" />Abrir</a>}
              {last.file && <a className="btn rect" href={mediaHref(last.file)} download><Icon name="export" />Descargar</a>}
              <button className="btn rect" disabled={Boolean(busy)} onClick={ctx.exportVideo} title="Otro formato, calidad o carpeta"><Icon name="settings" />Exportar de otra forma</button>
            </div>
            <div className="row">
              <span className="small muted"><Icon name="publish" style={{ marginRight: 6 }} />Publicar</span>
              <button className="btn rect" title={sinCuenta ? 'Conecta primero tu cuenta de Instagram' : 'Revisas la cuenta y el texto antes de publicar'}
                onClick={() => (sinCuenta ? setCuentasOpen(true) : setPublicar(true))}><Icon name="instagram" />Instagram</button>
              {calendarLink}
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            <button className={`btn ${project.briefAppliedAt ? 'primary' : 'rect'}`} style={{ height: 54, fontSize: 18 }} disabled={Boolean(busy)} onClick={() => void ctx.exportNow()}><Icon name="export" />Exportar video</button>
            <div className="row">
              <button className="btn ghost small" disabled={Boolean(busy)} onClick={ctx.exportVideo} title="Otro formato, calidad o carpeta"><Icon name="settings" />Más formatos</button>
              {calendarLink}
            </div>
          </div>
        )}

        <section className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>¿Cambiamos algo?</h2>
          <div className="bchips">
            {QUICK.filter(([icon]) => hasWords || icon !== 'palette').map(([icon, label, request]) => (
              <button key={label} className="bchip" disabled={Boolean(busy)} onClick={() => ask(request)}><Icon name={icon} />{label}</button>
            ))}
            {hasWords && <button className="bchip" disabled={Boolean(busy)} onClick={biggerText}><Icon name="letters" />Letras más grandes</button>}
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
