import { describe, expect, it } from 'vitest';
import { videoListo } from '../src/server.ts';

describe('videoListo', () => {
  it('en la nube le dice a Claude que envíe el MP4 como adjunto', () => {
    const t = videoListo('/w/Listos/promo.mp4', { CLAUDE_CODE_REMOTE: 'true' });
    expect(t).toContain('Video listo: /w/Listos/promo.mp4');
    expect(t).toContain('archivo adjunto');
  });
  it('en un computador propio solo da la ruta', () => {
    expect(videoListo('/w/Listos/promo.mp4', {})).toBe('Video listo: /w/Listos/promo.mp4');
  });
});
