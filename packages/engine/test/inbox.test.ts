import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Project, getPreset } from '@axioma/schema';

// Workspace temporal: «Para editar» y «Listos» viven ahí.
const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-pedidos-'));
vi.stubEnv('SE_WORKSPACE', ws);
const E = await import('../src/index.ts');
afterAll(() => rmSync(ws, { recursive: true, force: true }));

const touch = (f: string, body = 'x') => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body); };

describe('classifyFiles', () => {
  it('reconoce cada archivo por su nombre', () => {
    const f = E.classifyFiles([
      '/p/toma2.MOV', '/p/toma1.mp4', '/p/referencia.mp4', '/p/referencias/otra.mov',
      '/p/Guión final.txt', '/p/pedido.txt', '/p/notas.md', '/p/logo.png', '/p/foto.jpg', '/p/cancion.mp3',
    ]);
    expect(f.videos).toEqual(['/p/toma1.mp4', '/p/toma2.MOV']);
    expect(f.referencias).toEqual(['/p/referencia.mp4', '/p/referencias/otra.mov']);
    expect(f.guion).toBe('/p/Guión final.txt');
    expect(f.pedido).toBe('/p/pedido.txt');
    expect(f.logo).toBe('/p/logo.png');
    expect(f.musica).toBe('/p/cancion.mp3');
    expect(f.otros).toEqual(['/p/foto.jpg', '/p/notas.md']);
  });

  it('un .txt cualquiera sirve de pedido si no hay otro', () => {
    expect(E.classifyFiles(['/p/a.mp4', '/p/lo que quiero.txt']).pedido).toBe('/p/lo que quiero.txt');
  });
});

describe('parseOrder', () => {
  it('lee la plantilla: ignora lo vacío y entiende cada pregunta', () => {
    const r = E.parseOrder(E.ORDER_TEMPLATE
      .replace('Marca o cliente:', 'Marca o cliente: Gym Fuerza')
      .replace('¿Qué es este video?:', '¿Qué es este video?: promo de la clase de las 6 am')
      .replace('¿Qué quieres que haga quien lo vea?:', '¿Qué quieres que haga quien lo vea?: que me escriban por DM')
      .replace('¿Dónde lo vas a publicar?:', '¿Dónde lo vas a publicar?: Instagram')
      .replace('Frase final (llamado a la acción):', 'Frase final (llamado a la acción): Escribe CLASE'));
    expect(r.client).toBe('Gym Fuerza');
    expect(r.brief).toEqual({ notas: 'promo de la clase de las 6 am', objetivo: 'que me escriban por DM', formato: 'Instagram', cta: 'Escribe CLASE' });
  });

  it('el texto suelto queda como nota (y de él se saca la duración)', () => {
    expect(E.parseOrder('Quiero algo rápido y con energía\nque dure 30 segundos').brief).toEqual({ notas: 'Quiero algo rápido y con energía que dure 30 segundos', duracion: '30 segundos' });
    expect(E.parseOrder('Duración: 30 s\nno muestres la cara del niño').brief).toEqual({ duracion: '30 s', notas: 'no muestres la cara del niño' });
  });

  it('lee la marca del pedido: colores, letra, sector, tono y referencia', () => {
    const r = E.parseOrder(E.ORDER_TEMPLATE
      .replace('Marca o cliente:', 'Marca o cliente: Gym Fuerza')
      .replace('A qué se dedica la marca:', 'A qué se dedica la marca: somos un gimnasio de crossfit')
      .replace('Cómo habla la marca:', 'Cómo habla la marca: motivadora y directa')
      .replace('Colores de la marca:', 'Colores de la marca: azul oscuro y dorado, letras #fff')
      .replace('Tipografía:', 'Tipografía: Bebas Neue para títulos y montserrat')
      .replace('Referencia (enlace de un video que te guste):', 'Referencia (enlace de un video que te guste): https://www.instagram.com/reel/ABC123/.'));
    expect(r.client).toBe('Gym Fuerza');
    expect(r.brief).toEqual({});
    expect(r.brand).toEqual({
      colors: ['#0B2A5B', '#D4A537', '#FFFFFF'], fonts: ['Bebas Neue', 'Montserrat'],
      sector: 'gimnasio', personality: 'energica', references: ['https://www.instagram.com/reel/ABC123/'],
    });
    // Al volver a abrir el pedido en el studio, la marca se ve tal como se escribió.
    expect(r.brandText.colores).toBe('azul oscuro y dorado, letras #fff');
    expect(E.parseOrder(E.ORDER_TEMPLATE.replace('Colores de la marca:', `Colores de la marca: ${r.brandText.colores}`)).brand.colors).toEqual(r.brand.colors);
  });

  it('lo que no se entiende de la marca no se inventa: queda como nota', () => {
    const r = E.parseOrder('Colores de la marca: los del logo\nTipografía: una bonita');
    expect(r.brand.colors).toEqual([]);
    expect(r.brand.fonts).toEqual([]);
    expect(r.brief.notas).toBe('Marca: colores: los del logo; tipografia: una bonita');
  });

  it('la marca también se entiende desde las respuestas del chat', () => {
    expect(E.brandFrom({ colores: 'negro y amarillo', tipografia: 'Anton', sector: 'barbería', personalidad: 'rebelde' })).toEqual({
      brand: { colors: ['#111111', '#FFD200'], fonts: ['Anton'], sector: 'moda', personality: 'rebelde', references: [] },
    });
  });

  it('«azul oscuro» es un color, no «azul» y otro más; WhatsApp no es tecnología', () => {
    expect(E.parseColors('Azul oscuro, rojo')).toEqual(['#0B2A5B', '#E53935']);
    expect(E.parseSector('vendemos por whatsapp en la tienda')).toBe('negocios');
    expect(E.parsePersonality('elegante y exclusiva')).toBe('elegante');
  });

  it('YouTube va horizontal; Shorts y redes, vertical', () => {
    expect(E.shapeFor('YouTube')).toBe('horizontal');
    expect(E.shapeFor('YouTube Shorts')).toBe('vertical');
    expect(E.shapeFor('Instagram')).toBe('vertical');
    expect(E.shapeFor(undefined)).toBe('vertical');
  });
});

describe('carpeta «Para editar»', () => {
  it('crea las carpetas con instrucciones y lista los pedidos', async () => {
    const { inbox, ready } = await E.ensureInbox();
    expect(readFileSync(path.join(inbox, 'LEEME.txt'), 'utf8')).toContain('hazme el video');
    expect(readFileSync(path.join(inbox, '_plantilla', 'pedido.txt'), 'utf8')).toContain('Marca o cliente');
    expect(ready).toBe(path.join(ws, 'Listos'));

    touch(path.join(inbox, 'promo-noviembre', 'video1.mov'));
    touch(path.join(inbox, 'promo-noviembre', 'pedido.txt'), 'Marca: Gym Fuerza');
    touch(path.join(inbox, 'Receta Pasta.mp4'));
    touch(path.join(inbox, 'solo-notas', 'idea.txt')); // sin videos: no es un pedido
    const orders = await E.listOrders();
    expect(orders.map((o) => o.name)).toEqual(['promo-noviembre', 'Receta Pasta']);
    expect(orders.every((o) => o.state.estado === 'pendiente')).toBe(true);
    expect(E.formatOrders(orders)).toContain('pedido: pedido.txt');
  });

  it('encuentra el pedido sin importar mayúsculas, tildes ni guiones', async () => {
    expect((await E.findOrder('Promo Noviembre')).name).toBe('promo-noviembre');
    expect((await E.findOrder('receta pasta')).name).toBe('Receta Pasta');
    await expect(E.findOrder('otro')).rejects.toThrow('No encontré el pedido «otro»');
    await expect(E.findOrder()).rejects.toThrow('Hay 2 pedidos');
  });
});

describe('el corte con guion sobrevive a un cambio de ritmo', () => {
  it('cutProject vuelve a cortar con el guion y olvidar_guion vuelve al automático', async () => {
    const dir = path.join(ws, 'clientes', 'personal', 'proyectos', 'con-guion');
    mkdirSync(dir, { recursive: true });
    const p = Project.parse({
      version: 1, id: 'con-guion', name: 'con guion', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', format: { width: 1080, height: 1920, fps: 30 },
      source: { file: 'media/original.mp4', duration: 12, width: 1080, height: 1920, fps: 30 },
      pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
    });
    writeFileSync(path.join(dir, 'project.json'), JSON.stringify(p));
    let t = 0.5;
    const words = 'Hola hoy hablamos de pan. Esto no va. Compra pan fresco.'.split(' ').map((w) => { const x = { text: w, start: t, end: t + 0.3, prob: 0.9 }; t += 0.6; return x; });
    writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ language: 'es', model: 'prueba', words }));
    writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify({ silences: [] }));

    await E.cutProjectToScript(dir, { text: 'Hola hoy hablamos de pan.\nCompra pan fresco.' });
    const spoken = async () => {
      const pr = await E.readProject(dir);
      return words.filter((w) => pr.scenes.some((s) => s.ranges.some((r) => w.start >= r.start - 0.01 && w.end <= r.end + 0.01))).map((w) => w.text).join(' ');
    };
    expect(await spoken()).not.toContain('Esto');

    // Cambiar el ritmo (lo hace el brief y la edición automática) mantiene el guion.
    await E.cutProject(dir, 'sobrio');
    expect(await spoken()).not.toContain('Esto');
    expect((await E.readProject(dir)).scriptCut).toBeTruthy();

    // Pedir el corte automático a propósito lo olvida.
    await E.cutProject(dir, undefined, { ignoreScript: true });
    expect(await spoken()).toContain('Esto');
    expect((await E.readProject(dir)).scriptCut).toBeUndefined();
  });
});

describe('pedido desde el estudio', () => {
  it('el formulario escribe un pedido.txt que se lee igual que la plantilla', async () => {
    expect(E.orderFolderName('  ../promo: noviembre/  ')).toBe('promo noviembre');
    expect(() => E.orderFolderName('  //  ')).toThrow('Ponle un nombre');
    const file = await E.saveOrderText('Clase spinning', { cliente: 'Gym Fuerza', objetivo: 'que reserven', duracion: '15 s', extra: 'que se vea el\nprecio' });
    const r = E.parseOrder(readFileSync(file, 'utf8'));
    expect(r.client).toBe('Gym Fuerza');
    expect(r.brief).toEqual({ objetivo: 'que reserven', duracion: '15 s', notas: 'que se vea el precio' });
    expect(E.classifyFiles([file]).pedido).toBe(file);
  });
});

describe('clips sin pista de audio', () => {
  it('un clip sin audio (pantalla, stock, generado) es «sin voz», sin pasar por whisper', async () => {
    const { execFileSync } = await import('node:child_process');
    const f = path.join(ws, 'sin-audio.mp4');
    execFileSync(process.env.SE_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=1', '-pix_fmt', 'yuv420p', f]);
    expect(await E.videoHasSpeech(f)).toBe(false);
  });
});
