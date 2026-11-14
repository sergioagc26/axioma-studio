# Axioma Studio · Requisitos del computador

La app mide el computador (procesador, memoria, tarjeta de video y disco) y se configura sola en
**Configuración › Tu computador › Optimizar para este computador**: elige los motores de IA que le
caben, la voz, la transcripción y cuántos procesos usar al exportar. Si falta un motor recomendado,
ofrece descargarlo.

| | Mínimo | Recomendado | Ideal |
|---|---|---|---|
| Memoria RAM | 8 GB | 16 GB | 32 GB o más |
| Procesador | 4 núcleos | 8 núcleos (o Apple M1 o superior) | 12 núcleos o más |
| Video / IA | Cualquiera (la IA corre en el procesador, lenta) | Apple Silicon o NVIDIA de 8 GB | Apple Pro/Max o NVIDIA de 12 GB o más |
| Disco libre | 20 GB | 50 GB | 200 GB |
| Sistema | macOS 13 o Windows 10 de 64 bits | | |

## Qué hace la app en cada nivel

- **Mínimo:** edita, subtitula y exporta en 1080p. IA local pequeña (qwen3:4b o menos), voz del computador, sin IA de visión ni 4K.
- **Recomendado:** todo funciona: IA local mediana (qwen3:8b), IA que mira las tomas (qwen3-vl:8b), voz IA natural local, 4K.
- **Ideal:** IA local grande (qwen3:14b, escribe mejor), transcripción más precisa (Whisper medium) y exportaciones más rápidas.

Por debajo del mínimo la app avisa qué se limita (memoria, núcleos, disco) y puede fallar al exportar.
