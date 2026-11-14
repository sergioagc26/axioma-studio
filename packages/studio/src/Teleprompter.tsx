import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';

/**
 * Teleprompter: el guion en grande, subiendo solo a tu ritmo de lectura, para grabarte leyéndolo.
 * Espacio: empezar/pausar · flechas: más rápido o más lento · Esc: cerrar. Con «espejo» se lee en
 * los teleprompters de vidrio (que reflejan la pantalla).
 */
export const Teleprompter: React.FC<{ parts: string[]; onClose: () => void }> = ({ parts, onClose }) => {
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(150);
  const [size, setSize] = useState(52);
  const [mirror, setMirror] = useState(false);
  const [count, setCount] = useState(0);
  const words = parts.join(' ').split(/\s+/).filter(Boolean).length;

  // Desplazamiento: velocidad en píxeles por segundo según las palabras por minuto y el tamaño de letra.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const el = box.current!;
    const pxPerWord = () => (el.scrollHeight - el.clientHeight * 0.5) / Math.max(1, words);
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      el.scrollTop += pxPerWord() * (wpm / 60) * dt;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, wpm, words]);

  // Cuenta regresiva de 3 s antes de empezar (para alcanzar a mirar a cámara).
  const start = () => {
    if (playing) { setPlaying(false); return; }
    setCount(3);
    let n = 3;
    const t = window.setInterval(() => { n--; setCount(n); if (n <= 0) { clearInterval(t); setPlaying(true); } }, 1000);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') { e.preventDefault(); start(); }
      else if (e.key === 'ArrowUp') setWpm((w) => Math.min(260, w + 10));
      else if (e.key === 'ArrowDown') setWpm((w) => Math.max(80, w - 10));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Teleprompter" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#09090B', color: '#F5F5F7', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid #2A2A35', gap: 10 }}>
        <button className="btn primary small" onClick={start}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pausar' : 'Empezar'}</button>
        <label className="row small">Velocidad
          <input type="range" min={80} max={260} step={5} value={wpm} onChange={(e) => setWpm(Number(e.target.value))} aria-label="Palabras por minuto" />
          <span style={{ width: 92 }}>{wpm} palabras/min</span>
        </label>
        <label className="row small">Letra
          <input type="range" min={32} max={96} step={2} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamaño de letra" />
        </label>
        <label className="row small"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Espejo</label>
        <button className="btn ghost small" onClick={() => { if (box.current) box.current.scrollTop = 0; setPlaying(false); }}><Icon name="undo" />Al inicio</button>
        <span className="small" style={{ color: '#A3A3AD' }}>Espacio: empezar o pausar · flechas: velocidad · Esc: cerrar</span>
        <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Cerrar el teleprompter"><Icon name="close" /></button>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* Línea de lectura: mira aquí (cerca de la cámara). */}
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '30%', height: size * 1.5, borderTop: '2px solid #C6F432', borderBottom: '2px solid rgba(198,244,50,.25)', pointerEvents: 'none', zIndex: 1 }} />
        <div ref={box} style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: `30vh 8vw 70vh`, transform: mirror ? 'scaleX(-1)' : undefined, scrollbarWidth: 'none' }}>
          {parts.map((p, i) => <p key={i} style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: size, lineHeight: 1.5, margin: `0 0 ${size * 0.8}px`, maxWidth: 1100, marginInline: 'auto' }}>{p}</p>)}
        </div>
        {count > 0 && <div aria-live="assertive" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 160, fontWeight: 700, color: '#C6F432', background: 'rgba(9,9,11,.6)', zIndex: 2 }}>{count}</div>}
      </div>
    </div>
  );
};
