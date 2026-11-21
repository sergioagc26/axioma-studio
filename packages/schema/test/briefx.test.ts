import { describe, expect, it } from 'vitest';
import { briefWarnings, ctaForChannel, forbiddenShotTags, pricesIn, prohibidos, resolveCta, shortWeb, voiceForBrief, AI_VOICES, BRIEF_VOICES } from '../src/index.ts';

describe('cierre según dónde se compra', () => {
  it('la web con su dominio, sin inventar uno', () => {
    expect(ctaForChannel('En la página web', 'https://www.ejemplo.com/carta')).toBe('Pide directo en ejemplo.com');
    expect(ctaForChannel('En la página web')).toBe('Pide directo en nuestra página web');
    expect(ctaForChannel('En la página web', 'la de siempre')).toBe('Pide directo en nuestra página web');
  });
  it('WhatsApp y llamada solo ponen el número si lo dieron', () => {
    expect(ctaForChannel('Por WhatsApp')).toBe('Pide por WhatsApp');
    expect(ctaForChannel('Por WhatsApp', '321 978 0565')).toBe('Pide por WhatsApp al 321 978 0565');
    expect(ctaForChannel('Por llamada', 'pronto')).toBe('Llámanos y pide');
  });
  it('el local con la dirección', () => {
    expect(ctaForChannel('En el local', 'Carrera 11 # 16-28')).toBe('Visítanos en Carrera 11 # 16-28');
  });
  it('orden: frase elegida > canal > objetivo > anuncio', () => {
    const base = { objetivo: 'Mensajes por DM', canal: 'En la página web', contacto: 'ejemplo.com' };
    expect(resolveCta({ ...base, cta: 'Pídela hoy' }, { talk: false })).toBe('Pídela hoy');
    expect(resolveCta(base, { talk: false })).toBe('Pide directo en ejemplo.com');
    expect(resolveCta({ objetivo: 'Mensajes por DM' }, { talk: false })).toBe('Escríbeme «INFO» por DM');
    expect(resolveCta({}, { talk: false, ad: true })).toBe('Escríbenos y te contamos');
    expect(resolveCta({}, { talk: false })).toBe('');
  });
  it('una frase genérica sugerida no le gana al canal (caso real de un cliente)', () => {
    expect(resolveCta({ cta: 'Sígueme para más como esto', canal: 'En la página web', contacto: 'ejemplo.com' }, { talk: false })).toBe('Pide directo en ejemplo.com');
    expect(resolveCta({ cta: 'Sígueme para más como esto' }, { talk: false })).toBe('Sígueme para más como esto');
  });
  it('«La que digo en el video»: sin texto si habla; en un montaje sigue con el canal', () => {
    const b = { cta: 'La que digo en el video', canal: 'Por mensaje directo (DM)' };
    expect(resolveCta(b, { talk: true })).toBe('');
    expect(resolveCta(b, { talk: false })).toBe('Escríbenos por DM para pedir');
  });
  it('shortWeb', () => expect(shortWeb('http://www.ejemplo.co/a?b')).toBe('ejemplo.co'));
});

describe('voz del brief', () => {
  it('cada opción apunta a una voz que existe', () => {
    for (const v of BRIEF_VOICES) if (v.voice) expect(AI_VOICES.some((a) => a.id === v.voice)).toBe(true);
  });
  it('opciones, texto libre y sin respuesta', () => {
    expect(voiceForBrief({ voz: 'Hombre de voz grave' })).toBe('grave');
    expect(voiceForBrief({ voz: 'Sin voz, solo música' })).toBeNull();
    expect(voiceForBrief({ voz: 'una voz gruesa de hombre' })).toBe('grave');
    expect(voiceForBrief({ voz: 'mujer joven' })).toBe('colombiana');
    expect(voiceForBrief({})).toBeUndefined();
    expect(voiceForBrief({ voz: 'la de siempre' })).toBeUndefined();
  });
});

describe('lo prohibido', () => {
  it('lista y etiquetas de toma', () => {
    expect(prohibidos({ prohibido: 'Personas del equipo, Niños' })).toEqual(['Personas del equipo', 'Niños']);
    expect(prohibidos({ prohibido: 'Nada en especial' })).toEqual([]);
    expect(forbiddenShotTags({ prohibido: 'Niños' })).toEqual(['personas', 'hablando']);
    expect(forbiddenShotTags({ prohibido: 'Precios' })).toEqual([]);
  });
});

describe('avisos antes de entregar', () => {
  const scenes = (...t: string[]) => t.map((onScreenText) => ({ onScreenText }));
  it('precios: lee cifras con $, puntos y «mil»', () => {
    expect(pricesIn('La Clásica a $12.000 y la Premium 28 mil')).toEqual(['12000', '28000']);
  });
  it('avisa de un precio que no está en el brief', () => {
    const w = briefWarnings({ brief: { producto: 'Clásica $12.000' }, scenes: scenes('Clásica $12.000', 'Mazorcada $15.000') });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('15.000');
  });
  it('no avisa si los precios cuadran', () => {
    expect(briefWarnings({ brief: { producto: 'Clásica $12.000' }, scenes: scenes('A doce mil: $12.000') })).toEqual([]);
  });
  it('precios prohibidos', () => {
    expect(briefWarnings({ brief: { prohibido: 'Precios' }, scenes: scenes('Solo $9.900') })[0]).toMatch(/no salgan precios/);
  });
  it('canal: WhatsApp en el video cuando el cliente pide por la web (caso real de un cliente)', () => {
    const w = briefWarnings({ brief: { canal: 'En la página web' }, scenes: scenes('Pide por WhatsApp'), audio: { voiceover: { text: 'escríbenos al WhatsApp' } } });
    expect(w[0]).toMatch(/otro canal/);
  });
  it('voz en off cuando se pidió sin voz', () => {
    expect(briefWarnings({ brief: { voz: 'Sin voz, solo música' }, scenes: [], audio: { voiceover: { text: 'hola' } } })).toEqual(['Pediste «sin voz» y el video tiene voz en off.']);
  });
});
