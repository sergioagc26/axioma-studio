import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { api } from './useProject.ts';

type Mode = 'apagado' | 'archivo' | 'chrome' | 'safari' | 'firefox' | 'brave' | 'edge';
type State = { mode: Mode; hasFile: boolean };

const MODES: [Mode, string][] = [
  ['apagado', 'No usar mi sesión'],
  ['archivo', 'Archivo de mi sesión (desde cualquier computador)'],
  ['chrome', 'Chrome de este computador'],
  ['safari', 'Safari de este computador'],
  ['firefox', 'Firefox de este computador'],
  ['brave', 'Brave de este computador'],
  ['edge', 'Edge de este computador'],
];

/**
 * «Usar mi sesión de Instagram»: para leer perfiles y reels que Instagram solo muestra con la
 * sesión iniciada. Apagado por defecto. La sesión se queda en el computador donde corre la app.
 */
export const IgSesion: React.FC<{ toast: (m: string) => void; profileHint?: string }> = ({ toast, profileHint }) => {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [testUrl, setTestUrl] = useState(profileHint ?? '');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api<State>('/api/instagram-sesion').then(setS).catch(() => {}); }, []);
  useEffect(() => { if (profileHint) setTestUrl(profileHint); }, [profileHint]);

  const setMode = async (mode: Mode) => {
    if (mode === 'archivo' && !s?.hasFile) { setS((x) => (x ? { ...x, mode } : x)); return; }
    try { setS(await api<State>('/api/instagram-sesion', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: mode }) })); setResult(null); } catch (e: any) { toast(e.message); }
  };
  const upload = async (f: File) => {
    try { setS(await api<State>('/api/instagram-sesion/archivo', { method: 'POST', body: await f.text() })); toast('Sesión guardada en este computador.'); setResult(null); } catch (e: any) { toast(e.message); }
  };
  const forget = async () => {
    if (!window.confirm('¿Borrar el archivo de tu sesión de este computador?')) return;
    try { setS(await api<State>('/api/instagram-sesion/archivo', { method: 'DELETE' })); toast('Archivo de sesión borrado.'); } catch (e: any) { toast(e.message); }
  };
  const test = async () => {
    setBusy('Probando…'); setResult(null);
    try { setResult(await api<{ ok: boolean; text: string }>('/api/instagram-sesion/probar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: testUrl }) })); } catch (e: any) { setResult({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  if (!s) return null;
  const on = s.mode !== 'apagado';
  return (
    <details className="grp" open={on && !result?.ok}>
      <summary className="row" style={{ gap: 6 }}><Icon name="instagram" size={16} /> Usar mi sesión de Instagram {on ? <span className="pill" style={{ marginLeft: 4 }}>activada</span> : null}</summary>
      <div className="col" style={{ gap: 8, paddingTop: 8 }}>
        <span className="small muted">Instagram solo deja ver perfiles (y algunos reels) con la sesión iniciada. Con esto la app usa la tuya para bajar los videos que pidas y analizarlos. La sesión queda en el computador donde corre la app y no se envía a ningún lado.</span>
        <select value={s.mode} onChange={(e) => void setMode(e.target.value as Mode)} aria-label="Qué sesión usar">
          {MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {s.mode === 'archivo' && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small muted">En tu portátil: abre instagram.com con la sesión iniciada, exporta las cookies en formato <strong>cookies.txt</strong> con una extensión del navegador (p. ej. «Get cookies.txt LOCALLY») y sube aquí ese archivo. La app solo guarda las de Instagram.</span>
            <div className="row">
              <button className="btn rect small" onClick={() => file.current?.click()}><Icon name="upload" /> {s.hasFile ? 'Cambiar archivo' : 'Subir archivo de sesión'}</button>
              {s.hasFile && <button className="btn ghost small" onClick={forget}><Icon name="trash" /> Borrar</button>}
            </div>
            <input ref={file} type="file" accept=".txt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          </div>
        )}
        {s.mode !== 'apagado' && s.mode !== 'archivo' && (
          <span className="small muted">Sirve si en {MODES.find((m) => m[0] === s.mode)?.[1].replace(' de este computador', '')} de <strong>este</strong> computador (el que tiene la app) ya iniciaste sesión en Instagram.{s.mode === 'chrome' ? ' La primera vez el Mac pregunta por el llavero: pulsa «Permitir siempre».' : ''}{s.mode === 'safari' ? ' En Mac, Safari necesita «Acceso total al disco» para la app.' : ''}</span>
        )}
        {on && (
          <div className="col" style={{ gap: 6 }}>
            <label className="field">Probar con un perfil
              <input value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder="https://www.instagram.com/tu_cuenta/" />
            </label>
            <button className="btn small" disabled={Boolean(busy) || !testUrl.trim() || (s.mode === 'archivo' && !s.hasFile)} onClick={test}>{busy || 'Probar la sesión'}</button>
            {result && <span className="small" role="status" style={{ color: result.ok ? 'var(--cyan)' : 'var(--pink)' }}>{result.text}</span>}
          </div>
        )}
      </div>
    </details>
  );
};
