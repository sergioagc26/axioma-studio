import React, { useEffect, useState } from 'react';
import { api } from './useProject.ts';

type Keys = { pexels: boolean; freesound: boolean };
let memo: Promise<Keys> | null = null;
const loadKeys = (fresh = false) => (memo = fresh || !memo ? api<Keys>('/api/claves').catch(() => ({ pexels: false, freesound: false })) : memo);

/** ¿Está puesta la clave de este banco? null mientras se comprueba. */
export function useBankKey(banco: keyof Keys): [boolean | null, () => void] {
  const [ok, setOk] = useState<boolean | null>(null);
  const check = (fresh = false) => { loadKeys(fresh).then((k) => setOk(k[banco])); };
  useEffect(() => { check(); }, [banco]);
  return [ok, () => check(true)];
}

/** Recuadro para pegar la clave gratuita de un banco. La clave se guarda en este computador (.env) y no se vuelve a mostrar. */
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
