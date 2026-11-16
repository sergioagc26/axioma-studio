import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Project, getPreset, outputDuration } from '@axioma/schema';

// Todo en un workspace temporal, sin claves (nada de bajar música de internet).
const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-motor-'));
vi.stubEnv('SE_WORKSPACE', ws);
vi.stubEnv('SE_ENV_FILE', path.join(ws, '.env'));
vi.stubEnv('FREESOUND_API_KEY', '');
const E = await import('../src/index.ts');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

const ffmpeg = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

/** Proyecto mínimo escrito a mano (sin video): basta para el plan y las referencias. */
function fakeProject(slug: string, brief: Record<string, string> = {}) {
  const dir = path.join(ws, 'clientes', 'personal', 'proyectos', slug);
  mkdirSync(dir, { recursive: true });
  const p = Project.parse({
    version: 1, id: slug, name: slug, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', format: { width: 1080, height: 1920, fps: 30 },
    source: { file: 'media/original.mp4', duration: 30, width: 1080, height: 1920, fps: 30 }, kind: 'montaje',
    pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions, brief,
    scenes: [{ id: 's01', ranges: [{ start: 0, end: 2 }] }, { id: 's02', ranges: [{ start: 2, end: 4 }] }],
  });
  writeFileSync(path.join(dir, 'project.json'), JSON.stringify(p, null, 2));
  return dir;
}

/** Referencia guardada del cliente «personal» (solo su report.json) y su estilo. */
async function fakeReference(id: string, name: string) {
  const rdir = path.join(E.referencesDir('personal'), id);
  mkdirSync(path.join(rdir, 'frames'), { recursive: true });
  const report = {
    id, name, client: 'personal', createdAt: new Date().toISOString(), duration: 20, cuts: [1, 2, 3], avgShot: 1.2, bpm: 120, palette: ['#FACC15'], frames: [],
    captions: null, look: 'calido', flashes: false, typography: null, suggested: { ritmo: 'rapido', maxPause: 0.2, punchZoomEvery: 3, highlightColor: '#FACC15' },
  };
  writeFileSync(path.join(rdir, 'report.json'), JSON.stringify(report));
  await E.savePreset('personal', E.presetFromReference(report as never, `Estilo ${name}`));
}

describe('duración pedida en el brief', () => {
  it('entiende minutos, mm:ss y rangos; «Lo que dure» no tiene tope', () => {
    expect(E.maxSeconds('1 minuto')).toBe(60);
    expect(E.maxSeconds('2 min')).toBe(120);
    expect(E.maxSeconds('1:30')).toBe(90);
    expect(E.maxSeconds('90 s')).toBe(90);
    expect(E.maxSeconds('15–20 s')).toBe(20);
    expect(E.maxSeconds('máximo 40 s')).toBe(40);
    expect(E.maxSeconds('Lo que dure')).toBeNull();
    expect(E.maxSeconds('1')).toBeNull(); // 1 s no es una duración real
    expect(E.wantsAll('Lo que dure')).toBe(true);
  });
});

describe('la referencia del brief es la única que manda', () => {
  beforeAll(async () => { await fakeReference('promo', 'Promo'); });

  it('sin referencia elegida no usa ninguna, aunque haya estilos de referencias guardados', async () => {
    const dir = fakeProject('sin-ref');
    const plan = (await E.planAutoEdit(dir)).join(' ');
    expect(plan).not.toMatch(/referencia «/);
    expect((await E.editRoute(await E.readProject(dir))).referenceId).toBeUndefined();
  });

  it('«ninguna» tampoco usa ninguna; elegida, la usa aunque el brief esté respondido', async () => {
    const none = fakeProject('ref-ninguna', { referencia: 'ninguna' });
    expect((await E.planAutoEdit(none)).join(' ')).not.toMatch(/referencia «/);
    const chosen = fakeProject('ref-elegida', { referencia: 'promo', ritmo: 'Rápido', tono: 'Directo' });
    const route = await E.editRoute(await E.readProject(chosen));
    expect(route).toMatchObject({ referenceId: 'promo', useBrief: false });
    expect((await E.planAutoEdit(chosen))[0]).toMatch(/Seguiré tu referencia «/);
  });

  it('con el brief respondido y sin referencia, el plan describe el brief', async () => {
    const dir = fakeProject('plan-brief', { ritmo: 'Enérgico', tono: 'Inspirador', duracion: '1 minuto', cta: 'Únete al reto' });
    const plan = (await E.planAutoEdit(dir)).join(' ');
    expect(plan).toContain('según tu brief');
    expect(plan).toContain('60 s');
    expect(plan).toContain('Únete al reto');
  });

  it('borrar la referencia borra sus estilos y la quita del brief', async () => {
    await fakeReference('borrar', 'Borrar');
    const dir = fakeProject('usa-borrar', { referencia: 'borrar' });
    expect((await E.listPresets('personal')).some((p) => p.reference === 'borrar')).toBe(true);
    await E.deleteReference('personal', 'borrar');
    expect((await E.listPresets('personal')).some((p) => p.reference === 'borrar')).toBe(false);
    expect((await E.readProject(dir)).brief.referencia).toBeUndefined();
    // La otra referencia y su estilo siguen.
    expect((await E.listPresets('personal')).some((p) => p.reference === 'promo')).toBe(true);
  });
});

describe('estilos propios: renombrar y borrar', () => {
  it('renombra y borra los del cliente, nunca los de la app', async () => {
    await E.savePreset('personal', { name: 'Mi estilo uno' });
    const renamed = await E.renamePreset('personal', 'mi-estilo-uno', 'Nombre nuevo');
    expect(renamed.find((p) => p.id === 'mi-estilo-uno')?.name).toBe('Nombre nuevo');
    const left = await E.deletePreset('personal', 'mi-estilo-uno');
    expect(left.some((p) => p.id === 'mi-estilo-uno')).toBe(false);
    await expect(E.deletePreset('personal', 'rapido')).rejects.toThrow(/de la app/);
  });
});

describe('última exportación', () => {
  it('dice si el proyecto cambió después de exportar y el último error', async () => {
    const dir = fakeProject('exportado');
    expect(await E.lastExport(dir)).toBeNull();
    mkdirSync(path.join(dir, 'renders'), { recursive: true });
    const out = path.join(dir, 'renders', 'exportado-1.mp4');
    writeFileSync(out, 'x');
    const p = await E.readProject(dir);
    await E.recordExport(dir, { out, projectUpdatedAt: p.updatedAt });
    expect(await E.lastExport(dir)).toMatchObject({ file: 'renders/exportado-1.mp4', stale: false });
    await E.writeProject(dir, p);
    expect((await E.lastExport(dir))?.stale).toBe(true);
    await E.recordExport(dir, { error: 'Se cerró el navegador' });
    expect(await E.lastExport(dir)).toMatchObject({ file: 'renders/exportado-1.mp4', error: 'Se cerró el navegador' });
  });

  it('no se pierde nada si exportar, guardar y fallar caen en el mismo milisegundo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
      const dir = fakeProject('mismo-ms');
      const p = await E.writeProject(dir, await E.readProject(dir));
      const out = path.join(dir, 'renders', 'mismo-ms-1.mp4');
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, 'x');
      await E.recordExport(dir, { out, projectUpdatedAt: p.updatedAt });
      await E.writeProject(dir, p);
      expect((await E.lastExport(dir))?.stale).toBe(true);
      await E.recordExport(dir, { error: 'Se cerró el navegador' });
      expect((await E.lastExport(dir))?.error).toBe('Se cerró el navegador');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('montaje: la música se elige antes de cortar', () => {
  let dir = '';
  let tracks: string[] = [];
  beforeAll(async () => {
    const clips = ['red', 'green', 'blue'].map((c) => {
      const out = path.join(ws, `${c}.mp4`);
      ffmpeg(['-f', 'lavfi', '-i', `color=c=${c}:s=360x640:r=30:d=12`, '-pix_fmt', 'yuv420p', out]);
      return out;
    });
    ({ dir } = await E.createMontage({ inputs: clips, name: 'Gimnasio', client: 'personal' }));
    await E.prepareMedia(dir, () => {});
    await E.detectShots(dir);
    await E.buildMontage(dir, {});
    // Dos canciones con un golpe claro a 120 BPM (una por cada medio segundo), de 70 s.
    for (const [i, f] of [1000, 700].entries()) {
      const song = path.join(ws, `cancion-${i}.wav`);
      ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='if(lt(mod(t,0.5),0.04),0.9*sin(2*PI*${f}*t),0)':s=22050:d=70`, song]);
      tracks.push((await E.addTrack(song, { license: 'propia', name: `Canción ${i}` })).file);
    }
  }, 240_000);

  it('arma el montaje una sola vez con música, la duración del brief y el cierre', async () => {
    await E.setBrief(dir, { ritmo: 'Enérgico', tono: 'Inspirador', duracion: '20 s', cta: 'Únete al reto' });
    const { summary } = await E.editEverything(dir);
    const p = await E.readProject(dir);
    expect(p.audio.music).toBeTruthy();
    expect(outputDuration(p)).toBeGreaterThan(17);
    expect(outputDuration(p)).toBeLessThan(23);
    expect(p.scenes.at(-1)?.onScreenText).toContain('Únete al reto');
    // La música va antes del corte: el resumen no dice «Montaje de 30 s» ni se perdió el cierre.
    expect(summary.join(' ')).toMatch(/Montaje de (1[89]|2[0-2]) s/);
  }, 240_000);

  it('cambiar de canción recorta al ritmo pero conserva duración y cierre', async () => {
    const before = await E.readProject(dir);
    const other = tracks.find((t) => !before.audio.music?.includes(path.basename(t, path.extname(t))))!;
    const r = await E.useLibraryTrack(dir, other);
    expect(r.rebuilt).toBe(true);
    expect(Math.abs(outputDuration(r.project) - outputDuration(before))).toBeLessThan(1.5);
    expect(r.project.scenes.at(-1)?.onScreenText).toContain('Únete al reto');
  }, 120_000);

  it('quitar la música a mano se respeta al volver a editar', async () => {
    await E.setMusic(dir, null);
    expect((await E.readProject(dir)).audio.musicOff).toBe(true);
    const { summary } = await E.editEverything(dir);
    expect((await E.readProject(dir)).audio.music).toBeUndefined();
    expect(summary.join(' ')).toContain('quitaste');
  }, 240_000);

  it('apagar los efectos a mano se respeta', async () => {
    await E.setAutoSfx(dir, false, { manual: true });
    await E.setAutoSfx(dir, true); // la edición automática no los vuelve a encender
    expect((await E.readProject(dir)).audio).toMatchObject({ sfxAuto: false, sfxOff: true });
  });
});

