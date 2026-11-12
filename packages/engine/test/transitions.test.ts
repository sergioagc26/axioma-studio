import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TRANSITIONS, Project, buildTimeline, ease, getPreset, layerStyle, recommendTransitions } from '@snz/schema';

const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-tr-'));
vi.stubEnv('SE_WORKSPACE', ws);
const { allTransitions, saveTransition } = await import('../src/transitions.ts');
const { AssistantError, askClaude } = await import('../src/assistant.ts');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

const project = (preset: string, scenes: object[], extra = {}) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
  source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
  pacing: getPreset(preset).pacing, captions: getPreset(preset).captions, scenes, ...extra,
});
const sc = (id: string, start: number, extra = {}) => ({ id, ranges: [{ start, end: start + 2 }], ...extra });

describe('recomendación de transiciones', () => {
  const scenes = [sc('s1', 0, { role: 'gancho' }), sc('s2', 3), sc('s3', 6), sc('s4', 9), sc('s5', 12, { visual: 'motion', motionTemplate: 'barras' }), sc('s6', 15, { role: 'cta' })];

  it('rápido: casi todo corte seco, destello al cierre, sin transición en el gancho', () => {
    const a = recommendTransitions(project('rapido', scenes));
    expect(a[0].transition).toBeNull();
    expect(a.at(-1)!.transition).toBe('destello');
    expect(a.filter((x) => x.transition === null).length).toBeGreaterThanOrEqual(3);
    expect(a.find((x) => x.sceneId === 's5')!.transition).toBe('deslizar-arriba'); // entra un gráfico
    expect(a.every((x) => x.reason.length > 10)).toBe(true);
  });

  it('sobrio: fundidos', () => {
    const a = recommendTransitions(project('sobrio', scenes));
    expect(a.slice(1).every((x) => ['fundido', 'desenfoque'].includes(x.transition!))).toBe(true);
  });

  it('todas las recomendadas existen', () => {
    const ids = new Set(BUILTIN_TRANSITIONS.map((t) => t.id));
    for (const preset of ['rapido', 'con-ritmo', 'sobrio']) {
      for (const a of recommendTransitions(project(preset, scenes))) if (a.transition) expect(ids.has(a.transition)).toBe(true);
    }
  });
});

describe('transiciones en la línea de tiempo', () => {
  it('la escena lleva su transición y la anterior continúa debajo', () => {
    const p = project('rapido', [sc('s1', 0), sc('s2', 10, { transition: { id: 'zoom' } }), sc('s3', 58, {}), sc('s4', 20, { transition: { id: 'no-existe' } })]);
    const t = buildTimeline(p, null, { video: 'v' });
    expect(t.clips[0].transition).toBeUndefined();
    expect(t.clips[1].transition).toMatchObject({ frames: 9, out: { sourceStartFrame: 60 } });
    expect(t.clips[3].transition).toBeUndefined(); // transición desconocida: corte seco
    expect(t.durationInFrames).toBe(240); // las transiciones no cambian la duración
  });

  it('sin material después del corte, no hay capa de salida', () => {
    const p = project('rapido', [sc('s1', 58), sc('s2', 10, { transition: { id: 'fundido', duration: 0.5 } })]);
    const tr = buildTimeline(p, null, { video: 'v' }).clips[1].transition!;
    expect(tr.frames).toBe(15);
    expect(tr.out).toBeUndefined();
  });

  it('curvas y estilos: empieza en el valor inicial y termina en el estado normal', () => {
    expect(ease('suave', 0)).toBe(0);
    expect(ease('suave', 1)).toBe(1);
    expect(ease('rebote', 1)).toBeCloseTo(1);
    expect(layerStyle({ x: [100, 0], opacidad: [0, 1] }, 0)).toEqual({ opacity: 0, transform: 'translate(100%, 0%)' });
    expect(layerStyle({ x: [100, 0], opacidad: [0, 1], desenfoque: [20, 0] }, 1)).toEqual({ opacity: 1, transform: 'translate(0%, 0%)' });
    for (const t of BUILTIN_TRANSITIONS) {
      const end = layerStyle(t.entra, 1);
      expect(end.opacity ?? 1).toBe(1);
      expect(end.filter).toBeUndefined();
    }
  });
});

describe('transiciones propias del cliente', () => {
  it('se guardan validadas y aparecen junto a las incluidas', async () => {
    const spec = await saveTransition('acme', { name: 'Cortina rápida', description: 'Cae desde arriba', entra: { y: [-100, 0] } });
    expect(spec.id).toBe('cortina-rapida');
    expect((await allTransitions('acme')).map((t) => t.id)).toEqual(expect.arrayContaining(['cortina-rapida', 'fundido']));
    expect((await allTransitions('otro')).map((t) => t.id)).not.toContain('cortina-rapida');
    await expect(saveTransition('acme', { name: 'Vacía' })).rejects.toThrow('no anima nada');
    await expect(saveTransition('acme', { name: 'Mala', entra: { escala: [1, 99] } })).rejects.toThrow();
  });
});

describe('asistente dentro de la app', () => {
  // Un Claude de mentira que habla el mismo formato que `claude -p --output-format stream-json`.
  const fake = (body: string) => {
    const f = path.join(ws, `fake-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(f, body);
    vi.stubEnv('SE_CLAUDE_BIN', f);
  };

  it('informa los pasos y devuelve el resultado', async () => {
    fake(`
      const args = process.argv.slice(2);
      if (!args.includes('--strict-mcp-config') || !args.includes('mcp__snz-studio')) process.exit(3);
      const out = (o) => console.log(JSON.stringify(o));
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__snz-studio__generar_variantes' }] } });
      out({ type: 'result', is_error: false, result: 'Listo: ' + args[args.indexOf('-p') + 1].split('\\n')[0] });
    `);
    const steps: string[] = [];
    const r = await askClaude('proy-1', 'dame variantes', (m) => steps.push(m));
    expect(r.tools).toEqual(['generar_variantes']);
    expect(steps[0]).toContain('generar variantes');
    expect(r.text).toBe('Listo: Proyecto: proy-1');
  });

  it('explica qué hacer si falta iniciar sesión', async () => {
    fake(`console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' }));`);
    const err = await askClaude('proy-1', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(AssistantError);
    expect(err.code).toBe('login');
    expect(err.message).toContain('/login');
  });

  it('otros fallos se informan tal cual', async () => {
    fake(`console.log(JSON.stringify({ type: 'result', is_error: true, result: 'Se acabó el límite de uso' }));`);
    const err = await askClaude('proy-1', 'x').catch((e) => e);
    expect(err.code).toBe('fallo');
    expect(err.message).toContain('límite de uso');
  });
});
