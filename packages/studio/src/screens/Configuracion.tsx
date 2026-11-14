import React, { useEffect, useState } from 'react';
import type { Ctx } from '../App.tsx';
import { Icon } from '../Icon.tsx';
import { AxiLive } from '../AxiLive.tsx';
import { IgSesion } from '../IgSesion.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

type Ajustes = {
  llm?: string; vision?: string;
  voz?: { proveedor?: string; voz?: string };
  exportar?: { calidad?: 'maxima' | 'alta' | 'ligera'; lufs?: -14 | -16; carpeta?: string };
  forma?: 'vertical' | 'horizontal' | 'cuadrado';
};
type Ia = { running: boolean; version?: string; model?: string; vision?: string; installed: string[]; loaded: boolean; error?: string };
type Check = { name: string; ok: boolean; detail: string; fix?: string };
type Gpu = { name: string; vendor: string; vramGb?: number; cores?: number };
type Equipo = { os: string; osVersion: string; arch: string; model?: string; cpu: string; cores: number; performanceCores?: number; efficiencyCores?: number; ramGb: number; unifiedMemory: boolean; gpus: Gpu[]; accel: 'metal' | 'cuda' | 'cpu'; diskFreeGb: number };
type Plan = { nivel: string; ok: boolean; aiMemGb: number; llm: string; vision: string | null; whisper: string; voz: string; renderProcesos: number; uhd: boolean; limites: string[]; razones: string[] };
type Req = { ramGb: number; cores: number; discoGb: number; texto: string };
const NIVEL: Record<string, string> = { insuficiente: 'No llega al mínimo', basico: 'Básico', medio: 'Medio', alto: 'Alto', 'muy alto': 'Muy alto' };
const ACCEL: Record<string, string> = { metal: 'Apple Silicon (Metal)', cuda: 'NVIDIA (CUDA)', cpu: 'Solo el procesador' };

const PROVEEDOR: Record<string, string> = { qwen: 'Voz IA local (natural, gratis)', elevenlabs: 'ElevenLabs (natural, de pago)', piper: 'Piper (local)', sistema: 'Voz del computador (más robótica)' };

/**
 * Configuración de la app (no de un video): estado del sistema, IA, voz por defecto, Instagram,
 * exportación y forma por defecto de los videos nuevos, y apariencia.
 */
export const Configuracion: React.FC<{ ctx: Ctx; theme: string; setTheme: (t: string) => void }> = ({ ctx, theme, setTheme }) => {
  const [a, setA] = useState<Ajustes | null>(null);
  const [ia, setIa] = useState<Ia | null>(null);
  const [voces, setVoces] = useState<string[]>([]);
  const [caben, setCaben] = useState<Record<string, boolean>>({});
  const [vocesIA, setVocesIA] = useState<{ id: string; name: string }[]>([]);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState('');
  const [iaTest, setIaTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [vozTest, setVozTest] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [eq, setEq] = useState<{ equipo: Equipo; plan: Plan; requisitos: Record<'minimo' | 'recomendado' | 'ideal', Req>; instalados: string[]; ajustes: Ajustes & { optimizado?: { at: string; equipo: string } } } | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);
  const [pulling, setPulling] = useState<Record<string, string>>({});
  const loadEq = (fresh = false) => api<NonNullable<typeof eq>>(`/api/equipo${fresh ? '?actualizar=1' : ''}`).then((d) => {
    setEq(d);
    setFaltan([d.plan.llm, d.plan.vision].filter((x): x is string => Boolean(x) && !d.instalados.some((n) => n === x || n === `${x}:latest`)));
  }).catch((e) => ctx.toast(e.message));
  const optimize = async () => {
    setBusy('opt');
    try {
      const d = await api<{ ajustes: Ajustes; faltan: string[] }>('/api/equipo/optimizar', { method: 'POST' });
      setA(d.ajustes); setFaltan(d.faltan);
      await load(); await loadEq();
      ctx.toast(d.faltan.length ? `Listo. Configuración optimizada; falta descargar ${d.faltan.join(' y ')}.` : 'Listo. La app quedó optimizada para este computador.');
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };
  const pull = async (modelo: string) => {
    setPulling((p) => ({ ...p, [modelo]: 'Empezando…' }));
    try {
      const job = await api<Job>('/api/equipo/descargar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelo }) });
      await waitJob(job, (j) => setPulling((p) => ({ ...p, [modelo]: j.message })));
      ctx.toast(`Listo. ${modelo} descargado y elegido.`);
      await load(); await loadEq();
    } catch (e: any) { ctx.toast(e.message); } finally { setPulling((p) => { const { [modelo]: _, ...rest } = p; return rest; }); }
  };

  const load = () => api<{ ajustes: Ajustes; ia: Ia; caben: Record<string, boolean>; voces: string[]; vocesIA: { id: string; name: string }[] }>('/api/ajustes')
    .then((d) => { setA(d.ajustes); setIa(d.ia); setCaben(d.caben ?? {}); setVoces(d.voces); setVocesIA(d.vocesIA); }).catch((e) => ctx.toast(e.message));
  const review = () => { setChecking(true); api<{ checks: Check[] }>('/api/sistema').then((d) => setChecks(d.checks)).catch((e) => ctx.toast(e.message)).finally(() => setChecking(false)); };
  useEffect(() => { void load(); review(); void loadEq(); }, []);

  const save = async (patch: Partial<Ajustes>) => {
    try {
      const d = await api<{ ajustes: Ajustes; ia: Ia }>('/api/ajustes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      setA(d.ajustes); setIa(d.ia);
      ctx.toast('Listo. Configuración guardada.');
    } catch (e: any) { ctx.toast(e.message); }
  };
  const testIa = async () => {
    setBusy('ia'); setIaTest(null);
    try { setIaTest(await api('/api/ajustes/probar-ia', { method: 'POST' })); } catch (e: any) { setIaTest({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const testVoz = async () => {
    setBusy('voz'); setVozTest(null);
    try { setVozTest(await api('/api/ajustes/probar-voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proveedor: a?.voz?.proveedor, voz: a?.voz?.voz }) })); } catch (e: any) { setVozTest({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const missing = checks?.filter((c) => !c.ok) ?? [];
  const sec: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
  return (
    <main className="page" style={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Configuración</h1>
          <span className="muted small">Cómo trabaja la app en este computador. Lo de cada video se cambia en su Editor.</span>
        </div>
        <a className="btn rect" href="#/proyectos"><Icon name="back" />Volver a proyectos</a>
      </div>

      {/* El computador: qué es, qué le cabe y los requisitos */}
      <section className="card" style={sec}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18 }}>Tu computador</h2>
          {eq && <span className="pill" style={{ background: eq.plan.ok ? 'var(--pinkSoft)' : 'transparent', color: eq.plan.ok ? 'var(--pinkText)' : 'var(--danger)' }}>Nivel: {NIVEL[eq.plan.nivel] ?? eq.plan.nivel}</span>}
        </div>
        {!eq ? <span className="muted small">Midiendo el computador…</span> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {([
                ['Procesador', `${eq.equipo.cpu}${eq.equipo.performanceCores ? ` · ${eq.equipo.performanceCores} de rendimiento + ${eq.equipo.efficiencyCores ?? 0} de eficiencia` : ''} · ${eq.equipo.cores} núcleos en total`],
                ['Memoria RAM', `${eq.equipo.ramGb} GB${eq.equipo.unifiedMemory ? ' (unificada: la comparten procesador y video)' : ''}`],
                ['Tarjeta de video', eq.equipo.gpus.length ? eq.equipo.gpus.map((g) => `${g.name}${g.cores ? ` · ${g.cores} núcleos` : ''}${g.vramGb ? ` · ${g.vramGb} GB` : ''}`).join(' / ') : 'No detectada'],
                ['Aceleración para la IA', ACCEL[eq.equipo.accel]],
                ['Disco libre', `${eq.equipo.diskFreeGb} GB`],
                ['Sistema', `${eq.equipo.os} ${eq.equipo.osVersion} · ${eq.equipo.arch}${eq.equipo.model ? ` · ${eq.equipo.model}` : ''}`],
              ] as const).map(([k, v]) => (
                <div key={k} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--panel2)' }}>
                  <div className="small muted">{k}</div><div className="small" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{v}</div>
                </div>
              ))}
            </div>
            <div>
              <strong className="small">Lo que la app usa en este equipo</strong>
              <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{eq.plan.razones.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            {eq.plan.limites.length > 0 && (
              <div>
                <strong className="small">Lo que se limita</strong>
                <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{eq.plan.limites.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            <div className="row">
              <button className="btn primary" disabled={busy === 'opt'} onClick={optimize}><Icon name="wand" />{busy === 'opt' ? 'Optimizando…' : 'Optimizar para este computador'}</button>
              <button className="btn rect small" onClick={() => void loadEq(true)}><Icon name="refresh" />Volver a medir</button>
              {eq.ajustes.optimizado && <span className="small muted">Optimizada el {new Date(eq.ajustes.optimizado.at).toLocaleDateString('es')}.</span>}
            </div>
            {faltan.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <span className="small">Motores de IA recomendados para este computador que aún no están descargados:</span>
                {faltan.map((m) => (
                  <div key={m} className="row">
                    <button className="btn rect small" disabled={Boolean(pulling[m])} onClick={() => void pull(m)}><Icon name="export" />Descargar {m}</button>
                    {pulling[m] && <span className="small muted" role="status">{pulling[m]}</span>}
                  </div>
                ))}
                <span className="small muted">Se descargan con Ollama (varios GB): la primera vez puede tardar según tu internet.</span>
              </div>
            )}
            <details className="grp">
              <summary>Requisitos para usar la app</summary>
              <div className="col" style={{ gap: 6, paddingTop: 6 }}>
                {(['minimo', 'recomendado', 'ideal'] as const).map((k) => {
                  const r = eq.requisitos[k];
                  const meets = eq.equipo.ramGb >= r.ramGb - 0.5 && eq.equipo.cores >= r.cores && eq.equipo.diskFreeGb >= r.discoGb;
                  return (
                    <div key={k} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <Icon name={meets ? 'check' : 'close'} style={{ color: meets ? 'var(--pinkText)' : 'var(--muted)', flex: 'none', marginTop: 2 }} />
                      <span className="small"><strong>{k === 'minimo' ? 'Mínimo' : k === 'recomendado' ? 'Recomendado' : 'Ideal'}:</strong> {r.texto}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </section>

      {/* Estado del sistema */}
      <section className="card" style={sec}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18 }} className="row">
            <AxiLive state={checking ? 'pensando' : !checks ? 'dormido' : missing.length ? 'error' : 'listo'} size={36} color={missing.length && !checking ? 'hueso' : undefined} />
            {checking ? 'Revisando…' : !checks ? 'Estado del sistema' : missing.length ? `Hay ${missing.length} cosa${missing.length === 1 ? '' : 's'} por arreglar` : 'Todo funcionando'}
          </h2>
          <button className="btn rect small" disabled={checking} onClick={review}><Icon name="refresh" />Revisar de nuevo</button>
        </div>
        {checks && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {checks.map((c) => (
              <div key={c.name} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--panel2)' }}>
                <Icon name={c.ok ? 'check' : 'warning'} style={{ color: c.ok ? 'var(--pinkText)' : 'var(--danger)', flex: 'none', marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
                  {!c.ok && c.fix && <div className="small" style={{ marginTop: 2 }}>Arreglo: <code>{c.fix}</code></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!a ? <div className="axi-empty"><AxiLive state="pensando" size={56} /><span>Cargando la configuración…</span></div> : (
        <>
          {/* IA */}
          <section className="card" style={sec}>
            <h2 style={{ fontSize: 18 }}>IA local</h2>
            <span className="small muted">{!ia?.running ? 'Ollama no está abierto: ábrelo para que la app escriba guiones, ganchos y entienda las referencias.' : `Ollama ${ia.version} · ${ia.installed.length} modelo${ia.installed.length === 1 ? '' : 's'} instalado${ia.installed.length === 1 ? '' : 's'}${ia.loaded ? ' · el modelo ya está cargado' : ''}.`}</span>
            {ia?.running && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <label className="field">Modelo para escribir (guiones, ganchos, textos)
                  <select value={a.llm ?? ''} onChange={(e) => void save({ llm: e.target.value })}>
                    <option value="">Que elija la app{ia.model ? ` (hoy: ${ia.model})` : ''}</option>
                    {ia.installed.filter((m) => !/vl|vision|embed/i.test(m)).map((m) => <option key={m} value={m} disabled={caben[m] === false}>{m}{caben[m] === false ? ' (muy grande para este computador)' : ''}</option>)}
                  </select>
                  <span className="small muted">Los modelos grandes escriben mejor pero tardan más y usan más memoria; con 16 GB, hasta unos 14 mil millones de parámetros.</span>
                </label>
                <label className="field">Modelo que mira las tomas
                  <select value={a.vision ?? ''} onChange={(e) => void save({ vision: e.target.value })}>
                    <option value="">Que elija la app{ia.vision ? ` (hoy: ${ia.vision})` : ''}</option>
                    {ia.installed.filter((m) => /vl|vision|gemma/i.test(m)).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="row">
              <button className="btn rect small" disabled={busy === 'ia' || !ia?.running} onClick={testIa}>{busy === 'ia' ? 'Probando…' : 'Probar la IA'}</button>
              {iaTest && <span className="small" style={{ color: iaTest.ok ? 'var(--pinkText)' : 'var(--danger)' }}>{iaTest.text}</span>}
            </div>
          </section>

          {/* Voz */}
          <section className="card" style={sec}>
            <h2 style={{ fontSize: 18 }}>Voz por defecto</h2>
            <span className="small muted">La que usa la app cuando no eliges otra (voz en off, guiones, doblaje).</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              <label className="field">Proveedor
                <select value={a.voz?.proveedor ?? ''} onChange={(e) => void save({ voz: { proveedor: e.target.value || undefined, voz: e.target.value === 'qwen' ? a.voz?.voz : undefined } })}>
                  <option value="">La mejor disponible</option>
                  {voces.map((v) => <option key={v} value={v}>{PROVEEDOR[v] ?? v}</option>)}
                </select>
              </label>
              {a.voz?.proveedor === 'qwen' && (
                <label className="field">Voz
                  <select value={a.voz?.voz ?? ''} onChange={(e) => void save({ voz: { proveedor: 'qwen', voz: e.target.value || undefined } })}>
                    <option value="">Mujer colombiana, cálida (por defecto)</option>
                    {vocesIA.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="row">
              <button className="btn rect small" disabled={busy === 'voz'} onClick={testVoz}><Icon name="play" />{busy === 'voz' ? 'Generando la muestra…' : 'Escuchar una muestra'}</button>
              {vozTest && <span className="small" style={{ color: vozTest.ok ? 'var(--muted)' : 'var(--danger)' }}>{vozTest.text}</span>}
            </div>
            {vozTest?.url && <audio controls autoPlay src={vozTest.url} style={{ width: '100%' }} />}
          </section>

          {/* Videos nuevos y exportación */}
          <section className="card" style={sec}>
            <h2 style={{ fontSize: 18 }}>Videos nuevos y exportación</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label className="field">Forma por defecto
                <select value={a.forma ?? ''} onChange={(e) => void save({ forma: (e.target.value || undefined) as Ajustes['forma'] })}>
                  <option value="">Vertical (reels)</option><option value="horizontal">Horizontal (YouTube)</option><option value="cuadrado">Cuadrado</option>
                </select>
              </label>
              <label className="field">Calidad al exportar
                <select value={a.exportar?.calidad ?? ''} onChange={(e) => void save({ exportar: { ...a.exportar, calidad: (e.target.value || undefined) as never } })}>
                  <option value="">Alta (recomendada para redes)</option><option value="maxima">Máxima (archivos grandes)</option><option value="ligera">Ligera (para enviar rápido)</option>
                </select>
              </label>
              <label className="field">Volumen final
                <select value={String(a.exportar?.lufs ?? '')} onChange={(e) => void save({ exportar: { ...a.exportar, lufs: (e.target.value ? Number(e.target.value) : undefined) as never } })}>
                  <option value="">Redes (−14 LUFS)</option><option value="-16">Más suave (−16 LUFS)</option>
                </select>
              </label>
              <label className="field">Carpeta donde exportar
                <input defaultValue={a.exportar?.carpeta ?? ''} placeholder="La carpeta de cada proyecto" onBlur={(e) => { if (e.target.value.trim() !== (a.exportar?.carpeta ?? '')) void save({ exportar: { ...a.exportar, carpeta: e.target.value } }); }} />
              </label>
            </div>
            <span className="small muted">Se aplica a los videos que crees desde ahora; los que ya existen guardan lo suyo (cámbialo al exportar).</span>
          </section>

          {/* Instagram */}
          <section className="card" style={sec}>
            <h2 style={{ fontSize: 18 }}>Instagram</h2>
            <span className="small muted">Tu sesión sirve para analizar perfiles y reels en Referencias. Para publicar, conecta tus cuentas en Proyectos › Ajustes › Cuentas.</span>
            <IgSesion toast={ctx.toast} />
          </section>

          {/* Apariencia */}
          <section className="card" style={sec}>
            <h2 style={{ fontSize: 18 }}>Apariencia</h2>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 360 }}>
              {(['oscuro', 'claro'] as const).map((t) => <button key={t} className={theme === t ? 'on' : ''} aria-pressed={theme === t} onClick={() => setTheme(t)}><Icon name={t === 'oscuro' ? 'moon' : 'sun'} style={{ marginRight: 6 }} />Tema {t}</button>)}
            </div>
          </section>
        </>
      )}
    </main>
  );
};
