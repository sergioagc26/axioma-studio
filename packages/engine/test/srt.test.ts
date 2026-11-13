import { describe, expect, it } from 'vitest';
import { srtCues, toSrt } from '@axioma/schema';

const w = (text: string, s: number, e: number) => ({ text, startFrame: Math.round(s * 30), endFrame: Math.round(e * 30) });

describe('subtítulos en .srt', () => {
  it('escribe el formato SRT con tiempos del video final', () => {
    const srt = toSrt([w('Hola', 0, 0.4), w('mundo.', 0.4, 0.9), w('Segunda', 1.0, 1.5), w('línea', 1.5, 2)], 30);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:00,900\nHola mundo.\n\n2\n00:00:01,000 --> 00:00:02,000\nSegunda línea\n');
  });
  it('corta en las pausas y en líneas largas', () => {
    const words = 'esta es una frase bastante larga que no debería caber entera en una sola línea'.split(' ').map((t, i) => w(t, i * 0.3, i * 0.3 + 0.25));
    const cues = srtCues([...words, w('después', 10, 10.5)], 30);
    expect(cues.every((c) => c.text.length <= 42)).toBe(true);
    expect(cues[cues.length - 1].text).toBe('después');
  });
  it('cada línea dura lo suficiente para leerse sin pisar la siguiente', () => {
    const cues = srtCues([w('Sí.', 0, 0.2), w('No.', 0.5, 0.7)], 30);
    expect(cues[0].end).toBeCloseTo(0.5, 5);
    expect(cues[1].end).toBeCloseTo(1.3, 5);
  });
});
