import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';

/**
 * Botón de dictado: graba con el micrófono y la app lo pasa a texto en este computador (Whisper).
 * Al terminar llama a `onText` con lo dictado. Sirve en cualquier campo de texto.
 */
export const Dictar: React.FC<{ onText: (text: string) => void; toast: (msg: string) => void; label?: string }> = ({ onText, toast, label = 'Dictar' }) => {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [secs, setSecs] = useState(0);
  const ref = useRef<{ r: MediaRecorder; stream: MediaStream; tick: number } | null>(null);
  useEffect(() => () => { const x = ref.current; if (x) { clearInterval(x.tick); x.stream.getTracks().forEach((t) => t.stop()); } }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fuera de este computador sin https el navegador no deja usar el micrófono.
      return toast(window.isSecureContext ? 'Este navegador no deja usar el micrófono.' : 'Desde otro equipo el navegador solo deja usar el micrófono con https. Usa el dictado del teclado de tu celular o computador (el botón del micrófono) en el campo de texto.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('busy');
        try {
          const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
          if (blob.size < 2000) { toast('No se oyó nada. Vuelve a intentarlo, más cerca del micrófono.'); return; }
          const res = await fetch('/api/dictado', { method: 'POST', body: blob });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? 'No se pudo pasar a texto.');
          if (d.text?.trim()) onText(d.text.trim()); else toast('No entendí lo que dijiste. Vuelve a intentarlo.');
        } catch (e: any) { toast(e.message); } finally { setState('idle'); }
      };
      r.start();
      const tick = window.setInterval(() => setSecs((s) => { if (s >= 119) r.stop(); return s + 1; }), 1000);
      ref.current = { r, stream, tick };
      setSecs(0);
      setState('rec');
    } catch { toast('No se pudo usar el micrófono: dale permiso al navegador y vuelve a intentarlo.'); }
  };
  const stop = () => { const x = ref.current; if (!x) return; clearInterval(x.tick); ref.current = null; if (x.r.state !== 'inactive') x.r.stop(); };

  if (state === 'rec') return <button type="button" className="btn primary small" onClick={stop} aria-live="polite"><Icon name="stop" /> Terminar ({secs} s)</button>;
  if (state === 'busy') return <button type="button" className="btn small" disabled><Icon name="mic" /> Pasando a texto…</button>;
  return <button type="button" className="btn rect small" onClick={start} title="Habla y la app lo escribe (máx. 2 minutos)"><Icon name="mic" /> {label}</button>;
};
