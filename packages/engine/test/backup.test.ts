import { describe, expect, it } from 'vitest';
import { skipInBackup } from '../src/backup.ts';

describe('copia de seguridad', () => {
  it('copia el trabajo: originales, masters, ediciones, marcas, música y calendario', () => {
    for (const f of ['clientes/a/proyectos/p/project.json', 'clientes/a/proyectos/p/media/original.mov', 'clientes/a/proyectos/p/media/master.mp4', 'clientes/a/kit.json', 'clientes/a/marca/logo.png', 'musica/biblioteca.json', 'calendario.json', 'clientes/a/proyectos/p/renders/r.mp4'])
      expect(skipInBackup(f)).toBe(false);
  });
  it('salta lo que se vuelve a crear solo, lo temporal y lo secreto', () => {
    for (const f of ['clientes/a/proyectos/p/proxies/proxy.mp4', 'clientes/a/proyectos/p/media/lento/s1.mp4', 'clientes/a/proyectos/p/renders/r.sin-nivelar.mp4', 'clave-red.txt', 'studio-errores.log', 'clientes/.DS_Store'])
      expect(skipInBackup(f)).toBe(true);
  });
});
