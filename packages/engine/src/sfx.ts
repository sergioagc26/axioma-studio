import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { REPO_ROOT } from './paths.ts';

/**
 * Efectos de sonido incluidos. Se sintetizan con FFmpeg (no son grabaciones de
 * nadie), así que no tienen problema de licencia.
 */
export const SFX: Record<string, { name: string; description: string; filter: string }> = {
  whoosh: { name: 'Barrido', description: 'Soplo rápido para transiciones.', filter: "anoisesrc=d=0.45:c=pink:a=0.8,highpass=f=500,lowpass=f=7000,afade=t=in:d=0.2:curve=qsin,afade=t=out:st=0.2:d=0.25" },
  pop: { name: 'Pop', description: 'Golpecito corto para cuando entra un texto.', filter: "aevalsrc='0.8*sin(2*PI*(900-3500*t)*t)*exp(-28*t)':d=0.14" },
  clic: { name: 'Clic', description: 'Clic seco para cortes o botones.', filter: "aevalsrc='0.9*(random(0)*2-1)*exp(-350*t)':d=0.04,highpass=f=1500" },
  ding: { name: 'Campanita', description: 'Tono brillante para un dato o un logro.', filter: "aevalsrc='0.45*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-5*t)':d=1" },
  impacto: { name: 'Impacto', description: 'Golpe grave para un momento fuerte o un destello.', filter: "aevalsrc='0.9*sin(2*PI*(95-55*t)*t)*exp(-6*t)+0.25*(random(0)*2-1)*exp(-45*t)':d=0.8" },
  subida: { name: 'Subida', description: 'Tono que sube para crear expectativa antes de un cambio.', filter: "aevalsrc='0.35*sin(2*PI*(220+900*t*t)*t)*min(1\\,t/0.25)':d=1.1,afade=t=out:st=0.95:d=0.15" },
  'barrido-largo': { name: 'Barrido largo', description: 'Soplo lento para transiciones suaves.', filter: "anoisesrc=d=0.9:c=pink:a=0.8,highpass=f=300,lowpass=f=6000,afade=t=in:d=0.5:curve=qsin,afade=t=out:st=0.5:d=0.4" },
  'barrido-grave': { name: 'Barrido grave', description: 'Soplo profundo para cambios con peso.', filter: "anoisesrc=d=0.6:c=brown:a=1,lowpass=f=900,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.3,volume=2" },
  'barrido-agudo': { name: 'Barrido corto', description: 'Soplo muy rápido para cortes veloces.', filter: "anoisesrc=d=0.3:c=white:a=0.6,highpass=f=3000,afade=t=in:d=0.12,afade=t=out:st=0.12:d=0.18" },
  caida: { name: 'Caída', description: 'Tono que baja, para un error o una mala noticia.', filter: "aevalsrc='0.4*sin(2*PI*(1200-1000*t)*t)*exp(-2*t)':d=0.55" },
  bajon: { name: 'Bajón grave', description: 'Golpe de sub-bajo para un momento dramático.', filter: "aevalsrc='0.9*sin(2*PI*(140-60*t)*t)*exp(-2.5*t)':d=1.1" },
  bombo: { name: 'Bombo', description: 'Golpe seco de bombo para marcar el ritmo.', filter: "aevalsrc='0.95*sin(2*PI*(160-200*t)*t)*exp(-14*t)':d=0.35" },
  tambor: { name: 'Tambor profundo', description: 'Golpe largo y grave, de tráiler.', filter: "aevalsrc='0.9*sin(2*PI*70*t)*exp(-3*t)+0.3*(random(0)*2-1)*exp(-20*t)':d=1.2" },
  bip: { name: 'Bip', description: 'Pitido corto para censurar o marcar un dato.', filter: "aevalsrc='0.4*sin(2*PI*1000*t)':d=0.12,afade=t=out:st=0.09:d=0.03" },
  notificacion: { name: 'Notificación', description: 'Dos tonos, como un mensaje que llega.', filter: "aevalsrc='0.4*sin(2*PI*(880+440*gt(t\\,0.14))*t)*exp(-9*mod(t\\,0.14))':d=0.5" },
  exito: { name: 'Éxito', description: 'Notas que suben: logro conseguido.', filter: "aevalsrc='0.4*sin(2*PI*(660+220*floor(t/0.12))*t)*exp(-7*mod(t\\,0.12))':d=0.6" },
  error: { name: 'Error', description: 'Zumbido doble de respuesta incorrecta.', filter: "aevalsrc='0.35*sgn(sin(2*PI*150*t))*lt(mod(t\\,0.22)\\,0.16)':d=0.44,lowpass=f=1800" },
  caja: { name: 'Caja registradora', description: 'Dos campanitas: venta o dinero.', filter: "aevalsrc='0.4*(sin(2*PI*2100*t)*exp(-9*t)+gt(t\\,0.12)*sin(2*PI*2800*t)*exp(-7*(t-0.12)))':d=0.9" },
  moneda: { name: 'Moneda', description: 'Tintineo de moneda de videojuego.', filter: "aevalsrc='0.4*sin(2*PI*(988+330*gt(t\\,0.08))*t)*exp(-6*max(0\\,t-0.08))':d=0.6" },
  latido: { name: 'Latido', description: 'Doble golpe de corazón para crear tensión.', filter: "aevalsrc='0.9*sin(2*PI*60*t)*(exp(-22*t)+gt(t\\,0.22)*exp(-22*(t-0.22)))':d=0.7" },
  tic: { name: 'Tic', description: 'Tic de reloj para cuentas atrás.', filter: "aevalsrc='0.7*sin(2*PI*2400*t)*exp(-180*t)':d=0.05" },
  camara: { name: 'Cámara', description: 'Obturador de cámara de fotos.', filter: "aevalsrc='0.8*(random(0)*2-1)*(exp(-90*t)+gt(t\\,0.09)*exp(-70*(t-0.09)))':d=0.25,highpass=f=900" },
  burbuja: { name: 'Burbuja', description: 'Blop simpático para textos divertidos.', filter: "aevalsrc='0.6*sin(2*PI*(300+2600*t)*t)*exp(-14*t)':d=0.22" },
  laser: { name: 'Láser', description: 'Disparo de láser, para tecnología o humor.', filter: "aevalsrc='0.5*sin(2*PI*(2400-4000*t)*t)*exp(-9*t)':d=0.28" },
  chispa: { name: 'Chispa', description: 'Destello brillante de notas agudas.', filter: "aevalsrc='0.3*sin(2*PI*(2000+1500*floor(t/0.06))*t)*exp(-25*mod(t\\,0.06))':d=0.42" },
  glitch: { name: 'Glitch', description: 'Interferencia digital entrecortada.', filter: "aevalsrc='0.5*(random(0)*2-1)*lt(mod(t\\,0.06)\\,0.03)':d=0.3,highpass=f=1200" },
  teclado: { name: 'Teclado', description: 'Tecleo rápido para textos que se escriben.', filter: "aevalsrc='0.8*(random(0)*2-1)*exp(-300*mod(t\\,0.09))':d=0.54,highpass=f=1200" },
  gong: { name: 'Gong', description: 'Campana grave y larga para un anuncio.', filter: "aevalsrc='0.5*(sin(2*PI*196*t)+0.6*sin(2*PI*392.5*t)+0.3*sin(2*PI*590*t))*exp(-1.6*t)':d=2.2" },
  'subida-ruido': { name: 'Subida de aire', description: 'Ruido que crece antes de un cambio fuerte.', filter: "anoisesrc=d=1.4:c=white:a=0.5,highpass=f=800,afade=t=in:d=1.3:curve=exp" },
  rebobinar: { name: 'Rebobinar', description: 'Tono tembloroso que sube, para volver atrás.', filter: "aevalsrc='0.35*sin(2*PI*(400+1400*t)*t)*sin(2*PI*28*t)':d=0.5" },
};

/** Efectos que usan los automáticos: varios barridos, golpes y pops para que no suene siempre igual. */
export const AUTO_SFX = ['whoosh', 'barrido-agudo', 'barrido-grave', 'pop', 'burbuja', 'clic', 'impacto', 'bombo'];

const cacheDir = path.join(REPO_ROOT, '.sfx');

/** Genera (una sola vez) el archivo de un efecto incluido y devuelve su ruta. */
export async function sfxFile(id: string): Promise<string> {
  const def = SFX[id];
  if (!def) throw new Error(`No existe el efecto "${id}". Disponibles: ${Object.keys(SFX).join(', ')}.`);
  const out = path.join(cacheDir, `${id}.wav`);
  if (!existsSync(out)) {
    await mkdir(cacheDir, { recursive: true });
    await ffmpeg(['-f', 'lavfi', '-i', def.filter, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out]);
  }
  return out;
}

/** Deja en el proyecto (media/sfx) los efectos indicados, para que el render los encuentre. */
export async function ensureProjectSfx(dir: string, ids: string[]) {
  await mkdir(path.join(dir, 'media', 'sfx'), { recursive: true });
  for (const id of new Set(ids)) {
    const dest = path.join(dir, 'media', 'sfx', `${id}.wav`);
    if (!existsSync(dest)) await copyFile(await sfxFile(id), dest);
  }
}

export function formatSfx(): string {
  return Object.entries(SFX).map(([id, d]) => `${id} · ${d.name}: ${d.description}`).join('\n');
}
