import { ffmpeg, ffprobe } from './exec.ts';

export interface ProbeInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  rotation: number;
  hasAudio: boolean;
  /** Video HDR (HLG o PQ), típico del iPhone: hay que pasarlo a color estándar. */
  hdr: boolean;
}

export async function probe(file: string): Promise<ProbeInfo> {
  const { stdout } = await ffprobe(['-print_format', 'json', '-show_streams', '-show_format', file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  if (!v) throw new Error(`El archivo no tiene video: ${file}`);
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
  const rotation = Number(
    v.side_data_list?.find((x: any) => x.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0,
  );
  const rotated = Math.abs(rotation) % 180 === 90;
  return {
    duration: Number(j.format.duration ?? v.duration),
    width: rotated ? v.height : v.width,
    height: rotated ? v.width : v.height,
    fps: d ? n / d : n,
    rotation,
    hasAudio: j.streams.some((s: any) => s.codec_type === 'audio'),
    hdr: ['arib-std-b67', 'smpte2084'].includes(v.color_transfer),
  };
}

/**
 * Master de edición: H.264 a fps constante (los celulares graban con fps
 * variable y eso desfasa los cortes), lado corto 1080 px, rotación aplicada.
 */
export async function makeMaster(input: string, out: string, fps: number, info: ProbeInfo) {
  const scale = info.width <= info.height ? 'scale=1080:-2' : 'scale=-2:1080';
  await ffmpeg([
    '-i', input,
    // HDR → color estándar (BT.709). Sin esto los colores salen lavados.
    '-vf', `${scale},fps=${fps},${info.hdr ? 'colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:format=yuv420p' : 'format=yuv420p'}`,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.round(fps)),
    ...(info.hdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : []),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    out,
  ]);
}

/** Proxy liviano para la vista previa del studio. */
export async function makeProxy(input: string, out: string) {
  await ffmpeg([
    '-i', input,
    '-vf', 'scale=-2:854',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-g', '15',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    out,
  ]);
}

/** Audio mono 16 kHz para whisper.cpp. */
export async function extractWav16k(input: string, out: string) {
  await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out]);
}

export interface VoiceOptions { denoise: boolean; denoiseLevel?: 'suave' | 'media' | 'fuerte'; enhance?: boolean; targetLufs: number }

/**
 * Voz limpia y nivelada: filtro de graves, reducción de ruido (suave, media o
 * fuerte), realce opcional (más presencia y volumen parejo) y loudnorm en dos
 * pasadas al objetivo (por defecto -16 LUFS, lo habitual en Instagram).
 */
export async function processVoice(input: string, out: string, { denoise, denoiseLevel = 'media', enhance = false, targetLufs }: VoiceOptions) {
  const nr = { suave: 8, media: 12, fuerte: 24 }[denoiseLevel];
  const pre = [
    'highpass=f=80',
    ...(denoise ? [`afftdn=nr=${nr}:nf=-25`] : []),
    ...(enhance ? ['equalizer=f=220:t=q:w=1:g=-2', 'equalizer=f=3200:t=q:w=1:g=3', 'acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=2'] : []),
  ].join(',');
  const target = `I=${targetLufs}:TP=-1.5:LRA=11`;
  const { stderr } = await ffmpeg(['-i', input, '-vn', '-af', `${pre},loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const second = `${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await ffmpeg(['-i', input, '-vn', '-af', `${pre},loudnorm=${second}`, '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}

/**
 * Tramos de silencio (s) detectados por FFmpeg. Conviene correrlo sobre la voz
 * ya nivelada, así el umbral en dB es estable entre videos.
 */
export async function detectSilences(file: string, { noiseDb = -35, minDuration = 0.2 } = {}) {
  const { stderr } = await ffmpeg(['-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDuration}`, '-f', 'null', '-']);
  const out: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  if (start !== null) out.push({ start, end: Number.POSITIVE_INFINITY });
  return out;
}

/** Mide la sonoridad integrada (LUFS) de un archivo. */
export async function measureLufs(file: string): Promise<number> {
  const { stderr } = await ffmpeg(['-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  return Number(m.input_i);
}

/**
 * Nivela la mezcla final (voz + música) al objetivo sin recodificar el video.
 * Dos pasadas de loudnorm, igual que con la voz.
 */
export async function normalizeMix(input: string, out: string, targetLufs: number) {
  const target = `I=${targetLufs}:TP=-1.5:LRA=11`;
  const { stderr } = await ffmpeg(['-i', input, '-vn', '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const second = `${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await ffmpeg(['-i', input, '-c:v', 'copy', '-af', `loudnorm=${second}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
}

/** Duración (s) de cualquier archivo de audio o video. */
export async function mediaDuration(file: string): Promise<number> {
  const { stdout } = await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}
