import { describe, expect, it } from 'vitest';
import { Project, Scene } from '@axioma/schema';
import { publicReview, sceneAt } from '../src/review.ts';

const p = Project.parse({
  version: 1, id: 'p', name: 'Mi reel', client: 'Marca', createdAt: '', updatedAt: '', format: {},
  source: { file: 'a.mp4', duration: 20, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {},
  scenes: [Scene.parse({ id: 's01', ranges: [{ start: 0, end: 3 }] }), Scene.parse({ id: 's02', ranges: [{ start: 5, end: 9 }] })],
  requests: [
    { id: 'a', at: '2026-11-12T00:00:00Z', text: 'Cambia el texto', status: 'pendiente', author: 'Ana', time: 4 },
    { id: 'b', at: '2026-11-12T00:00:00Z', text: 'pedido interno a la IA', status: 'pendiente' },
  ],
});

describe('revisión del cliente', () => {
  it('ubica el comentario en la escena que se ve en ese segundo', () => {
    expect(sceneAt(p, 1)).toBe('s01');
    expect(sceneAt(p, 4)).toBe('s02'); // 3 s de la escena 1 + 1 s de la 2
    expect(sceneAt(p, 99)).toBe('s02');
  });

  it('el cliente solo ve comentarios de revisión, no pedidos internos ni rutas', () => {
    const r = publicReview(p, true);
    expect(r.comments.map((c) => c.id)).toEqual(['a']);
    expect(JSON.stringify(r)).not.toMatch(/\/Volumes|workspace|source/);
    expect(r.name).toBe('Mi reel');
  });
});
