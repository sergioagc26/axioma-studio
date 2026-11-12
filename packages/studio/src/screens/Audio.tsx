import { BankKey, useBankKey } from '../Bank.tsx';
import React, { useRef, useState } from 'react';
import type { Project } from '@snz/schema';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL } from '../SceneFrame.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Barra de volumen que guarda al soltar (para no llenar el historial de deshacer). */
const Volume: React.FC<{ label: string; value: number; max?: number; onCommit: (v: number) => void }> = ({ label, value, max = 1, onCommit }) => {
  const [v, setV] = useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <label className="field">{label}: {pct(v)}
      <input type="range" min={0} max={max} step={0.01} value={v} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onCommit(v)} onKeyUp={() => v !== value && onCommit(v)} />
    </label>
  );
};

export const Audio: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const a = project.audio;
  const pid = encodeURIComponent(project.id);
  const [busy, setBusy] = useState('');
  const [license, setLicense] = useState('');
  const [voText, setVoText] = useState(a.voiceover?.text ?? '');
  const [voProvider, setVoProvider] = useState('');
  const [fx, setFx] = useState({ scene: project.scenes[0]?.id ?? '', id: 'whoosh', offset: 0, volume: 0.6 });
  const musicInput = useRef<HTMLInputElement>(null);
  // Banco de sonidos (Freesound).
  const [soundsOk, recheckSounds] = useBankKey('freesound');
  const [sq, setSq] = useState('');
  const [sounds, setSounds] = useState<{ id: number; name: string; duration: number; author: string; license: string; preview: string }[] | null>(null);
  const [finding, setFinding] = useState(false);
  const searchSounds = async () => {
    setFinding(true);
    try {
      const d = await api<{ results: any[] }>(`/api/sonidos?q=${encodeURIComponent(sq.trim())}`);
      setSounds(d.results);
      if (!d.results.length) ctx.toast('No se encontraron sonidos. Prueba en inglés (por ejemplo: whoosh, cash register, applause).');
    } catch (e: any) { ctx.toast(e.message); } finally { setFinding(false); }
  };

  const op = async (body: object): Promise<any> => api(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  /** Operación corta que devuelve el proyecto. */
  const run = async (body: object, ok?: string) => {
    try {
      const d = await op(body);
      if (d.project) store.replace(d.project);
      await store.reloadExtras();
      if (ok) ctx.toast(ok);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Operación larga (tarea en el servidor). */
  const runJob = async (body: object, label: string, ok: string) => {
    setBusy(label);
    try {
      await waitJob(await op(body) as Job, (j) => setBusy(j.message));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast(ok);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  // Grabación de voz con el micrófono.
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      const tick = window.setInterval(() => setRecSecs(Math.round((Date.now() - t0) / 1000)), 500);
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        window.clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        setRec(null); setRecSecs(0);
        setBusy('Subiendo tu grabación…');
        try {
          const job = await api<Job>(`/api/voz?id=${pid}`, { method: 'POST', body: new Blob(chunks, { type: r.mimeType }) });
          await waitJob(job, (j) => setBusy(j.message));
          const d = await api(`/api/project?id=${pid}`);
          store.replace(d.project);
          await store.reloadExtras();
          ctx.toast('Tu voz quedó como voz en off, limpia y subtitulada.');
        } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
      };
      r.start();
      setRec(r);
    } catch { ctx.toast('No se pudo usar el micrófono. Revisa que el navegador tenga permiso.'); }
  };
  const stopRec = () => rec?.stop();

  const uploadMusic = async (file: File) => {
    if (!license.trim()) return ctx.toast('Escribe primero la licencia de la música (por ejemplo: propia, Artlist, YouTube Audio Library).');
    setBusy('Subiendo la música…');
    try {
      const d = await api(`/api/music?id=${pid}&filename=${encodeURIComponent(file.name)}&license=${encodeURIComponent(license.trim())}`, { method: 'POST', body: file });
      store.replace(d.project);
      ctx.toast('Música puesta. Baja sola cuando hay voz.');
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  const set = (fn: (p: Project) => void) => store.update(fn);
  const musicAsset = project.assets.find((x) => x.file === a.music);
  const hablado = project.kind === 'hablado';
  const allFx = project.scenes.flatMap((s, i) => s.sfx.map((e, k) => ({ s, i, e, k })));

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>Audio</h1>
        {busy ? <span className="pill" role="status">{busy}</span> : <span className="muted">La mezcla final se nivela sola a {a.targetLufs} LUFS al exportar.</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}>Sonido original del video</h2>
          <span className="small muted">{hablado ? 'Tu voz grabada.' : 'El ambiente del video (golpes, sartén, pesas…).'}</span>
          <Volume label="Volumen" value={a.originalVolume} onCommit={(v) => set((p) => { p.audio.originalVolume = v; })} />
          <button className="btn rect" onClick={() => set((p) => { p.audio.originalVolume = p.audio.originalVolume > 0 ? 0 : 1; })}>
            {a.originalVolume > 0 ? 'Quitar el sonido original' : 'Devolver el sonido original'}
          </button>
          {a.originalVolume === 0 && <span className="small muted">El video queda mudo: solo sonarán la música, la voz en off y los efectos.</span>}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}>Corrección de voz</h2>
          {hablado ? (
            <>
              <label className="row"><input type="checkbox" checked={a.denoise} disabled={Boolean(busy)}
                onChange={(e) => runJob({ op: 'corregir-audio', denoise: e.target.checked }, 'Procesando la voz…', e.target.checked ? 'Limpieza de ruido activada.' : 'Limpieza de ruido apagada.')} /> Limpiar ruido de fondo</label>
              <div className="col">
                <span className="small muted">Fuerza de la limpieza</span>
                <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {(['suave', 'media', 'fuerte'] as const).map((l) => (
                    <button key={l} className={a.denoiseLevel === l ? 'on' : ''} disabled={!a.denoise || Boolean(busy)} aria-pressed={a.denoiseLevel === l}
                      onClick={() => runJob({ op: 'corregir-audio', level: l }, 'Procesando la voz…', `Limpieza ${l} aplicada.`)}>{l[0].toUpperCase() + l.slice(1)}</button>
                  ))}
                </div>
                <span className="small muted">Fuerte quita más ruido, pero la voz puede sonar metálica.</span>
              </div>
              <label className="row"><input type="checkbox" checked={a.enhance} disabled={Boolean(busy)}
                onChange={(e) => runJob({ op: 'corregir-audio', enhance: e.target.checked }, 'Procesando la voz…', e.target.checked ? 'Realce de voz activado.' : 'Realce de voz apagado.')} /> Realzar la voz (más clara y con volumen parejo)</label>
            </>
          ) : (
            <span className="muted">La corrección de voz aplica a videos donde hablas. En un montaje, ajusta o quita el sonido original.</span>
          )}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}>Música de fondo</h2>
          {a.music ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)' }}>
                <span>{a.music.split('/').pop()}</span>
                <span className="small muted">Licencia: {musicAsset?.license ?? '—'}</span>
              </div>
              <audio controls src={`/media/${pid}/${a.music.split('/').map(encodeURIComponent).join('/')}`} style={{ width: '100%' }} />
              <Volume label="Volumen bajo la voz" value={a.musicVolume} onCommit={(v) => set((p) => { p.audio.musicVolume = v; })} />
              <span className="small muted">Sube sola en los silencios y baja cuando hay voz.</span>
              <button className="btn rect" onClick={() => run({ op: 'quitar-musica' }, 'Música quitada.')}>Quitar la música</button>
            </>
          ) : (
            <>
              <label className="field">Licencia de la música (obligatoria)
                <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Propia, Artlist, YouTube Audio Library…" />
              </label>
              <button className="btn primary" disabled={Boolean(busy)} onClick={() => musicInput.current?.click()}>Elegir archivo de música</button>
              <input ref={musicInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMusic(f); e.target.value = ''; }} />
              <span className="small muted">Usa solo música con licencia para uso comercial.</span>
            </>
          )}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}>Voz en off</h2>
          <div className="col" style={{ padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
            <strong>Graba tu voz</strong>
            <span className="small muted">Usa el micrófono del computador. La app limpia el ruido, nivela el volumen y pone los subtítulos.</span>
            <button className={`btn ${rec ? 'primary' : 'rect'}`} disabled={Boolean(busy)} onClick={rec ? stopRec : startRec}>{rec ? `Detener y usar (${recSecs} s)` : '● Grabar con el micrófono'}</button>
          </div>
          <span className="small muted">O deja que la app la genere:</span>
          <label className="field">Texto que dirá la voz
            <textarea rows={3} value={voText} onChange={(e) => setVoText(e.target.value)} placeholder="Unas 2,5 palabras por segundo: para 15 s, 35–40 palabras." />
          </label>
          <label className="field">Voz
            <select value={voProvider} onChange={(e) => setVoProvider(e.target.value)}>
              <option value="">La mejor disponible</option>
              {store.catalog.voices.map((v) => <option key={v} value={v}>{v === 'sistema' ? 'Del computador (gratis, más robótica)' : v === 'elevenlabs' ? 'ElevenLabs (natural)' : 'Piper (local)'}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={voText.trim().length < 2 || Boolean(busy)}
            onClick={() => runJob({ op: 'voz-en-off', text: voText.trim(), provider: voProvider }, 'Generando la voz en off…', 'Voz en off lista y subtitulada.')}>
            {a.voiceover ? 'Volver a generar' : 'Generar voz en off'}
          </button>
          {a.voiceover && (
            <>
              <audio controls src={`/media/${pid}/${a.voiceover.file.split(/[\\/]/).map(encodeURIComponent).join('/')}?v=${encodeURIComponent(project.updatedAt)}`} style={{ width: '100%' }} />
              <span className="small muted">{a.voiceover.provider} · {a.voiceover.duration.toFixed(1)} s · se subtitula sola</span>
              <button className="btn rect" onClick={() => run({ op: 'quitar-voz' }, 'Voz en off quitada.')}>Quitar la voz en off</button>
            </>
          )}
        </section>

        <section className="card col" style={{ gap: 12, gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: 17 }}>Efectos de sonido</h2>
          <label className="row"><input type="checkbox" checked={a.sfxAuto} onChange={(e) => run({ op: 'efectos-auto', on: e.target.checked }, e.target.checked ? 'Efectos automáticos activados.' : 'Efectos automáticos apagados.')} />
            Automáticos: un barrido en cada transición y un «pop» cuando entra un texto</label>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field">Escena
              <select value={fx.scene} onChange={(e) => setFx({ ...fx, scene: e.target.value })}>
                {project.scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.title || ROLE_LABEL[s.role]}</option>)}
              </select>
            </label>
            <label className="field">Efecto
              <select value={fx.id} onChange={(e) => setFx({ ...fx, id: e.target.value })}>
                {store.catalog.sfx.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="field">Segundo dentro de la escena
              <input type="number" min={0} step={0.1} value={fx.offset} style={{ width: 120 }} onChange={(e) => setFx({ ...fx, offset: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <button className="btn rect" onClick={() => new window.Audio(`/sfx/${fx.id}.wav`).play()}>Escuchar</button>
            <button className="btn primary" disabled={!fx.scene} onClick={() => run({ op: 'efecto', sceneId: fx.scene, id: fx.id, offset: fx.offset, volume: fx.volume }, 'Efecto añadido.')}>Añadir efecto</button>
          </div>
          <span className="small muted">{store.catalog.sfx.find((x) => x.id === fx.id)?.description} Úsalos con medida: uno en un cambio fuerte o en un texto clave.</span>
          <strong className="small" style={{ marginTop: 6 }}>Más sonidos: banco Freesound (gratis)</strong>
          {soundsOk === false ? <BankKey banco="freesound" name="Freesound" link="https://freesound.org/apiv2/apply" onSaved={recheckSounds} toast={ctx.toast} /> : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: '1 1 300px' }} value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Ej.: aplausos, caja registradora, risa, puerta, notificación"
                onKeyDown={(e) => { if (e.key === 'Enter' && sq.trim().length > 1 && !finding) searchSounds(); }} />
              <button className="btn rect" disabled={sq.trim().length < 2 || finding} onClick={searchSounds}>{finding ? 'Buscando…' : 'Buscar sonidos'}</button>
            </div>
          )}
          {sounds && sounds.length > 0 && (
            <div className="col list">
              {sounds.map((x) => (
                <div key={x.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--panel2)', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 220px', minWidth: 0 }}>{x.name} <span className="small muted">· {x.duration} s · {x.author} · {x.license}</span></span>
                  <span className="row">
                    <button className="btn rect" style={{ height: 34 }} onClick={() => new window.Audio(x.preview).play()}>Escuchar</button>
                    <button className="btn primary" style={{ height: 34 }} disabled={!fx.scene} onClick={() => run({ op: 'efecto-banco', sceneId: fx.scene, soundId: x.id, offset: fx.offset, volume: fx.volume }, `«${x.name}» añadido a la escena elegida arriba.`)}>Añadir</button>
                  </span>
                </div>
              ))}
              <span className="small muted">Solo aparecen sonidos que se pueden usar en contenido comercial. Los que dicen «pide dar crédito» quedan anotados con su autor en el proyecto.</span>
            </div>
          )}
          {allFx.length > 0 && (
            <div className="col list">
              {allFx.map(({ s, i, e, k }) => (
                <div key={`${s.id}-${k}`} className="row" style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--panel2)' }}>
                  <span>Escena {i + 1} · {store.catalog.sfx.find((x) => x.id === e.id)?.name ?? e.id} · a los {e.offset} s</span>
                  <button className="btn ghost" onClick={() => set((p) => { p.scenes[i].sfx.splice(k, 1); })}>Quitar</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
