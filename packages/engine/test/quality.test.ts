import { describe, expect, it } from 'vitest';
import { masterScale } from '../src/media.ts';
import { isLowRes } from '../src/quality.ts';

describe('calidad del video', () => {
  it('en videos chicos quita bloques y escala fino', () => {
    expect(masterScale({ width: 478, height: 850 })).toBe('deblock=filter=weak:block=8,scale=1080:-2:flags=lanczos');
    expect(masterScale({ width: 478, height: 850 }, 'nitido')).toMatch(/cas=0.3$/);
    expect(isLowRes({ width: 478, height: 850 })).toBe(true);
  });

  it('en videos grandes solo escala (sin filtros de más)', () => {
    expect(masterScale({ width: 2160, height: 3840 }, 'nitido')).toBe('scale=1080:-2:flags=lanczos');
    expect(masterScale({ width: 1920, height: 1080 })).toBe('scale=-2:1080:flags=lanczos');
    expect(isLowRes({ width: 1080, height: 1920 })).toBe(false);
  });
});
