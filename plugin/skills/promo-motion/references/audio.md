# Música y efectos por código

- Sintetiza en Node (osciladores, ruido, filtros, envolventes). Sin muestras ni descargas.
- Identidad nueva por video: cambia género, BPM, tonalidad e instrumentos. Ya usados: house/pop, funk con bronces, funk electrónico, trap 808, carranga electrónica, cumbia electrónica, cinematográfico épico, piano con cuerdas, mapa de metro con Rhodes, shuffle.
- BPM que dé cuadros enteros por tiempo a 30 fps: 72 (25), 90 (20), 100 (18), 112,5 (16), 120 (15).
- Cada efecto sale de `CUES` en `src/timeline.ts` y está afinado en la tonalidad de la música.
- Entrega `music.wav`, `sfx.wav` y `mix.wav`: los stems permiten bajar la música bajo una voz.
- Objetivo: −14 a −16 LUFS y pico ≤ −1 dBFS en el MP4 final (mídelo, el AAC sube el pico).
- Para textos que se leen: música calmada y limpia. Brillos, ruido de vinilo y cortes de voz suenan a "ruido".
- Si el audio depende de otro archivo de tiempos (voz), regenera después de cada cambio de tiempos.
- No puedes escuchar: revisa `check-cues`, el volumen y, si dudas, un espectrograma (`ffmpeg -i mix.wav -lavfi showspectrumpic=s=1200x500 spec.png`).
