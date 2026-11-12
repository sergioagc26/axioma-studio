import type { Project, Transcript } from './project.ts';
import { shortPhrases, speechOf } from './suggest.ts';

const STOP = new Set('a al algo ante como con cual cuando de del desde donde el ella ellos en entre era es esa ese eso esta este esto hay la las le les lo los mas me mi mis muy ni no nos o para pero por que se si sin sobre su sus te ti tu tus un una uno unos y ya yo porque cuando entonces tambien mismo cada todo todos todas hacer tiene tengo tenia voy vamos puede pueden quiero quieres nada algo otra otro aqui ahora bien solo estan estaba habia gracias video'.split(' '));
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');

/** Hashtags de partida por sector de la marca. */
const SECTOR_TAGS: Record<string, string[]> = {
  gimnasio: ['fitness', 'gym', 'entrenamiento'], 'comida-rapida': ['comida', 'foodie', 'hamburguesas'], restaurante: ['restaurante', 'foodie', 'gastronomia'],
  moda: ['moda', 'estilo', 'outfit'], tecnologia: ['tecnologia', 'ia', 'productividad'], educacion: ['aprende', 'tips', 'educacion'],
  salud: ['salud', 'bienestar', 'habitos'], negocios: ['emprendimiento', 'negocios', 'marketing'], inmobiliaria: ['inmobiliaria', 'hogar', 'bienesraices'],
  entretenimiento: ['entretenimiento', 'planes', 'eventos'], servicios: ['servicios', 'consejos', 'profesional'],
};

export interface PublishPack { title: string; description: string; hashtags: string[] }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Texto para publicar el reel, sacado de lo que se dice: título (el gancho), una
 * descripción corta con las ideas principales y el llamado a la acción, y hashtags
 * con las palabras que más se repiten y el sector de la marca. Todo local, sin IA externa.
 */
export function publishPack(p: Project, transcript: Transcript | null, sector?: string | null): PublishPack {
  const first = p.scenes[0];
  const hook = first?.onScreenText || shortPhrases(first ? speechOf(first, transcript) : '')[0] || p.name;
  const title = cap(hook.replace(/[.,;:]+$/, '')).slice(0, 70);

  // Una idea por cada tercio del reel, sin repetir el gancho.
  const ideas: string[] = [];
  const n = p.scenes.length;
  for (const i of [Math.floor(n / 3), Math.floor((2 * n) / 3)]) {
    const s = p.scenes[i];
    const idea = s && (s.onScreenText || shortPhrases(speechOf(s, transcript))[0]);
    if (idea && idea !== hook && !ideas.includes(idea)) ideas.push(cap(idea.replace(/[.,;:]+$/, '')));
  }
  const cta = (p.brief.cta && !/digo en el video/i.test(p.brief.cta) ? p.brief.cta : '') || p.scenes[n - 1]?.onScreenText || '';
  const description = [`${title}.`, ...ideas.map((x) => `${x}.`), cta ? `\n${cap(cta)}` : ''].join(' ').replace(/\s+\n/, '\n').trim();

  // Palabras con significado que más se repiten.
  const count = new Map<string, number>();
  for (const w of transcript?.words ?? []) {
    const k = norm(w.text);
    if (k.length >= 5 && !STOP.has(k) && !/^\d+$/.test(k)) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const top = [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  const tags = [...new Set([...top, ...(SECTOR_TAGS[sector ?? ''] ?? []), 'reels'])].slice(0, 9).map((t) => `#${t}`);
  return { title, description, hashtags: tags };
}

export const publishText = (x: PublishPack) => `${x.title}\n\n${x.description}\n\n${x.hashtags.join(' ')}\n`;
