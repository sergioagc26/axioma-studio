import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { BrandKit, Project, Scene, brandStyle, buildTimeline, getPreset, motionGallery, motionIdeas } from '@snz/schema';

const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-brand-'));
vi.stubEnv('SE_WORKSPACE', ws);
const { saveKit, readKit, learnFromExport, kitCaptions } = await import('../src/kit.ts');
afterAll(() => rmSync(ws, { recursive: true, force: true }));

const kit = (extra = {}) => BrandKit.parse({ id: 'x', name: 'X', colors: { primary: '#FF0000', secondary: '#00FF00', text: '#FFFFFF' }, fonts: { heading: 'Montserrat', body: 'Inter' }, ...extra });
const scene = (extra = {}) => Scene.parse({ id: 's2', ranges: [{ start: 0, end: 4 }], ...extra });

describe('estilo según la marca', () => {
  it('sin sector no hay estilo de marca', () => {
    expect(brandStyle(null)).toBeNull();
    expect(brandStyle(kit())).toBeNull();
  });

  it('un gimnasio y una marca de comida rápida no se ven igual', () => {
    const gym = brandStyle(kit({ sector: 'gimnasio' }))!;
    const food = brandStyle(kit({ sector: 'comida-rapida' }))!;
    expect(gym.captions.design).toBe('impacto');
    expect(food.captions.design).toBe('cinta');
    expect(gym.style.textStyle).not.toBe(food.style.textStyle);
    expect(gym.style.look).toBe('contraste');
    expect(food.style.look).toBe('calido');
    // Los colores son los de la marca.
    expect(gym.captions.highlightColor).toBe('#FF0000');
    expect(gym.why.length).toBeGreaterThan(10);
  });

  it('la personalidad matiza el sector', () => {
    const base = brandStyle(kit({ sector: 'gimnasio' }))!;
    const fino = brandStyle(kit({ sector: 'gimnasio', personality: 'elegante' }))!;
    expect(base.style.flashes).toBe(true);
    expect(fino.style.flashes).toBe(false);
    expect(fino.captions.design).toBe('elegante');
    expect(brandStyle(kit({ sector: 'salud', personality: 'rebelde' }))!.style.textStyle).toBe('glitch');
  });

  it('la marca aprende del diseño con el que más se exporta', async () => {
    await saveKit('acme', { sector: 'negocios', primary: '#FACC15' });
    expect(kitCaptions(await readKit('acme')).design).toBe('impacto');
    for (let i = 0; i < 3; i++) await learnFromExport('acme', 'bloque', 'trazo');
    const learned = brandStyle(await readKit('acme'))!;
    expect(learned.captions.design).toBe('bloque');
    expect(learned.style.textStyle).toBe('trazo');
    expect(learned.why).toContain('3 veces');
  });
});

describe('motion graphics hechos con lo que se dice', () => {
  const ids = (speech: string, extra = {}) => motionIdeas(speech, scene(extra), false).map((m) => m.motionTemplate ?? m.visual);

  it('detecta pregunta, porcentaje, número, contraste y pasos', () => {
    expect(ids('¿Editas tus reels a mano? Pierdes tiempo.')).toContain('pregunta');
    expect(ids('El 80 por ciento de los clientes no vuelve.')).toContain('porcentaje');
    expect(ids('Ahorras 10 horas cada semana.')).toContain('contador');
    expect(ids('Antes perdía horas editando, ahora lo hago en minutos.')).toContain('comparacion');
    expect(ids('Primero grabas el video, luego lo subes, después revisas.')).toEqual(expect.arrayContaining(['pasos', 'checklist']));
    expect(ids('Hola a todos.')).toEqual(expect.arrayContaining(['palabras', 'cita', 'texto']));
    expect(ids('Escríbeme hoy.', { role: 'cta' })[0]).toBe('logo');
  });

  it('los datos salen de lo dicho, nunca inventados', () => {
    const m = motionIdeas('El 80 por ciento de los clientes no vuelve, pero con esto regresan.', scene(), false);
    expect(m.find((x) => x.motionTemplate === 'porcentaje')!.motionData).toMatchObject({ valor: 80 });
    const said = 'Antes perdía horas editando, ahora lo hago en minutos.';
    const c = motionIdeas(said, scene(), false).find((x) => x.motionTemplate === 'comparacion')!.motionData as { izquierda: string; derecha: string };
    expect(said).toContain(c.izquierda);
    expect(said).toContain(c.derecha);
  });

  it('la galería numera las ideas y las palabras llegan al gráfico con su tiempo', () => {
    const words = 'Esto te ahorra horas'.split(' ').map((w, i) => ({ text: w, start: 1 + i * 0.5, end: 1.4 + i * 0.5 }));
    const p = Project.parse({
      version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
      source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
      pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
      scenes: [{ id: 's1', ranges: [{ start: 10, end: 12 }] }, { id: 's2', ranges: [{ start: 1, end: 3 }], visual: 'motion', motionTemplate: 'palabras' }],
    });
    const tr = { language: 'es', model: 'x', words };
    expect(motionGallery(p, p.scenes[1], tr).map((v) => v.id)[0]).toBe('m1');
    const clip = buildTimeline(p, tr, { video: 'v' }).clips[1];
    expect(clip.motion?.words?.map((w) => w.text)).toEqual(['Esto', 'te', 'ahorra', 'horas']);
    expect(clip.motion?.words?.[0].startFrame).toBe(0); // medido desde el inicio de la escena
  });
});
