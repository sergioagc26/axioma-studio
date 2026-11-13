import { describe, expect, it } from 'vitest';
import { Project, Scene, buildTimeline, emojiFor, pickEmojis, type Transcript } from '@axioma/schema';
import { teaserProject } from '../src/teaser.ts';

describe('emojis automáticos', () => {
  it('pone emoji a palabras con significado claro, sin importar tildes ni mayúsculas', () => {
    expect(emojiFor('Dinero,')).toBe('💰');
    expect(emojiFor('IDEA')).toBe('💡');
    expect(emojiFor('gimnasio')).toBe('💪');
    expect(emojiFor('éxito')).toBe('🏆');
  });

  it('no confunde palabras parecidas ni pone emoji a palabras vacías', () => {
    expect(emojiFor('marca')).toBe('💼'); // no 🏖️ por «mar»
    expect(emojiFor('solo')).toBeNull(); // no 🏖️ por «sol»
    expect(emojiFor('mesa')).toBeNull(); // no 📅 por «mes»
    expect(emojiFor('que')).toBeNull();
    expect(emojiFor('quiero')).toBeNull();
  });

  it('no satura: separa los emojis y no repite el mismo seguido', () => {
    const lines = [
      { text: 'mi dinero', startFrame: 0 },
      { text: 'más dinero', startFrame: 20 }, // muy pronto
      { text: 'otra vez dinero', startFrame: 80 }, // mismo emoji que el último
      { text: 'una idea', startFrame: 120 },
    ];
    expect(pickEmojis(lines, 48)).toEqual(['💰', null, null, '💡']);
  });
});

describe('subtítulos traducidos y variantes de gancho', () => {
  const words = (text: string, start: number) => text.split(' ').map((w, i) => ({ text: w, start: start + i * 0.3, end: start + i * 0.3 + 0.25 }));
  const t = { language: 'es', model: 'x', words: [...words('Hola a todos, bienvenidos al canal.', 0), ...words('Nadie te dice el error que te cuesta dinero.', 4)] } as Transcript;
  const project = Project.parse({
    version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '',
    format: { fps: 30 }, source: { file: 'a.mp4', duration: 10, width: 1080, height: 1920, fps: 30 },
    pacing: {}, captions: {},
    scenes: [Scene.parse({ id: 's01', ranges: [{ start: 0, end: 3 }] }), Scene.parse({ id: 's02', ranges: [{ start: 4, end: 7.5 }] })],
  });

  it('los subtítulos usan las palabras traducidas cuando las hay', () => {
    const tl = buildTimeline(project, t, { video: 'v.mp4', captionWords: [{ text: 'Nobody', start: 4, end: 4.5 }, { text: 'tells', start: 4.5, end: 5 }] });
    expect(tl.words.map((w) => w.text)).toEqual(['Nobody', 'tells']);
    expect(tl.words[0].startFrame).toBe(90); // 3 s de la escena 1 + 0 s dentro de la 2
  });

  it('el adelanto se arma sin tocar el proyecto original', () => {
    const made = teaserProject(project, t);
    expect(made?.project.scenes[0].id).toBe('adelanto');
    expect(project.scenes[0].id).toBe('s01');
  });
});

describe('emojis con subtítulos traducidos', () => {
  it('también reconoce palabras en inglés', () => {
    expect(emojiFor('money')).toBe('💰');
    expect(emojiFor('Business,')).toBe('💼');
    expect(emojiFor('the')).toBeNull();
  });
});
