import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
// El proyecto de prueba: en workspace/ o donde diga AXIOMA_FIXTURE (por ejemplo, si el workspace se archivó).
const fixture = process.env.AXIOMA_FIXTURE ?? path.join(repo, 'workspace', 'clientes', 'personal', 'proyectos', '2026-11-12-prueba-sintetica');

// Usa una copia del proyecto de prueba en un workspace temporal.
const hasFixture = existsSync(path.join(fixture, 'transcript.json'));
const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-ws-'));
const dir = path.join(ws, 'clientes', 'personal', 'proyectos', 'prueba');
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { text: r.content.map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
};

describe.skipIf(!hasFixture)('servidor MCP', () => {
  beforeAll(async () => {
    cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}renders${path.sep}`) });
    client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repo, 'packages', 'mcp', 'bin', 'server.mjs')],
      env: { ...process.env, SE_WORKSPACE: ws } as Record<string, string>,
      stderr: 'ignore',
    }));
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    rmSync(ws, { recursive: true, force: true });
  });

  it('expone las herramientas', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ['crear_proyecto', 'leer_transcripcion', 'armar_storyboard', 'generar_variantes', 'elegir_variante', 'renderizar']) {
      expect(names).toContain(n);
    }
  });

  it('lee frases y marca tomas descartadas y muletillas', async () => {
    const { text } = await call('leer_transcripcion');
    expect(text).toMatch(/^f01 /m);
    expect(text).toContain('[toma descartada');
    expect(text).toContain('[muletilla]');
  });

  it('arma el storyboard con frases, variantes y reorden', async () => {
    const phrases = (await call('leer_transcripcion')).text.split('\n');
    const usable = phrases.filter((l) => !l.includes('[')).map((l) => l.split(' ')[0]);
    expect(usable.length).toBeGreaterThanOrEqual(4);

    const sb = await call('armar_storyboard', {
      escenas: [
        { rol: 'gancho', titulo: 'Gancho', frases: [usable[0]], texto_en_pantalla: 'Edita en 10 minutos' },
        { rol: 'problema', titulo: 'Problema', frases: [usable[1]] },
        { rol: 'beneficio', titulo: 'Beneficio', frases: [usable[2], usable[3]] },
        { rol: 'cta', titulo: 'CTA', frases: usable.slice(4) },
      ],
    });
    expect(sb.isError).toBe(false);
    expect(sb.text).toContain('s01 [gancho] Gancho');
    expect(sb.text).toContain('texto: "Edita en 10 minutos"');

    const v = await call('generar_variantes', {
      escena: 's02',
      variantes: [
        { etiqueta: 'Texto con color', visual: 'texto', texto_en_pantalla: 'Horas perdidas', color_texto: '#FE2C55' },
        { etiqueta: 'Sobrio', visual: 'original', texto_en_pantalla: '' },
      ],
    });
    expect(v.text).toContain('variantes: a,b');
    const ch = await call('elegir_variante', { escena: 's02', variante: 'a' });
    expect(ch.text).toContain('variantes: a*,b');
    expect(ch.text).toContain('texto: "Horas perdidas"');

    await call('reordenar_escenas', { orden: ['s02', 's01', 's03', 's04'] });
    const project = JSON.parse(readFileSync(path.join(dir, 'project.json'), 'utf8'));
    expect(project.scenes.map((s: { id: string }) => s.id)).toEqual(['s02', 's01', 's03', 's04']);
  });

  it('devuelve errores claros', async () => {
    const r = await call('editar_escena', { escena: 's99', titulo: 'x' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('No existe la escena s99');
    const f = await call('armar_storyboard', { escenas: [{ frases: ['f999'] }] });
    expect(f.text).toContain('no existen las frases f999');
  });

  it('guarda presets del cliente y versiones', async () => {
    const p = await call('guardar_preset', { nombre: 'CRE amarillo', base: 'rapido', subtitulos: { color_resaltado: '#FACC15' } });
    expect(p.text).toContain('cre-amarillo');
    expect((await call('listar_presets')).text).toContain('cre-amarillo');
    expect((await call('aplicar_preset', { preset: 'cre-amarillo' })).isError).toBe(false);
    expect((await call('guardar_version', { etiqueta: 'test' })).text).toMatch(/Versión guardada: .*test\.json/);
  });
});
