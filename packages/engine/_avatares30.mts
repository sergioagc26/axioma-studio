// Crea avatares ficticios variados y los guarda (workspace/avatares). Salta los que ya existen.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { createAvatarFace } from './src/avatar.ts';
import { AVATARS_DIR, saveAvatar } from './src/creator.ts';
import { slugify } from './src/paths.ts';
const list = JSON.parse(await readFile(process.argv[2], 'utf8')) as [string, 'f' | 'm', string][];
const base = path.join(AVATARS_DIR, 'chica-axioma');
const fondos = Object.fromEntries(['estudio', 'noche', 'claro', 'oscuro', 'pc'].map((k) => [k, path.join(base, `fondo-${k}.png`)]));
const minis = [1, 2, 3, 4, 5, 6].map((i) => path.join(base, 'miniaturas', `m${i}.jpg`));
for (const [i, [name, g, desc]] of list.entries()) {
  if (existsSync(path.join(AVATARS_DIR, slugify(name), 'cara.png'))) { console.log('ya está', name); continue; }
  try {
    const tmp = path.join(os.tmpdir(), `cara-${slugify(name)}.png`);
    await createAvatarFace(desc, tmp, 3000 + i);
    await saveAvatar({ name, face: tmp, description: `Persona ficticia creada con IA: ${desc}. Al publicar, marcar «hecho con IA».`, voice: { provider: 'elevenlabs', voice: g === 'f' ? 'EXAVITQu4vr4xnSDxMaL' : 'nPczCjzI2devNBz1zQrb' }, backgrounds: fondos, thumbnails: minis });
    console.log(new Date().toLocaleTimeString(), 'listo', i + 1, name);
  } catch (e) { console.log('ERROR', name, (e as Error).message.slice(-300)); }
}
console.log('TODOS LISTOS');
