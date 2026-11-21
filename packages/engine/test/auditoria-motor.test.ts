import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Project, getPreset, outputDuration } from '@axioma/schema';

// Workspace temporal, sin claves ni red.
const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-auditoria-'));
vi.stubEnv('SE_WORKSPACE', ws);
vi.stubEnv('SE_ENV_FILE', path.join(ws, '.env'));
vi.stubEnv('FREESOUND_API_KEY', '');
const E = await import('../src/index.ts');
const { sendFile } = await import('../src/server.ts');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

const base = (scenes: unknown[], extra: Record<string, unknown> = {}) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', format: { width: 1080, height: 1920, fps: 30 },
  source: { file: 'media/original.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
  pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions, scenes, ...extra,
});

describe('duración escrita a mano', () => {
  it('«2min» pegado es en minutos y «minimo 40 s» no', () => {
    expect(E.maxSeconds('2min')).toBe(120);
    expect(E.maxSeconds('minimo 40 s')).toBe(40);
  });
});

describe('acortar al máximo pedido', () => {
  it('quita primero las escenas del medio sin texto ni cifras, y nunca el gancho ni el cierre', () => {
    const sc = (id: string, a: number, extra: Record<string, unknown> = {}) => ({ id, ranges: [{ start: a, end: a + 5 }], ...extra });
    const p = base([
      sc('gancho', 0), sc('oferta', 5, { onScreenText: '$13.000' }), sc('relleno1', 10), sc('grafico', 15, { visual: 'motion' }), sc('relleno2', 20), sc('cierre', 25),
    ]);
    E.fitDuration(p, 20);
    expect(p.scenes.map((s) => s.id)).toEqual(['gancho', 'oferta', 'grafico', 'cierre']);
    expect(outputDuration(p)).toBeLessThanOrEqual(20);
  });
});

describe('volver a cortar un montaje', () => {
  it('conserva gancho, cierre, textos del medio y transiciones en el corte nuevo', () => {
    const old = base([
      { id: 'a', ranges: [{ start: 0, end: 2 }], role: 'gancho', onScreenText: 'Empieza', look: 'cine' },
      { id: 'b', ranges: [{ start: 2, end: 4 }], onScreenText: 'Medio', transition: { id: 'destello' } },
      { id: 'c', ranges: [{ start: 4, end: 6 }] },
      { id: 'd', ranges: [{ start: 6, end: 8 }], role: 'cta', onScreenText: 'Únete al reto' },
    ], { kind: 'montaje' });
    const built = base(Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, ranges: [{ start: i, end: i + 1 }] })), { kind: 'montaje' });
    const r = E.keepEdits(old, built);
    expect(r.scenes[0].onScreenText).toBe('Empieza');
    expect(r.scenes[0].role).toBe('gancho');
    expect(r.scenes[0].look).toBe('cine');
    expect(r.scenes[7].onScreenText).toBe('Únete al reto');
    expect(r.scenes[7].role).toBe('cta');
    expect(r.scenes.filter((s) => s.onScreenText === 'Medio')).toHaveLength(1);
    expect(r.scenes.some((s) => s.transition?.id === 'destello')).toBe(true);
  });
});

describe('quitar la voz en off', () => {
  it('devuelve el volumen original que había antes', async () => {
    const dir = path.join(ws, 'clientes', 'personal', 'proyectos', 'voz');
    mkdirSync(dir, { recursive: true });
    const p = base([{ id: 's', ranges: [{ start: 0, end: 2 }] }], { kind: 'montaje', id: 'voz' });
    p.audio.originalVolume = 0;
    p.audio.voiceover = { file: 'media/x.wav', text: 'hola', provider: 'sistema', duration: 2, prevOriginalVolume: 0 };
    writeFileSync(path.join(dir, 'project.json'), JSON.stringify(p));
    const after = await E.removeVoiceover(dir);
    expect(after.audio.originalVolume).toBe(0);
    expect(after.audio.voiceover).toBeUndefined();
  });
});

describe('papelera', () => {
  it('lista, recupera y borra proyectos, referencias y estilos', async () => {
    const trash = path.join(ws, 'papelera');
    mkdirSync(path.join(trash, 'personal--mi-video--2026-11-13T16-14-46'), { recursive: true });
    writeFileSync(path.join(trash, 'personal--mi-video--2026-11-13T16-14-46', 'project.json'), JSON.stringify({ id: 'mi-video', name: 'Mi video' }));
    mkdirSync(path.join(trash, 'referencia--personal--promo--2026-11-13T16-15-00-000Z'), { recursive: true });
    writeFileSync(path.join(trash, 'referencia--personal--promo--2026-11-13T16-15-00-000Z', 'report.json'), JSON.stringify({ id: 'promo', name: 'Promo' }));
    writeFileSync(path.join(trash, 'estilo--personal--ejemplo--2026-11-13T16-16-00-000Z.json'), JSON.stringify({ id: 'ejemplo', name: 'Ejemplo' }));

    const list = await E.listTrash();
    expect(list.map((x) => [x.tipo, x.titulo, x.cliente])).toEqual([['estilo', 'Ejemplo', 'personal'], ['referencia', 'Promo', 'personal'], ['proyecto', 'Mi video', 'personal']]);
    expect(list[2].fecha).toBe('2026-11-13T16:14:46.000Z');

    await E.restoreTrash('personal--mi-video--2026-11-13T16-14-46');
    expect(existsSync(path.join(ws, 'clientes', 'personal', 'proyectos', 'mi-video', 'project.json'))).toBe(true);
    await E.restoreTrash('estilo--personal--ejemplo--2026-11-13T16-16-00-000Z.json');
    expect(JSON.parse(readFileSync(path.join(ws, 'clientes', 'personal', 'presets', 'ejemplo.json'), 'utf8')).name).toBe('Ejemplo');

    await expect(E.restoreTrash('../fuera')).rejects.toThrow(/papelera/);
    expect(await E.emptyTrash('referencia--personal--promo--2026-11-13T16-15-00-000Z')).toEqual([]);
    expect(await E.emptyTrash()).toEqual([]);
  });
});

describe('archivos servidos', () => {
  it('sendFile añade las cabeceras pedidas (miniaturas con caché de un día)', async () => {
    const f = path.join(ws, 'mini.jpg');
    writeFileSync(f, 'x');
    const server = http.createServer((req, res) => { sendFile(req, res, f, { 'Cache-Control': 'max-age=86400' }); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    expect(r.headers.get('cache-control')).toBe('max-age=86400');
    await r.text();
    server.close();
  });
});
