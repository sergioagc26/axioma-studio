#!/bin/bash
# Instala el motor de avatares de IA (SadTalker, Apache-2.0) junto a la app: .avatar/SadTalker y .venv-avatar.
# Unos 3 GB entre programas y modelos. Solo hace falta una vez.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"; export TMPDIR="$ROOT/.tmp" PIP_CACHE_DIR="$ROOT/.tmp/pip"; mkdir -p "$TMPDIR" .avatar
PY=$(command -v python3.12 || command -v python3.11 || command -v python3.10 || true)
[ -z "$PY" ] && { echo "Falta Python 3.10–3.12 (en Mac: brew install python@3.12)"; exit 1; }
[ -d .avatar/SadTalker ] || git clone -q --depth 1 https://github.com/OpenTalker/SadTalker.git .avatar/SadTalker
[ -x .venv-avatar/bin/python ] || "$PY" -m venv .venv-avatar
.venv-avatar/bin/pip install -q --upgrade pip
.venv-avatar/bin/pip install -q "numpy<2" torch torchvision "face_alignment==1.4.1" imageio imageio-ffmpeg "librosa==0.10.2" numba resampy pydub scipy kornia tqdm yacs pyyaml joblib scikit-image basicsr facexlib gfpgan av safetensors
# Arreglos para las versiones nuevas de las librerías.
SP=$(.venv-avatar/bin/python -c "import site;print(site.getsitepackages()[0])")
sed -i.bak 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$SP/basicsr/data/degradations.py"
cd .avatar/SadTalker
grep -rl "np\.float\b" src | xargs sed -i.bak -E 's/np\.float([^0-9_a-zA-Z])/np.float64\1/g' || true
sed -i.bak 's/    trans_params = np.array(\[w0, h0, s, t\[0\], t\[1\]\])/    trans_params = np.array([w0, h0, s, float(np.asarray(t[0]).ravel()[0]), float(np.asarray(t[1]).ravel()[0])])/' src/face3d/util/preprocess.py
mkdir -p checkpoints gfpgan/weights
dl(){ [ -s "$2" ] || curl -sL --fail -o "$2" "$1"; }
R=https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc
dl $R/mapping_00109-model.pth.tar checkpoints/mapping_00109-model.pth.tar
dl $R/mapping_00229-model.pth.tar checkpoints/mapping_00229-model.pth.tar
dl $R/SadTalker_V0.0.2_256.safetensors checkpoints/SadTalker_V0.0.2_256.safetensors
dl https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth gfpgan/weights/alignment_WFLW_4HG.pth
dl https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth gfpgan/weights/detection_Resnet50_Final.pth
dl https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth gfpgan/weights/GFPGANv1.4.pth
dl https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth gfpgan/weights/parsing_parsenet.pth
echo "Avatares listos."
