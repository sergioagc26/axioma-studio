import { APP_NAME } from '@axioma/schema';

/**
 * Página que ve el cliente: el video, los comentarios en su segundo y el botón de aprobar.
 * Autocontenida (sin la app del editor) y solo habla con /api/r/<clave>.
 */
export function reviewPageHtml(token: string): string {
  const t = JSON.stringify(token);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisión · ${APP_NAME}</title>
<style>
:root{--bg:#0A0A0B;--panel:#141416;--line:#2A2A30;--text:#F4F4F5;--muted:#A1A1AA;--pink:#FE2C55;--cyan:#25F4EE;--ok:#22C55E}
@media (prefers-color-scheme: light){:root{--bg:#F4F4F6;--panel:#fff;--line:#DFDFE6;--text:#141416;--muted:#55555E;--pink:#D91E45;--ok:#15803D}}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:1060px;margin:0 auto;padding:20px 16px;display:grid;grid-template-columns:minmax(0,380px) 1fr;gap:24px;align-items:start}
@media (max-width:820px){main{grid-template-columns:1fr}}
h1{font-size:22px;margin:0 0 4px}.muted{color:var(--muted)}.small{font-size:13px}
video{width:100%;aspect-ratio:9/16;background:#000;border-radius:14px;display:block}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
textarea,input{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
textarea{min-height:84px;resize:vertical}
button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 18px;cursor:pointer}
.primary{background:var(--pink);color:#fff}.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.ok{background:var(--ok);color:#fff}
button:disabled{opacity:.5;cursor:default}
:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.stamp{font-variant-numeric:tabular-nums;font-weight:700;color:var(--pink);background:none;padding:0;border-radius:4px}
ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
li{border:1px solid var(--line);border-radius:12px;padding:10px 12px}
li.done{opacity:.6}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(37,244,238,.14);color:var(--text)}
.badge.ap{background:var(--ok);color:#fff}
.empty{aspect-ratio:9/16;display:grid;place-items:center;text-align:center;padding:24px}
</style></head>
<body><main>
<section>
  <video id="v" controls playsinline preload="metadata" hidden></video>
  <div id="none" class="card empty" hidden><div><strong>Todavía no hay una versión para revisar</strong><p class="small muted">Cuando el editor exporte el reel, aparecerá aquí. Esta página se actualiza sola.</p></div></div>
  <p class="small muted" id="note"></p>
</section>
<section style="display:flex;flex-direction:column;gap:16px">
  <div><h1 id="name">Cargando…</h1><span class="small muted" id="client"></span> <span class="badge" id="state"></span></div>
  <div class="card" style="display:flex;flex-direction:column;gap:10px">
    <label class="small muted" for="who">Tu nombre</label>
    <input id="who" autocomplete="name" placeholder="Para que sepamos quién comenta">
    <label class="small muted" for="txt">Comentario en <button type="button" class="stamp" id="at" title="Ir a ese momento">0:00</button> <span class="muted">(pausa el video donde quieras comentar)</span></label>
    <textarea id="txt" placeholder="Ej.: cambia este texto, este corte va muy rápido, falta el logo…"></textarea>
    <div class="row"><button class="primary" id="send">Enviar comentario</button><span class="small muted" id="msg" role="status"></span></div>
  </div>
  <div class="card" style="display:flex;flex-direction:column;gap:10px">
    <strong>Comentarios</strong>
    <ul id="list"><li class="muted small">Todavía no hay comentarios.</li></ul>
  </div>
  <div class="row"><button class="ok" id="approve">Aprobar el video</button><span class="small muted">Avisa que está listo para publicar.</span></div>
</section>
</main>
<script>
const T=${t};const api='/api/r/'+encodeURIComponent(T);
const $=(id)=>document.getElementById(id);
const v=$('v');let src=false;
const mmss=(s)=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
try{$('who').value=localStorage.getItem('axioma-revisor')||''}catch(e){}
v.addEventListener('timeupdate',()=>{$('at').textContent=mmss(v.currentTime)});
$('at').onclick=()=>v.focus();
function esc(s){return String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function load(){
  const r=await fetch(api);if(!r.ok){$('name').textContent='Este enlace ya no funciona';return}
  const d=await r.json();
  $('name').textContent=d.name;$('client').textContent=d.client;
  $('state').textContent=d.approval==='aprobado'?'Aprobado':d.approval==='en_revision'?'En revisión':'Borrador';
  $('state').className='badge'+(d.approval==='aprobado'?' ap':'');
  $('note').textContent=d.exported?'Última versión exportada.':'';
  if(d.exported&&!src){v.src=api+'/video';src=true}
  v.hidden=!d.exported;$('none').hidden=d.exported;
  const c=d.comments;
  $('list').innerHTML=c.length?c.map((x)=>'<li class="'+(x.status!=='pendiente'?'done':'')+'"><div class="row" style="justify-content:space-between"><strong>'+esc(x.author)+'</strong>'+(x.time!=null?'<button class="stamp" data-t="'+x.time+'">'+mmss(x.time)+'</button>':'')+'</div><div>'+esc(x.text)+'</div>'+(x.status==='hecha'&&x.text!=='✓ Aprobado'?'<span class="small muted">Hecho</span>':'')+'</li>').join(''):'<li class="muted small">Todavía no hay comentarios.</li>';
  document.querySelectorAll('#list .stamp').forEach((b)=>b.onclick=()=>{v.currentTime=Number(b.dataset.t);v.play()});
}
$('send').onclick=async()=>{
  const text=$('txt').value.trim();if(!text){$('msg').textContent='Escribe el comentario.';return}
  const name=$('who').value.trim()||'Cliente';try{localStorage.setItem('axioma-revisor',name)}catch(e){}
  $('send').disabled=true;
  const r=await fetch(api+'/comentario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,text,time:v.currentTime})});
  $('send').disabled=false;
  if(r.ok){$('txt').value='';$('msg').textContent='Enviado ✓';load()}else{$('msg').textContent='No se pudo enviar. Intenta de nuevo.'}
};
$('approve').onclick=async()=>{
  if(!confirm('¿Aprobar este video para publicar?'))return;
  const name=$('who').value.trim()||'Cliente';
  const r=await fetch(api+'/aprobar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  if(r.ok){$('msg').textContent='¡Aprobado! Gracias.';load()}
};
load();setInterval(load,15000);
</script></body></html>`;
}
