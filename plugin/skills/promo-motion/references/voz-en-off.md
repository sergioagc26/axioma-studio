# Voz en off (opcional)

## Antes de generar
- Escribe el guion con la persona y que lo apruebe. Solo datos confirmados.
- Una frase por idea, anclada a un cuadro (`voz/guion.json`: `{id, texto, ancla_cuadro}`).
- Presupuesto: máximo ~4,5 sílabas por segundo de pantalla. Si no cabe, quita frases que ya están escritas en pantalla.
- Nombres propios o en otro idioma pueden pronunciarse mal; no puedes oírlo, avísalo.

## De dónde sale la voz
- Con Axioma Studio: consulta `voces_disponibles`.
- ElevenLabs con la clave de la persona en `.env` (nunca la escribas en el chat ni en el código).
- CapCut de escritorio (control de pantalla, con su permiso): importa un `.srt` como subtítulos, "Texto a voz", genera, copia los WAV y borra los subtítulos si el video va sin ellos. Los términos de servicio los acepta solo la persona.
- Nunca imites la voz de una persona real sin autorización. Si una voz deja de estar disponible, ofrece otra voz real en vez de falsificarla.

## Montaje
1. Recorta silencios de cada frase y normaliza (`loudnorm=I=-20:TP=-3`).
2. Coloca cada frase en su ancla o justo después de la anterior (hueco mínimo 7 cuadros).
3. Baja la música bajo la voz: ~10 dB en agudos, ~14 dB en graves; efectos 3 dB. Entra 40 ms antes y sube suave.
4. Mezcla con ffmpeg y un limitador; mide el resultado (≈ −15 LUFS).
5. Juzga los solapamientos sobre el audio exportado, no sobre los rectángulos de la línea de tiempo.
6. Silencios largos entre frases se sienten como pausas: acorta el video repartiendo cuadros con rampa suave, no a tijeretazos.
