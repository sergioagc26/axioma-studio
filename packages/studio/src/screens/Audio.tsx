import { BankKey, useBankKey } from '../Bank.tsx';
import React, { useEffect, useRef, useState } from 'react';
import type { Project } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL } from '../SceneFrame.tsx';
import { api, sceneDuration, waitJob, type Job } from '../useProject.ts';
import { Icon } from '../Icon.tsx';

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
  const [voText, setVoText] = useState(a.voiceover?.text ?? '');
  const [voProvider, setVoProvider] = useState('');
  // Momento del efecto en segundos del video (se convierte a escena + segundo dentro de ella al añadirlo).
  const [fx, setFx] = useState({ at: 0, id: 'whoosh', volume: 0.6 });
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
  const run = async (body: object, ok?: string, label = 'Guardando…') => {
    if (busy) return;
    setBusy(label);
    try {
      const d = await op(body);
      if (d.project) store.replace(d.project);
      await store.reloadExtras();
      if (ok) ctx.toast(ok);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };
  /** Operación larga (tarea en el servidor). */
  const runJob = async (body: object, label: string, ok: string) => {
    setBusy(label);
    try {
      await waitJob(await op(body) as Job, (j) => setBusy(j.message));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      await store.reloadExtras();
      // Si se pidió ElevenLabs y no respondió, la voz quedó con la del computador: se dice.
      const pedido = (body as { provider?: string }).provider;
      const usado = d.project?.audio?.voiceover?.provider;
      ctx.toast(pedido === 'elevenlabs' && usado && usado !== 'elevenlabs' ? `${ok} ElevenLabs no respondió: usé la voz del computador.` : ok);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  // Biblioteca de música (workspace/musica): canciones con licencia que la app elige sola.
  type Track = { file: string; name: string; license: string; bpm: number | null; energy: number; duration: number; mood: 'tranquila' | 'media' | 'energica' };
  const [tracks, setTracks] = useState<Track[] | null>(null);
  /** ¿Hay clave para la música automática? (null = no se sabe). */
  const [autoOk, setAutoOk] = useState<boolean | null>(null);
  /** Las respuestas de /api/musica pueden traer la lista sola o { tracks, auto }. */
  const takeTracks = (d: any) => {
    if (Array.isArray(d)) { setTracks(d); return d as Track[]; }
    if (typeof d?.auto === 'boolean') setAutoOk(d.auto);
    const list = Array.isArray(d?.tracks) ? (d.tracks as Track[]) : [];
    setTracks(list);
    return list;
  };
  const [libLicense, setLibLicense] = useState('');
  const [playing, setPlaying] = useState('');
  const player = useRef<HTMLAudioElement>(null);
  const loadTracks = () => api('/api/musica').then(takeTracks).catch(() => setTracks([]));
  useEffect(() => { loadTracks(); }, []);
  const preview = (file: string) => {
    const el = player.current;
    if (!el) return;
    if (playing === file) { el.pause(); setPlaying(''); return; }
    el.src = `/api/musica/archivo?f=${encodeURIComponent(file)}`;
    el.play().then(() => setPlaying(file)).catch(() => ctx.toast('No se pudo reproducir.'));
  };
  const addToLibrary = async (files: File[]) => {
    if (!libLicense.trim()) return ctx.toast('Escribe primero la licencia de las canciones (por ejemplo: propia, Artlist, YouTube Audio Library).');
    setBusy('Agregando a la biblioteca…');
    let last: Track | null = null;
    try {
      for (const [i, f] of files.entries()) {
        setBusy(`Analizando ${i + 1} de ${files.length}: ${f.name}`);
        const d = await api<{ track?: Track; tracks: Track[] }>(`/api/musica?filename=${encodeURIComponent(f.name)}&license=${encodeURIComponent(libLicense.trim())}`, { method: 'POST', body: f });
        takeTracks(d.tracks);
        last = d.track ?? null;
      }
      ctx.toast(`${files.length} canci${files.length === 1 ? 'ón agregada' : 'ones agregadas'} a la biblioteca.`);
    } catch (e: any) { ctx.toast(e.message); setBusy(''); return; }
    setBusy('');
    // Si el video no tenía música y se subió una sola canción, se pone de una vez.
    if (!a.music && files.length === 1 && last) await fromLibrary(last.file);
  };
  /** Cambia el nombre con que se ve una canción de la biblioteca. */
  const renameTrack = async (t: Track) => {
    const name = window.prompt('Nuevo nombre de la canción', t.name)?.trim();
    if (!name || name === t.name) return;
    try {
      const d = await api(`/api/musica?f=${encodeURIComponent(t.file)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (Array.isArray(d) || Array.isArray(d?.tracks)) takeTracks(d); else await loadTracks();
      ctx.toast(`Ahora se llama «${name}».`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Quita una canción de la biblioteca (la app ya no la elegirá). */
  const removeTrack = async (t: Track) => {
    if (!window.confirm(`¿Quitar «${t.name}» de la biblioteca? La app ya no la elegirá.`)) return;
    if (playing === t.file) { player.current?.pause(); setPlaying(''); }
    try {
      const d = await api(`/api/musica?f=${encodeURIComponent(t.file)}`, { method: 'DELETE' });
      if (Array.isArray(d) || Array.isArray(d?.tracks)) takeTracks(d); else await loadTracks();
      ctx.toast(`«${t.name}» quitada de la biblioteca.`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** En un montaje, cambiar de canción vuelve a poner los cortes en sus golpes. */
  const rebuiltNote = (d: any) => (d?.rebuilt || d?.ritmo ? ' Los cortes se rehicieron al ritmo de la canción nueva; la duración, los textos y el cierre siguen igual.' : '');
  const fromLibrary = async (file?: string) => {
    setBusy(file ? 'Poniendo la canción…' : 'Eligiendo la canción…');
    try {
      const d = await op({ op: 'musica-biblioteca', file });
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast((d.why ?? `Música: «${d.track?.name ?? 'puesta'}».`) + rebuiltNote(d));
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  /** La app elige y pone una canción sola (de la biblioteca o del banco gratuito). */
  const autoMusic = async () => {
    setBusy(a.music ? 'Buscando otra canción…' : 'Buscando una canción…');
    try {
      const done = await waitJob(await op({ op: 'otra-musica' }) as Job, (j) => setBusy(j.message || 'Buscando una canción…'));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast(String(done.result?.text ?? 'Música puesta.') + rebuiltNote(done.result));
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  // Montaje al ritmo de la música.
  const [density, setDensity] = useState('auto');
  const toBeat = async () => {
    setBusy('Escuchando la música…');
    try {
      const d = await op({ op: 'ritmo', densidad: density });
      store.replace(d.project);
      ctx.toast(`Listo: ${d.cuts} cortes en los golpes de la música (${d.duration.toFixed(1)} s)${d.drop != null ? `, con un destello en el golpe más fuerte (${d.drop.toFixed(1)} s)` : ''}.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  // Doblaje: crea una copia del reel con la voz en otro idioma.
  const [dubLang, setDubLang] = useState('en');
  const dub = async () => {
    setBusy('Preparando el doblaje…');
    try {
      const done = await waitJob(await op({ op: 'doblar', idioma: dubLang, provider: voProvider }) as Job, (j) => setBusy(j.message));
      const r = done.result as { id: string; lines: number; tight: number; idioma: string };
      ctx.toast(`Listo: copia en ${r.idioma} con ${r.lines} frases dobladas${r.tight ? ` (${r.tight} quedaron justas de tiempo; revísalas)` : ''}. El video original no cambió. Abrí la copia doblada: mírala y expórtala.`);
      ctx.go('listo', { p: r.id, s: null });
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  // Grabación de voz con el micrófono.
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  // Grabación en curso: para cancelarla y para cerrar el micrófono al salir de la pantalla.
  const recRef = useRef<{ r: MediaRecorder; stream: MediaStream; tick: number; cancel: boolean } | null>(null);
  const endRec = (cancel: boolean) => {
    const c = recRef.current;
    if (!c) return;
    c.cancel = cancel;
    if (c.r.state !== 'inactive') c.r.stop();
  };
  useEffect(() => () => {
    const c = recRef.current;
    if (!c) return;
    c.cancel = true;
    window.clearInterval(c.tick);
    if (c.r.state !== 'inactive') c.r.stop();
    c.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
  }, []);
  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return ctx.toast('Grabar solo funciona en el computador donde está instalada la app. Desde otro equipo, graba con el teléfono y sube el audio.');
    }
    if (a.voiceover && !window.confirm('Ya hay una voz en off. Tu grabación la va a reemplazar. ¿Seguir?')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      const tick = window.setInterval(() => setRecSecs(Math.round((Date.now() - t0) / 1000)), 500);
      const me = { r, stream, tick, cancel: false };
      recRef.current = me;
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        window.clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        if (recRef.current === me) recRef.current = null;
        setRec(null); setRecSecs(0);
        if (me.cancel) return; // cancelada o se salió de la pantalla: no se sube nada
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
    } catch { ctx.toast('No se pudo usar el micrófono. Revisa que el navegador tenga permiso para usarlo.'); }
  };

  const set = (fn: (p: Project) => void) => store.update(fn);
  const musicAsset = project.assets.find((x) => x.file === a.music);
  const hablado = project.kind === 'hablado';
  // Sin voz (montaje sin voz en off) la música nunca baja: se muestra el volumen que se oye.
  const sinVoz = !hablado && !a.voiceover;
  const musicOff = Boolean((a as typeof a & { musicOff?: boolean }).musicOff);
  const song = musicAsset?.source?.replace(/^Biblioteca de música:\s*/, '') || a.music?.split('/').pop() || '';
  const inUse = (t: Track) => Boolean(a.music) && (a.music!.split('/').pop() === t.file || t.name === song);
  /** Nombre legible de un efecto (los del banco salen de su crédito en el proyecto). */
  const fxName = (id: string) => store.catalog.sfx.find((x) => x.id === id)?.name
    ?? project.assets.find((x) => x.file === `media/sfx/${id}.wav`)?.source?.replace(/^Freesound\s*·\s*/, '')
    ?? id;
  const allFx = project.scenes.flatMap((s, i) => s.sfx.map((e, k) => ({ s, i, e, k })));
  // Dónde empieza cada escena en el video, para hablar en segundos del video y no de escenas.
  const starts = project.scenes.reduce<number[]>((acc, s, i) => { acc.push(i ? acc[i - 1] + sceneDuration(project.scenes[i - 1]) : 0); return acc; }, []);
  const total = project.scenes.length ? starts[starts.length - 1] + sceneDuration(project.scenes[project.scenes.length - 1]) : 0;
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
  /** Escena y segundo dentro de ella que corresponden a un momento del video. */
  const place = (() => {
    if (!project.scenes.length) return null;
    const at = Math.min(Math.max(0, fx.at), Math.max(0, total - 0.05));
    let i = starts.findIndex((st, k) => at < st + sceneDuration(project.scenes[k]));
    if (i < 0) i = project.scenes.length - 1;
    return { scene: project.scenes[i], i, offset: Math.round((at - starts[i]) * 100) / 100 };
  })();

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>Audio</h1>
        {busy ? <span className="pill" role="status">{busy}</span> : <span className="muted">El volumen final se ajusta solo al exportar.</span>}
      </div>

      {/* Columnas tipo mosaico: las tarjetas de distinto alto no dejan huecos. */}
      <div className="masonry">
        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}><Icon name={a.originalVolume > 0 ? 'sound' : 'mute'} /> Sonido original del video</h2>
          <span className="small muted">{hablado ? 'Tu voz grabada.' : 'El ambiente del video (golpes, sartén, pesas…).'}</span>
          <Volume label="Volumen" value={a.originalVolume} onCommit={(v) => set((p) => { p.audio.originalVolume = v; })} />
          <button className="btn rect" disabled={Boolean(busy)} onClick={() => set((p) => { p.audio.originalVolume = p.audio.originalVolume > 0 ? 0 : 1; })}>
            {a.originalVolume > 0 ? 'Quitar el sonido original' : 'Devolver el sonido original'}
          </button>
          {a.originalVolume === 0 && <span className="small muted help">El video queda mudo: solo sonarán la música, la voz en off y los efectos.</span>}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}><Icon name="wand" /> Corrección de voz</h2>
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
          <h2 style={{ fontSize: 17 }}><Icon name="music" /> Música de fondo</h2>
          {a.music ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)' }}>
                <span>{song}</span>
                <span className="small muted">Licencia: {musicAsset?.license ?? 'sin dato'}</span>
              </div>
              <audio controls src={`/media/${pid}/${a.music.split('/').map(encodeURIComponent).join('/')}`} style={{ width: '100%' }} />
              {sinVoz ? (
                // En el video la música suena a min(1, volumen × 2,5) cuando no hay voz: la barra muestra eso.
                <Volume label="Volumen de la música" value={Math.min(1, a.musicVolume * 2.5)} onCommit={(v) => set((p) => { p.audio.musicVolume = v / 2.5; })} />
              ) : (
                <>
                  <Volume label="Volumen bajo la voz" value={a.musicVolume} onCommit={(v) => set((p) => { p.audio.musicVolume = v; })} />
                  <span className="small muted">Sube sola en los silencios y baja cuando hay voz.</span>
                </>
              )}
              <button className="btn primary" disabled={Boolean(busy)} onClick={autoMusic}><Icon name="refresh" /> Otra canción</button>
              {project.kind === 'montaje' && <span className="small muted">Al cambiar de canción, los cortes se rehacen a su ritmo. La duración, los textos y el cierre siguen igual.</span>}
              {project.kind === 'montaje' && (
                <div className="col" style={{ padding: 12, borderRadius: 10, background: 'var(--panel2)', gap: 8 }}>
                  <strong>Cortar al ritmo</strong>
                  <span className="small muted help">Cada corte cae justo en un golpe de la canción. En automático corta más seguido donde la música sube y pone un destello en el golpe más fuerte.</span>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <select value={density} onChange={(e) => setDensity(e.target.value)} aria-label="Cada cuánto cortar">
                      <option value="auto">Automático (sigue la energía)</option>
                      <option value="pulso">En cada golpe</option>
                      <option value="medio">Cada 2 golpes</option>
                      <option value="compas">Cada 4 golpes</option>
                    </select>
                    <button className="btn rect" disabled={Boolean(busy)} onClick={toBeat}>Cortar al ritmo</button>
                  </div>
                </div>
              )}
              <button className="btn rect" disabled={Boolean(busy)} onClick={() => run({ op: 'quitar-musica' }, 'Música quitada. La edición automática no pondrá otra.', 'Quitando la música…')}><Icon name="trash" /> Quitar la música</button>
            </>
          ) : (
            <>
              <span className="muted">{musicOff ? 'Quitaste la música: la edición automática no pondrá otra.' : 'Este video no tiene música.'}</span>
              <button className="btn primary" disabled={Boolean(busy)} onClick={autoMusic}><Icon name="sparkle" /> Poner música automática</button>
              {autoOk === false && !tracks?.length && <span className="small muted">Para la música automática hace falta la clave gratuita de Freesound (abajo, en Efectos de sonido), o sube tus canciones a la biblioteca.</span>}
              <span className="small muted">O sube tu propia canción en la biblioteca de abajo. Usa solo música con licencia para uso comercial.</span>
            </>
          )}
          <div className="col" style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Tu biblioteca de música</strong>
              <span className="small muted">{tracks ? `${tracks.length} canciones` : ''}</span>
            </div>
            <span className="small muted help">Súbelas una vez con su licencia; la app elige la que va con el ritmo de cada video. Las de Freesound las trae la app sola: quita las que no te gusten.</span>
            {tracks && tracks.length > 0 && (
              <>
                <div className="col" style={{ gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {tracks.map((t) => (
                    <div key={t.file} className="row" style={{ flexWrap: 'nowrap', gap: 8, padding: 8, borderRadius: 8, background: 'var(--panel2)', ...(inUse(t) ? { outline: '2px solid var(--pink)' } : {}) }}>
                      <button className="btn sq" style={{ width: 32, height: 32, flex: 'none' }} aria-label={playing === t.file ? `Pausar ${t.name}` : `Escuchar ${t.name}`} onClick={() => preview(t.file)}><Icon name={playing === t.file ? 'pause' : 'play'} /></button>
                      <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                        <strong className="small pname">{t.name}</strong>
                        <span className="small muted">{inUse(t) ? 'En uso · ' : ''}{({ tranquila: 'Tranquila', media: 'Ritmo medio', energica: 'Enérgica' } as const)[t.mood]} · {Math.floor(t.duration / 60)}:{String(Math.round(t.duration % 60)).padStart(2, '0')} · {t.license}</span>
                      </span>
                      <button className="btn rect" style={{ height: 30, flex: 'none' }} disabled={Boolean(busy) || inUse(t)} onClick={() => fromLibrary(t.file)}>Usar</button>
                      <button className="btn sq" style={{ width: 30, height: 30, flex: 'none' }} aria-label={`Cambiar el nombre de ${t.name}`} title="Cambiar el nombre" disabled={Boolean(busy)} onClick={() => renameTrack(t)}><Icon name="edit" /></button>
                      <button className="btn sq" style={{ width: 30, height: 30, flex: 'none' }} aria-label={`Quitar ${t.name}`} title="Quitar de la biblioteca" disabled={Boolean(busy)} onClick={() => removeTrack(t)}><Icon name="trash" /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" style={{ flex: 1, minWidth: 0, minHeight: 34 }} value={libLicense} onChange={(e) => setLibLicense(e.target.value)} placeholder="Licencia (propia, Artlist…)" aria-label="Licencia de las canciones" />
              <label className="btn rect" style={{ height: 34, cursor: 'pointer', flex: 'none', ...(busy ? { opacity: 0.5, pointerEvents: 'none' } : {}) }} aria-disabled={Boolean(busy)}><Icon name="upload" /> Agregar canciones
                <input type="file" accept="audio/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) addToLibrary(fs); e.target.value = ''; }} />
              </label>
            </div>
            <audio ref={player} onEnded={() => setPlaying('')} hidden />
          </div>
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}><Icon name="mic" /> Voz en off</h2>
          <div className="col" style={{ padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
            <strong>Graba tu voz</strong>
            <span className="small muted help">Usa el micrófono del computador. La app limpia el ruido, nivela el volumen y pone los subtítulos.</span>
            {rec ? (
              <div className="row">
                <button className="btn primary" onClick={() => endRec(false)}><Icon name="stop" /> Detener y usar ({recSecs} s)</button>
                <button className="btn rect" onClick={() => endRec(true)}><Icon name="close" /> Cancelar</button>
              </div>
            ) : <button className="btn rect" disabled={Boolean(busy)} onClick={startRec}><Icon name="mic" /> Grabar con el micrófono</button>}
          </div>
          <span className="small muted">O deja que la app la genere:</span>
          <label className="field">Texto que dirá la voz
            <textarea rows={3} value={voText} onChange={(e) => setVoText(e.target.value)} placeholder="Unas 2,5 palabras por segundo: para 15 s, 35–40 palabras." />
          </label>
          <label className="field">Voz
            <select value={voProvider} onChange={(e) => setVoProvider(e.target.value)}>
              <option value="">La mejor disponible</option>
              {store.catalog.voices.map((v) => <option key={v} value={v}>{v === 'sistema' ? 'Del computador (gratis, más robótica)' : v === 'elevenlabs' ? 'ElevenLabs (natural)' : v === 'qwen' ? 'Voz IA local (natural, gratis; tarda ~1 min)' : 'Voz local'}</option>)}
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
              <button className="btn rect" disabled={Boolean(busy)} onClick={() => run({ op: 'quitar-voz' }, 'Voz en off quitada.', 'Quitando la voz en off…')}><Icon name="trash" /> Quitar la voz en off</button>
            </>
          )}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}><Icon name="globe" /> Doblaje a otro idioma</h2>
          <span className="small muted help">Traduce lo que dices frase por frase con la IA local, genera la voz y la ajusta para que cada frase caiga en su momento. Los subtítulos y los textos en pantalla salen en el nuevo idioma. Se crea una copia: este video no cambia. Hazlo cuando el corte ya esté listo. Los labios no se sincronizan.</span>
          {a.voiceover?.language ? <span className="pill line">Este video ya es un doblaje ({a.voiceover.language})</span> : !hablado ? (
            <span className="muted">El doblaje es para videos donde hablas. En este video nadie habla, así que no hay voz que traducir: si quieres una voz, usa la voz en off.</span>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <select value={dubLang} onChange={(e) => setDubLang(e.target.value)} aria-label="Idioma del doblaje">
                <option value="en">Inglés</option>
                <option value="pt">Portugués (Brasil)</option>
                <option value="fr">Francés</option>
                <option value="it">Italiano</option>
                <option value="de">Alemán</option>
              </select>
              <button className="btn primary" disabled={Boolean(busy)} onClick={dub}>Crear versión doblada</button>
            </div>
          )}
          {hablado && <span className="small muted help">Usa la voz elegida arriba en «Voz» (la del computador si no hay otra). Tarda alrededor de un minuto.</span>}
        </section>

        <section className="card col" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17 }}><Icon name="bolt" /> Efectos de sonido</h2>
          <label className="row"><input type="checkbox" checked={a.sfxAuto} disabled={Boolean(busy)} onChange={(e) => run({ op: 'efectos-auto', on: e.target.checked }, e.target.checked ? 'Efectos automáticos activados.' : 'Efectos automáticos apagados. La edición automática no los volverá a poner.', 'Guardando…')} />
            Automáticos: un barrido en cada transición y un «pop» cuando entra un texto</label>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field">Efecto
              <select value={fx.id} onChange={(e) => setFx({ ...fx, id: e.target.value })}>
                {store.catalog.sfx.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="field">Segundo del video
              <input type="number" min={0} max={Math.round(total * 10) / 10} step={0.1} value={fx.at} style={{ width: 120 }} onChange={(e) => setFx({ ...fx, at: Math.min(Math.max(0, Number(e.target.value) || 0), Math.round(total * 10) / 10) })} />
            </label>
            <button className="btn rect" onClick={() => new window.Audio(`/sfx/${fx.id}.wav`).play()}><Icon name="play" /> Escuchar</button>
            <button className="btn primary" disabled={!place || Boolean(busy)} onClick={() => place && run({ op: 'efecto', sceneId: place.scene.id, id: fx.id, offset: place.offset, volume: fx.volume }, `Efecto añadido a los ${fmt(fx.at)} del video.`, 'Añadiendo el efecto…')}><Icon name="plus" /> Añadir efecto</button>
          </div>
          {place && <span className="small muted">Sonará a los {fmt(Math.min(fx.at, total))} del video (dura {fmt(total)}), en la escena {place.i + 1} · {place.scene.title || ROLE_LABEL[place.scene.role]}.</span>}
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
                    <button className="btn rect" style={{ height: 34 }} onClick={() => new window.Audio(x.preview).play()}><Icon name="play" /> Escuchar</button>
                    <button className="btn rect" style={{ height: 34 }} disabled={!place || Boolean(busy)} onClick={() => place && run({ op: 'efecto-banco', sceneId: place.scene.id, soundId: x.id, offset: place.offset, volume: fx.volume }, `«${x.name}» añadido a los ${fmt(fx.at)} del video (el segundo elegido arriba).`, 'Añadiendo el sonido…')}><Icon name="plus" /> Añadir</button>
                  </span>
                </div>
              ))}
              <span className="small muted help">Solo aparecen sonidos que se pueden usar en contenido comercial. Los que dicen «pide dar crédito» quedan anotados con su autor en el proyecto.</span>
            </div>
          )}
          {allFx.length > 0 && (
            <div className="col list">
              {allFx.map(({ s, i, e, k }) => (
                <div key={`${s.id}-${k}`} className="row" style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--panel2)' }}>
                  <span>{fxName(e.id)} · a los {fmt(starts[i] + e.offset)} del video <span className="small muted">(escena {i + 1})</span></span>
                  <button className="btn ghost" disabled={Boolean(busy)} onClick={() => set((p) => {
                    p.scenes[i].sfx.splice(k, 1);
                    // Si era el último uso de un sonido del banco, se quita también su crédito.
                    if (e.id.startsWith('banco-') && !p.scenes.some((x) => x.sfx.some((y) => y.id === e.id))) p.assets = p.assets.filter((x) => x.file !== `media/sfx/${e.id}.wav`);
                  })}><Icon name="trash" /> Quitar</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
