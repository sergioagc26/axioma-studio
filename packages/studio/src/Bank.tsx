import React, { useEffect, useState } from 'react';
import { api } from './useProject.ts';
import { Icon } from './Icon.tsx';

type Keys = { pexels: boolean; pixabay: boolean; freesound: boolean; elevenlabs: boolean };
let memo: Promise<Keys> | null = null;
const loadKeys = (fresh = false) => (memo = fresh || !memo ? api<Keys>('/api/claves').catch(() => ({ pexels: false, pixabay: false, freesound: false, elevenlabs: false })) : memo);

/** ¿Está puesta la clave de este banco? null mientras se comprueba. */
export function useBankKey(banco: keyof Keys): [boolean | null, () => void] {
  const [ok, setOk] = useState<boolean | null>(null);
  const check = (fresh = false) => { loadKeys(fresh).then((k) => setOk(k[banco])); };
  useEffect(() => { check(); }, [banco]);
  return [ok, () => check(true)];
}

/** Recuadro para pegar la clave gratuita de un banco. La clave se guarda en este computador (archivo .env) y no se vuelve a mostrar. */
export const BankKey: React.FC<{ banco: keyof Keys; name: string; link: string; onSaved: () => void; toast: (m: string) => void }> = ({ banco, name, link, onSaved, toast }) => {
  const [value, setValue] = useState('');
  const save = async () => {
    try {
      await api('/api/claves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banco, clave: value }) });
      setValue('');
      onSaved();
      toast(`Clave de ${name} guardada en este computador.`);
    } catch (e: any) { toast(e.message); }
  };
  return (
    <div className="col" style={{ padding: 12, borderRadius: 12, background: 'var(--cyanSoft)', gap: 8 }}>
      <span className="small">Para buscar en {name} hace falta una clave gratuita, una sola vez. Créala en <a href={link} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>{link.replace('https://', '')}</a> y pégala aquí.</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Clave de ${name}`} />
        <button className="btn primary rect" disabled={value.trim().length < 8} onClick={save}>Guardar clave</button>
      </div>
    </div>
  );
};

const SERVICES: { id: keyof Keys; name: string; link: string; cost: string; unlocks: string }[] = [
  { id: 'pixabay', name: 'Pixabay', link: 'https://pixabay.com/api/docs/#api_search_videos', cost: 'Gratis', unlocks: 'Videos de apoyo (b-roll), también en la edición automática. La clave aparece en esa página al iniciar sesión.' },
  { id: 'pexels', name: 'Pexels', link: 'https://www.pexels.com/api/', cost: 'Gratis (no da claves nuevas por ahora)', unlocks: 'Otro banco de videos de apoyo. No hace falta si ya tienes la de Pixabay; si la tienes, se usa primero.' },
  { id: 'freesound', name: 'Freesound', link: 'https://freesound.org/apiv2/apply', cost: 'Gratis · Recomendada', unlocks: 'Música automática para tus videos y efectos de sonido. Sin esta clave, la app solo usa las canciones que subas tú: si no subes ninguna, tus videos salen sin música.' },
  { id: 'elevenlabs', name: 'ElevenLabs', link: 'https://elevenlabs.io/app/settings/api-keys', cost: 'De pago (opcional)', unlocks: 'Voz natural en la voz en off y el doblaje (sin ella se usa la voz del computador).' },
];

/** Todas las claves en un solo lugar: qué desbloquea cada una, si está puesta y dónde sacarla. */
export const KeysPanel: React.FC<{ onClose: () => void; toast: (m: string) => void }> = ({ onClose, toast }) => {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [edit, setEdit] = useState<keyof Keys | null>(null);
  const [value, setValue] = useState('');
  useEffect(() => { loadKeys(true).then(setKeys); }, []);
  const save = async (id: keyof Keys, name: string) => {
    try {
      const k = await api<Keys>('/api/claves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banco: id, clave: value }) });
      memo = Promise.resolve(k);
      setKeys(k); setValue(''); setEdit(null);
      toast(`Clave de ${name} guardada en este computador.`);
    } catch (e: any) { toast(e.message); }
  };
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card col" role="dialog" aria-modal="true" aria-label="Claves de servicios" style={{ maxWidth: 520, gap: 14 }}>
        <h2 style={{ fontSize: 20 }}>Claves de servicios</h2>
        <span className="small muted">La app funciona sin ellas, pero <strong>sin la de Freesound no pone música sola</strong>. Con las gratuitas (Freesound y Pixabay) pone música y videos de apoyo sin que hagas nada. Se guardan solo en este computador y no se vuelven a mostrar. Ninguno de estos servicios recibe tus videos.</span>
        {SERVICES.map((s) => (
          <div key={s.id} className="col" style={{ gap: 6, padding: 12, borderRadius: 12, border: `1px solid ${s.id === 'freesound' && keys && !keys.freesound ? 'var(--pink)' : 'var(--line)'}` }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <strong>{s.name} <span className="small muted" style={{ fontWeight: 400 }}>· {s.cost}</span></strong>
              {keys == null ? <span className="small muted">…</span> : keys[s.id] ? <span className="pill" style={{ color: 'var(--ok, #12A150)' }}><Icon name="check" />Puesta</span> : <span className="pill">Falta</span>}
            </div>
            <span className="small muted">{s.unlocks}</span>
            {edit === s.id ? (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" type="password" autoComplete="off" autoFocus style={{ flex: 1, minWidth: 0 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Pega aquí la clave de ${s.name}`} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim().length >= 8) save(s.id, s.name); }} />
                <button className="btn primary rect" disabled={value.trim().length < 8} onClick={() => save(s.id, s.name)}>Guardar</button>
              </div>
            ) : (
              <div className="row">
                <a className="btn ghost small" href={s.link} target="_blank" rel="noreferrer">Sacar la clave<Icon name="open" style={{ marginLeft: 6 }} /></a>
                <button className="btn rect small" onClick={() => { setEdit(s.id); setValue(''); }}>{keys?.[s.id] ? 'Cambiar' : 'Pegar clave'}</button>
              </div>
            )}
          </div>
        ))}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
};
