import { describe, expect, it } from 'vitest';
import { pickPixabay } from '../src/pexels.ts';

const hit = (id: number, w: number, h: number) => ({
  id, pageURL: `https://pixabay.com/videos/x-${id}/`, duration: 12, user: 'autor',
  videos: {
    large: { url: `https://cdn/${id}-l.mp4`, width: w * 2, height: h * 2, thumbnail: `https://cdn/${id}-l.jpg` },
    medium: { url: `https://cdn/${id}-m.mp4`, width: w, height: h, thumbnail: `https://cdn/${id}-m.jpg` },
    small: { url: '', width: 0, height: 0 },
  },
});

describe('videos de stock de Pixabay', () => {
  it('pone primero los verticales y elige la versión cercana a 1080 px', () => {
    const r = pickPixabay([hit(1, 1920, 1080), hit(2, 1080, 1920), hit(3, 1280, 720)], 2);
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe(2);
    expect(r[0].download).toBe('https://cdn/2-m.mp4');
    expect(r[1].download).toBe('https://cdn/1-m.mp4');
    expect(r[0]).toMatchObject({ source: 'Pixabay', author: 'autor', image: 'https://cdn/2-m.jpg' });
    expect(r[0].license).toMatch(/Pixabay/);
  });
  it('descarta resultados sin archivos de video', () => {
    expect(pickPixabay([{ id: 9, videos: {} }], 3)).toEqual([]);
  });
});
