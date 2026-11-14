"""Voz en off con Qwen3-TTS (VoiceDesign), local. Uso: voz-qwen.py <modelo> <texto.txt> <salida.wav> <instrucción de voz>"""
import os, sys
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

model, text_file, out, instruct = sys.argv[1:5]
text = open(text_file, encoding='utf-8').read().strip()
device = 'mps' if torch.backends.mps.is_available() else ('cuda' if torch.cuda.is_available() else 'cpu')
m = Qwen3TTSModel.from_pretrained(model, device_map=device, dtype=torch.float16 if device != 'cpu' else torch.float32, attn_implementation='eager')
# ~12 fichas por segundo de audio; a ritmo de anuncio salen unas 2,6 palabras por segundo.
tokens = int(min(2000, max(120, len(text.split()) / 2.2 * 12 * 1.6)))
w, sr = m.generate_voice_design(text=text, language='Spanish', instruct=instruct, max_new_tokens=tokens)
sf.write(out, w[0], sr)
print('LISTO', round(len(w[0]) / sr, 1), flush=True)
