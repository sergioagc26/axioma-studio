/**
 * Zonas seguras por red social: dónde NO deben ir subtítulos, rótulos, palabras, logos ni
 * ningún objeto del video, porque la propia app de la red los tapa (nombre de la cuenta, descripción,
 * música, botones de me gusta / comentar / compartir, barra de respuesta, título del Short…).
 *
 * Los márgenes son fracciones del alto y del ancho del cuadro (0–1) medidos sobre un video
 * vertical de 1080×1920. Son valores prudentes basados en las guías públicas de cada red y en las
 * que usan los editores; las redes cambian su interfaz, así que se ajustan aquí, en un solo sitio.
 */
export const PLATFORM_IDS = ['instagram_reels', 'instagram_stories', 'tiktok', 'youtube_shorts', 'facebook_reels', 'whatsapp_estado', 'ninguna'] as const;
export type Platform = (typeof PLATFORM_IDS)[number];

export type SafeZone = {
  /** Franja de arriba que la red tapa (fracción del alto). */
  top: number;
  /** Franja de abajo que la red tapa (descripción, cuenta, música, barra de respuesta). */
  bottom: number;
  /** Margen izquierdo libre. */
  left: number;
  /** Margen derecho libre (en Reels, TikTok y Shorts aquí van los botones). */
  right: number;
};

export type PlatformInfo = SafeZone & { label: string; note: string };

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  instagram_reels: { label: 'Instagram Reels', top: 0.14, bottom: 0.27, left: 0.06, right: 0.13, note: 'Arriba: la barra de Reels y la cuenta. Abajo: nombre, descripción y música. A la derecha: me gusta, comentar, compartir.' },
  instagram_stories: { label: 'Instagram Historias', top: 0.13, bottom: 0.13, left: 0.06, right: 0.06, note: 'Arriba: barra de progreso y cuenta. Abajo: la barra «Enviar mensaje».' },
  tiktok: { label: 'TikTok', top: 0.1, bottom: 0.3, left: 0.06, right: 0.15, note: 'Abajo: cuenta, descripción y música (la franja más grande). A la derecha: la columna de botones.' },
  youtube_shorts: { label: 'YouTube Shorts', top: 0.1, bottom: 0.27, left: 0.06, right: 0.14, note: 'Abajo: canal, título y suscribirse. A la derecha: botones.' },
  facebook_reels: { label: 'Facebook Reels', top: 0.12, bottom: 0.26, left: 0.06, right: 0.13, note: 'Parecido a Instagram Reels: descripción abajo y botones a la derecha.' },
  whatsapp_estado: { label: 'Estado de WhatsApp', top: 0.1, bottom: 0.12, left: 0.05, right: 0.05, note: 'Arriba: la cuenta. Abajo: la barra de respuesta.' },
  ninguna: { label: 'Sin red (solo márgenes mínimos)', top: 0.04, bottom: 0.04, left: 0.04, right: 0.04, note: 'Para video que no se publica en una red vertical.' },
};

export const DEFAULT_PLATFORM: Platform = 'instagram_reels';

export function safeZone(platform: Platform | undefined): SafeZone {
  const p = PLATFORMS[platform ?? DEFAULT_PLATFORM] ?? PLATFORMS[DEFAULT_PLATFORM];
  return { top: p.top, bottom: p.bottom, left: p.left, right: p.right };
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** Centro vertical permitido para un objeto de alto `half`×2 (fracción del alto). */
export function clampY(zone: SafeZone, y: number, half = 0.05): number {
  return clamp(y, zone.top + half, 1 - zone.bottom - half);
}

/** Centro horizontal permitido para un objeto de ancho `half`×2 (fracción del ancho). */
export function clampX(zone: SafeZone, x: number, half = 0.1): number {
  return clamp(x, zone.left + half, 1 - zone.right - half);
}

/** Ancho útil del texto centrado: el mismo margen a los dos lados (el mayor de los dos). */
export function sidePad(zone: SafeZone): number {
  return Math.max(zone.left, zone.right);
}

/** ¿Cae el centro (x,y) de un objeto fuera de la zona segura? */
export function isOutside(zone: SafeZone, x: number, y: number, halfX = 0.1, halfY = 0.05): boolean {
  return y < zone.top + halfY - 1e-6 || y > 1 - zone.bottom - halfY + 1e-6 || x < zone.left + halfX - 1e-6 || x > 1 - zone.right - halfX + 1e-6;
}

type AuditProject = {
  platform?: Platform;
  captions: { y: number };
  scenes: { id: string; textY?: number; textX?: number; textPosition?: string; onScreenText?: string; words?: { text: string; x: number; y: number }[] }[];
};

/** Lo que la zona segura de la red mueve al renderizar: subtítulos, rótulos y palabras fuera de lugar. */
export function auditZones(p: AuditProject): string[] {
  const z = safeZone(p.platform);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const out: string[] = [];
  const cy = clampY(z, p.captions.y, 0.07);
  if (Math.abs(cy - p.captions.y) > 0.001) out.push(`Subtítulos: de ${pct(p.captions.y)} a ${pct(cy)} del alto`);
  p.scenes.forEach((s, i) => {
    if (s.onScreenText) {
      const y = s.textY ?? (s.textPosition === 'centro' ? 0.45 : 0.2);
      const ny = clampY(z, y, 0.07);
      if (Math.abs(ny - y) > 0.001) out.push(`Rótulo de la escena ${i + 1}: de ${pct(y)} a ${pct(ny)} del alto`);
    }
    s.words?.forEach((w) => {
      const ny = clampY(z, w.y, 0.06), nx = clampX(z, w.x, 0.12);
      if (Math.abs(ny - w.y) > 0.001 || Math.abs(nx - w.x) > 0.001) out.push(`Palabra «${w.text}» (escena ${i + 1}): se mueve dentro de la zona libre`);
    });
  });
  return out;
}
