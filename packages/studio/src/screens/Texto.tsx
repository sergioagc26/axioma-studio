import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cutInterval, keptMask, outputDuration, restoreInterval, wordsSpan } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { Icon } from '../Icon.tsx';

/**
 * Editar por texto (como Descript): todo lo que se dice, palabra por palabra. Las tachadas no
 * están en el reel. Selecciona (clic, arrastrar o Mayús+clic) y quita o recupera.
 */
export const Texto: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const t = store.transcript;
  const kept = useMemo(() => (t ? keptMask(project, t) : []), [project, t]);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);
  const audio = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);

  // Párrafos: se corta después de un punto o de una pausa larga.
  const paragraphs = useMemo(() => {
    const out: number[][] = [];
    let cur: number[] = [];
    (t?.words ?? []).forEach((w, i, all) => {
      cur.push(i);
      const next = all[i + 1];
      if (!next || (/[.!?…]$/.test(w.text) && cur.length > 12) || next.start - w.end > 1.4) { out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    return out;
  }, [t]);

  // Atajos de teclado mientras esta pantalla está abierta (no al escribir en un campo).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const up = () => { dragging.current = false; };
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      keys.current(e);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', down);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('keydown', down); };
  }, []);

  if (!t?.words.length) {
    return (
      <main className="page" style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: 26 }}>Este video no tiene voz</h1>
        <p className="muted">Aquí se edita quitando palabras de lo que dices, y en este video nadie habla. Los cortes se cambian en el editor.</p>
        <div className="row">
          <button className="btn primary" onClick={() => ctx.go('listo')}>Ver resultado</button>
          <button className="btn rect" onClick={() => ctx.go('editor', { s: null })}><Icon name="scissors" /> Cambiar los cortes en el editor</button>
        </div>
      </main>
    );
  }

  const [a, b] = sel ?? [-1, -1];
  const inSel = (i: number) => i >= a && i <= b;
  /** Tramos seguidos de la selección que están (o no) en el reel. */
  const runs = (want: boolean) => {
    const out: [number, number][] = [];
    for (let i = a; i <= b; i++) {
      if (kept[i] !== want) continue;
      const last = out[out.length - 1];
      if (last && last[1] === i - 1) last[1] = i; else out.push([i, i]);
    }
    return out;
  };
  const removeSel = () => {
    if (!sel) return;
    const r = runs(true);
    if (!r.length) return;
    store.update((p) => {
      let n = p;
      for (const [i, j] of r) { const s = wordsSpan(t, i, j); n = cutInterval(n, s.start, s.end); }
      p.scenes = n.scenes;
    });
    ctx.toast(`Quitadas ${r.reduce((x, [i, j]) => x + j - i + 1, 0)} palabras. Deshacer las recupera.`);
  };
  const restoreSel = () => {
    if (!sel) return;
    const r = runs(false);
    if (!r.length) return;
    let n = project;
    for (const [i, j] of r) { const s = wordsSpan(t, i, j); n = restoreInterval(n, s.start, s.end); }
    // Si no cambió nada (por ejemplo, se quitaron todas las escenas), no se dice que se recuperó.
    if (n.scenes === project.scenes || JSON.stringify(n.scenes) === JSON.stringify(project.scenes)) return ctx.toast('No se pudo recuperar ese texto. Usa Deshacer.');
    store.update((p) => { p.scenes = n.scenes; });
    ctx.toast(`Recuperadas ${r.reduce((x, [i, j]) => x + j - i + 1, 0)} palabras.`);
  };
  const listen = () => {
    if (!sel || !audio.current) return;
    const s = wordsSpan(t, a, b);
    audio.current.currentTime = s.start;
    stopAt.current = s.end;
    audio.current.play().catch(() => {});
  };
  keys.current = (e) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel) { e.preventDefault(); removeSel(); }
    else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && sel) { e.preventDefault(); restoreSel(); }
    else if (e.key === ' ' && sel) { e.preventDefault(); listen(); }
    else if (e.key === 'Escape') setSel(null);
  };
  const selKept = sel ? runs(true).length > 0 : false;
  const selRemoved = sel ? runs(false).length > 0 : false;
  const removedCount = kept.filter((k) => !k).length;
  const media = `/media/${encodeURIComponent(project.id)}/${(project.source.proxy ?? 'proxies/proxy.mp4').split('/').map(encodeURIComponent).join('/')}`;

  return (
    <main className="page texto" style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>Editar por texto</h1>
        <span className="muted small">El video dura {outputDuration(project).toFixed(1)} s · {removedCount} palabras fuera del corte</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>Selecciona palabras (clic, arrastrar o Mayús+clic) y quítalas del video o recupéralas. Las <s>tachadas</s> no están en el video. Teclas: Borrar quita · R recupera · Espacio escucha · Esc suelta.</p>

      <div className="texto-bar" role="toolbar" aria-label="Acciones sobre la selección">
        <span className="small muted" style={{ minWidth: 160 }}>{sel ? `${b - a + 1} palabra${b > a ? 's' : ''} seleccionada${b > a ? 's' : ''}` : 'Nada seleccionado'}</span>
        <button className="btn rect" disabled={!sel} onClick={listen}><Icon name="play" /> Escuchar</button>
        <button className="btn primary" disabled={!selKept} onClick={removeSel}><Icon name="scissors" /> Quitar del video</button>
        <button className="btn rect" disabled={!selRemoved} onClick={restoreSel}><Icon name="undo" /> Recuperar</button>
        <button className="btn ghost" disabled={!sel} onClick={() => setSel(null)}>Soltar</button>
      </div>

      <div className="texto-body" tabIndex={0} aria-label="Transcripción del video" onMouseLeave={() => { dragging.current = false; }}>
        {paragraphs.map((para, k) => (
          <p key={k}>
            {para.map((i) => (
              <span key={i}
                className={`w ${kept[i] ? '' : 'out'} ${inSel(i) ? 'sel' : ''}`}
                title={`${t.words[i].start.toFixed(1)} s`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (e.shiftKey && anchor.current != null) { setSel([Math.min(anchor.current, i), Math.max(anchor.current, i)]); return; }
                  anchor.current = i; dragging.current = true; setSel([i, i]);
                }}
                onMouseEnter={() => { if (dragging.current && anchor.current != null) setSel([Math.min(anchor.current, i), Math.max(anchor.current, i)]); }}
              >{t.words[i].text} </span>
            ))}
          </p>
        ))}
      </div>
      <audio ref={audio} src={media} preload="none" onTimeUpdate={(e) => { if (stopAt.current != null && e.currentTarget.currentTime >= stopAt.current) { e.currentTarget.pause(); stopAt.current = null; } }} />
    </main>
  );
};
