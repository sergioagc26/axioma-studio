import React, { useEffect, useState } from 'react';
import { AI_VOICES, SCRIPT_STRUCTURES, SCRIPT_TRANSITIONS, SHOT_MOVES, SHOT_SIZES, guionMarkdown, guionSeconds, guionVoice, spokenSeconds, type Guion as GuionT, type GuionRow } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { Icon } from '../Icon.tsx';
import { Teleprompter } from '../Teleprompter.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

const EMPTY_ROW: GuionRow = { seccion: '', voz: '', imagen: '', plano: 'primer plano', movimiento: 'acercar', texto: '', transicion: 'corte', sonido: '', segundos: 0 };

/**
 * Guion: la app escribe el guion literario (lo que dice la voz) y el técnico (fila por fila: voz,
 * imagen, plano, movimiento, texto, entrada y sonido). Se corrige aquí mismo y, en un montaje,
 * un botón lo convierte en el video con cada imagen puesta sobre su frase.
 */
export const Guion: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const pid = encodeURIComponent(project.id);
  const [g, setG] = useState<GuionT | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [idea, setIdea] = useState('');
  const [estructura, setEstructura] = useState<string>('historia');
  const [duracion, setDuracion] = useState(Number(String(project.brief.duracion ?? '').match(/\d+/)?.[0]) || 30);
  const [tono, setTono] = useState(project.brief.tono ?? '');
  const [voice, setVoice] = useState('');
  const [tags, setTags] = useState<{ value: string; label: string }[]>([]);
  const [prompter, setPrompter] = useState(false);
  // Cortar con el guion (videos hablados): el texto que la persona pensaba decir.
  const [cutText, setCutText] = useState(project.scriptCut?.text ?? '');
  const [take, setTake] = useState<'ultima' | 'mejor' | 'primera'>(project.scriptCut?.take ?? 'ultima');
  const cut = project.scriptCut;
  const montage = project.kind === 'montaje';
  const aiVoice = store.catalog.voices.includes('qwen');

  useEffect(() => {
    let live = true;
    api<GuionT | null>(`/api/guion?id=${pid}`).then((x) => {
      if (!live) return;
      setG(x); setLoaded(true);
      if (x) { setIdea(x.idea); setEstructura(x.estructura); setDuracion(x.duracion); setTono(x.tono); setVoice(x.voz ?? ''); }
      if (x && !project.scriptCut?.text) setCutText(x.filas.map((f) => f.voz.trim()).filter(Boolean).join('\n'));
    }).catch(() => setLoaded(true));
    // Qué hay grabado (etiquetas de las tomas), para elegir la toma de cada fila.
    if (montage) api<{ id: string; tag?: string; file?: string }[]>(`/api/tomas?id=${pid}`).then((s) => { if (live) setTags([...[...new Set(s.map((x) => x.tag).filter((t): t is string => Boolean(t)))].map((t) => ({ value: t, label: `Cualquiera de: ${t}` })), ...s.map((x) => ({ value: x.id, label: `Toma ${x.id.slice(1)}${x.tag ? ` · ${x.tag}` : ''}` }))]); }).catch(() => {});
    return () => { live = false; };
  }, [pid, montage]);

  const op = (body: object) => api<Job>(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const edit = (fn: (x: GuionT) => void) => { if (!g) return; const n = structuredClone(g); fn(n); setG(n); setDirty(true); };
  const save = async (x = g): Promise<GuionT | null> => {
    if (!x) return null;
    const saved = await api<GuionT>(`/api/guion?id=${pid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...x, voz: voice || undefined }) });
    setG(saved); setDirty(false);
    return saved;
  };

  const write = async () => {
    if (g && dirty && !confirm('Tienes cambios sin guardar en el guion. ¿Escribir uno nuevo y perderlos?')) return;
    setBusy('Escribiendo el guion…');
    try {
      const done = await waitJob(await op({ op: 'guion-escribir', idea: idea.trim(), estructura, duracion, tono: tono.trim(), voz: voice }), (j) => setBusy(j.message));
      const ng = done.result?.guion as GuionT;
      setG(ng); setDirty(false);
      ctx.toast(ng.origen === 'ia' ? 'Guion listo. Léelo y corrige lo que quieras.' : 'La IA local no respondió: te dejé la plantilla para llenarla.');
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  const toVideo = async () => {
    if (!g) return;
    setBusy('Guardando el guion…');
    try {
      await save();
      const done = await waitJob(await op({ op: 'guion-aplicar', provider: aiVoice && voice ? 'qwen' : '', voice }), (j) => setBusy(j.message));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast((done.result?.summary as string[] | undefined)?.[1] ?? 'Video armado con tu guion.');
      ctx.go('listo', { p: project.id });
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  const cutWithScript = async () => {
    if (!cutText.trim()) { ctx.toast('Pega primero el guion que pensabas decir.'); return; }
    if (project.scenes.length && !confirm('Esto rehace las escenas del video según el guion (la versión actual queda guardada en Versiones). ¿Seguir?')) return;
    setBusy('Buscando cada frase del guion en la grabación…');
    try {
      const done = await waitJob(await op({ op: 'guion-cortar', text: cutText, take }), (j) => setBusy(j.message));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      const missing = (done.result?.corte as { missing?: string[] } | undefined)?.missing ?? [];
      ctx.toast(missing.length ? `Video cortado con tu guion. Ojo: ${missing.length} frase(s) no se encontraron en la grabación.` : 'Video cortado con tu guion: todas las frases encontradas.');
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };
  const loadFile = (f?: File) => { if (f) f.text().then((t) => setCutText(t)).catch(() => ctx.toast('No pude leer el archivo.')); };

  const total = g ? guionSeconds({ filas: g.filas.map((f) => ({ ...f, segundos: Math.max(0.8, spokenSeconds(f.voz)) })) }) : 0;
  let t = 0;

  return (
    <div className="guion" style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 16px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Guion</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          La app escribe lo que dice la voz y, fila por fila, qué se ve mientras lo dice. {montage ? 'Corrígelo y conviértelo en el video con un botón.' : 'En un video hablado es tu guion para grabar: léelo a cámara.'}
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <label className="field" style={{ gridColumn: '1 / -1' }}>¿De qué va este video? (opcional: si lo dejas vacío, la app propone la idea con tu brief)
          <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ej.: alguien llega con hambre de noche y descubre nuestros nachos" />
        </label>
        <label className="field">Estructura
          <select value={estructura} onChange={(e) => setEstructura(e.target.value)}>
            {SCRIPT_STRUCTURES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="small muted">{SCRIPT_STRUCTURES.find((s) => s.id === estructura)?.when}</span>
        </label>
        <label className="field">Duración
          <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            {[...new Set([15, 20, 30, 45, 60, 90, duracion])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} segundos (unas {Math.round(d * 2.5)} palabras)</option>)}
          </select>
        </label>
        <label className="field">Tono
          <input value={tono} onChange={(e) => setTono(e.target.value)} placeholder="Cercano, divertido, elegante, enérgico…" />
        </label>
        {aiVoice && (
          <label className="field">Voz que lo narra
            <select value={voice} onChange={(e) => setVoice(e.target.value)}>
              <option value="">La mejor disponible</option>
              {AI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        )}
        <div className="row" style={{ gridColumn: '1 / -1' }}>
          <button className="btn primary" disabled={Boolean(busy)} onClick={write}><Icon name="wand" /> {g ? 'Escribir otro guion' : 'Escribir el guion'}</button>
          {!g && loaded && <button className="btn rect" disabled={Boolean(busy)} onClick={() => { setG({ titulo: '', idea, estructura, tono, duracion, filas: [{ ...EMPTY_ROW, seccion: 'gancho' }], origen: 'manual', avisos: [] }); setDirty(true); }}><Icon name="edit" /> Escribirlo yo</button>}
          {busy && <span className="small muted" role="status">{busy}</span>}
        </div>
      </div>

      {!montage && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong className="row"><Icon name="scissors" /> Cortar el video con mi guion</strong>
          <span className="small muted">Pega (o sube) lo que pensabas decir, una frase o párrafo por línea. La app busca cada frase en tu grabación, se queda con una toma de cada una, quita lo que dijiste fuera del guion, las muletillas y los silencios, y arma las escenas en el orden del guion.</span>
          <textarea rows={7} value={cutText} onChange={(e) => setCutText(e.target.value)} placeholder={'Hoy te enseño tres trucos para editar más rápido.\nPrimero, usa atajos de teclado.\n…'} aria-label="Guion para cortar el video" />
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <label className="btn rect" style={{ cursor: 'pointer' }}><Icon name="export" /> Subir .txt
              <input type="file" accept=".txt,.md,text/plain,text/markdown" style={{ display: 'none' }} onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {g && guionVoice(g) && <button className="btn ghost" onClick={() => setCutText(g.filas.map((f) => f.voz.trim()).filter(Boolean).join('\n'))}>Usar el guion de abajo</button>}
            <label className="field" style={{ minWidth: 240 }}>Si una frase se grabó varias veces
              <select value={take} onChange={(e) => setTake(e.target.value as typeof take)}>
                <option value="ultima">Quedarme con la última toma completa</option>
                <option value="primera">Quedarme con la primera toma completa</option>
                <option value="mejor">La que dice más palabras del guion</option>
              </select>
            </label>
            <button className="btn primary" disabled={Boolean(busy) || !cutText.trim()} onClick={cutWithScript}><Icon name="scissors" /> Cortar con este guion</button>
          </div>
          {cut && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="small muted">Último corte: {cut.sourceDuration.toFixed(0)} s → {cut.outputDuration.toFixed(1)} s · se quitaron {cut.removedRetakeWords} palabras de tomas repetidas, {cut.removedOffScriptWords} fuera del guion y {cut.removedFillers} muletillas.</span>
              {cut.missing.length > 0 && (
                <div className="small" role="alert" style={{ border: '1px solid var(--warn, #E0A100)', borderRadius: 10, padding: '8px 12px' }}>
                  <strong className="row"><Icon name="warning" /> No encontré en la grabación {cut.missing.length === 1 ? 'esta frase' : 'estas frases'} del guion</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{cut.missing.map((m, i) => <li key={i}>«{m}»</li>)}</ul>
                </div>
              )}
              <table className="small" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 4 }}>Escena</th><th style={{ padding: 4 }}>Frase del guion</th><th style={{ padding: 4 }}>Toma</th></tr></thead>
                <tbody>{cut.lines.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)', opacity: l.found ? 1 : 0.7 }}>
                    <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{l.found && l.sceneId ? <a href="#" onClick={(e) => { e.preventDefault(); ctx.go('editor', { p: project.id, s: l.sceneId! }); }}>{l.sceneId}</a> : '—'}</td>
                    <td style={{ padding: 4 }}>{l.text}</td>
                    <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{!l.found ? 'No se encontró' : `${l.takes > 1 ? `${l.chosenTake} de ${l.takes}` : 'única'} · ${l.start?.toFixed(1)} s${l.coverage < 0.85 ? ` · incompleta (${Math.round(l.coverage * 100)} %)` : ''}`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {g && (
        <>
          {g.avisos.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--warn, #E0A100)' }}>
              <strong className="row"><Icon name="warning" /> Por revisar antes de usarlo</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{g.avisos.map((a, i) => <li key={i} className="small">{a}</li>)}</ul>
            </div>
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <input className="input" style={{ flex: 1, minWidth: 200, fontWeight: 700 }} value={g.titulo} onChange={(e) => edit((x) => { x.titulo = e.target.value; })} placeholder="Título del guion" aria-label="Título del guion" />
              <span className="small muted">{g.filas.length} filas · {total.toFixed(0)} s de voz{g.duracion && total > g.duracion * 1.15 ? ' (más de lo pedido)' : ''}</span>
            </div>
            <strong>Guion literario</strong>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{guionVoice(g) || <span className="muted">Aún no hay voz escrita.</span>}</p>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <datalist id="guion-planos">{SHOT_SIZES.map((x) => <option key={x} value={x} />)}</datalist>
            <datalist id="guion-movs">{SHOT_MOVES.map((x) => <option key={x} value={x} />)}</datalist>
            <strong>Guion técnico</strong>
            <span className="small muted">Cada fila es un momento: lo que se dice y lo que se ve mientras se dice.{montage && tags.length ? ' En «Toma» elige cuál de tus tomas sale ahí.' : ''}</span>
            {g.filas.map((f, i) => {
              const secs = Math.max(0.8, spokenSeconds(f.voz));
              const from = t; t += secs;
              const set = (patch: Partial<GuionRow>) => edit((x) => { Object.assign(x.filas[i], patch); });
              return (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                  <div className="row" style={{ gridColumn: '1 / -1', justifyContent: 'space-between' }}>
                    <span className="row"><strong>{i + 1}</strong>
                      <input className="input" style={{ width: 150, minHeight: 32 }} value={f.seccion} onChange={(e) => set({ seccion: e.target.value })} placeholder="Parte (gancho…)" aria-label={`Parte de la fila ${i + 1}`} />
                      <span className="small muted">{from.toFixed(1)}–{t.toFixed(1)} s</span></span>
                    <span className="row">
                      <button className="btn ghost small" title="Subir" disabled={i === 0} onClick={() => edit((x) => { [x.filas[i - 1], x.filas[i]] = [x.filas[i], x.filas[i - 1]]; })}><Icon name="prev" /></button>
                      <button className="btn ghost small" title="Bajar" disabled={i === g.filas.length - 1} onClick={() => edit((x) => { [x.filas[i + 1], x.filas[i]] = [x.filas[i], x.filas[i + 1]]; })}><Icon name="next" /></button>
                      <button className="btn ghost small" title="Quitar esta fila" onClick={() => edit((x) => { x.filas.splice(i, 1); })}><Icon name="trash" /></button>
                    </span>
                  </div>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>Voz (lo que se dice)
                    <textarea rows={2} value={f.voz} onChange={(e) => set({ voz: e.target.value })} />
                  </label>
                  <label className="field" style={{ gridColumn: 'span 2' }}>Imagen (lo que se ve)
                    <textarea rows={2} value={f.imagen} onChange={(e) => set({ imagen: e.target.value })} />
                  </label>
                  {montage && tags.length > 0 && (
                    <label className="field">Toma
                      <select value={f.toma ?? ''} onChange={(e) => set({ toma: e.target.value || undefined })}>
                        <option value="">La que toque</option>
                        {tags.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field">Texto en pantalla
                    <input value={f.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="1 a 4 palabras, o vacío" />
                  </label>
                  <label className="field">Plano
                    <input list="guion-planos" value={f.plano} onChange={(e) => set({ plano: e.target.value })} />
                  </label>
                  <label className="field">Movimiento
                    <input list="guion-movs" value={f.movimiento} onChange={(e) => set({ movimiento: e.target.value })} />
                  </label>
                  <label className="field">Entrada
                    <select value={SCRIPT_TRANSITIONS.find((x) => x === f.transicion) ?? 'corte'} onChange={(e) => set({ transicion: e.target.value })}>{SCRIPT_TRANSITIONS.map((x) => <option key={x}>{x}</option>)}</select>
                  </label>
                  <label className="field">Sonido
                    <input value={f.sonido} onChange={(e) => set({ sonido: e.target.value })} placeholder="Efecto o música" />
                  </label>
                </div>
              );
            })}
            <div className="row">
              <button className="btn rect" onClick={() => edit((x) => { x.filas.push({ ...EMPTY_ROW }); })}><Icon name="plus" /> Agregar fila</button>
            </div>
          </div>

          <div className="row" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <button className="btn rect" disabled={!dirty || Boolean(busy)} onClick={() => save().then(() => ctx.toast('Guion guardado.')).catch((e) => ctx.toast(e.message))}><Icon name="save" /> {dirty ? 'Guardar cambios' : 'Guardado'}</button>
            {montage && <button className="btn primary" disabled={Boolean(busy)} onClick={toVideo} title="Genera la voz, corta al ritmo y pone cada imagen sobre su frase"><Icon name="film" /> Crear el video con este guion</button>}
            <button className="btn rect" disabled={!guionVoice(g)} onClick={() => setPrompter(true)} title="El guion en grande, subiendo solo, para grabarte leyéndolo"><Icon name="mic" /> Teleprompter</button>
            <button className="btn rect" onClick={() => navigator.clipboard?.writeText(guionMarkdown(g)).then(() => ctx.toast('Guion copiado.')).catch(() => ctx.toast('No se pudo copiar.'))}><Icon name="copy" /> Copiar</button>
            <a className="btn rect" href={`/api/guion.md?id=${pid}`} onClick={(e) => { if (dirty) { e.preventDefault(); ctx.toast('Guarda los cambios antes de descargar.'); } }}><Icon name="export" /> Descargar</a>
          </div>
          {prompter && <Teleprompter parts={g.filas.map((f) => f.voz.trim()).filter(Boolean)} onClose={() => setPrompter(false)} />}
        </>
      )}
    </div>
  );
};
