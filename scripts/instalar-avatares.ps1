# Instala el motor de avatares de IA (SadTalker, Apache-2.0) en Windows: .avatar\SadTalker y .venv-avatar.
# Unos 3 GB. En Windows corre en la CPU (lento) o en la GPU si hay una NVIDIA con CUDA.
# SIN PROBAR todavía en un PC con Windows.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$root = (Get-Location).Path
$env:TMP = Join-Path $root '.tmp'; $env:TEMP = $env:TMP; $env:PIP_CACHE_DIR = Join-Path $root '.tmp\pip'
New-Item -ItemType Directory -Force -Path $env:TMP, '.avatar' | Out-Null
$py = $null
foreach ($v in '3.12', '3.11', '3.10') { try { & py "-$v" --version *> $null; if ($LASTEXITCODE -eq 0) { $py = "-$v"; break } } catch {} }
if (-not $py) { Write-Host 'Falta Python 3.10-3.12: instálalo con  winget install Python.Python.3.12'; exit 1 }
if (-not (Test-Path '.avatar\SadTalker')) { git clone -q --depth 1 https://github.com/OpenTalker/SadTalker.git .avatar\SadTalker }
if (-not (Test-Path '.venv-avatar\Scripts\python.exe')) { & py $py -m venv .venv-avatar }
$vpy = Join-Path $root '.venv-avatar\Scripts\python.exe'
& $vpy -m pip install -q --upgrade pip
& $vpy -m pip install -q "numpy<2" torch torchvision "face_alignment==1.4.1" imageio imageio-ffmpeg "librosa==0.10.2" numba resampy pydub scipy kornia tqdm yacs pyyaml joblib scikit-image basicsr facexlib gfpgan av safetensors opencv-python
# Arreglos para las versiones nuevas de las librerías (los mismos que en Mac).
& $vpy - @'
import site, os, re
sp = site.getsitepackages()[-1]
p = os.path.join(sp, 'basicsr', 'data', 'degradations.py')
s = open(p, encoding='utf8').read(); open(p, 'w', encoding='utf8').write(s.replace('torchvision.transforms.functional_tensor', 'torchvision.transforms.functional'))
base = os.path.join('.avatar', 'SadTalker', 'src')
for dp, _, fs in os.walk(base):
    for f in fs:
        if f.endswith('.py'):
            q = os.path.join(dp, f); t = open(q, encoding='utf8').read(); n = re.sub(r'np\.float(?![0-9_a-zA-Z])', 'np.float64', t)
            if n != t: open(q, 'w', encoding='utf8').write(n)
q = os.path.join(base, 'face3d', 'util', 'preprocess.py'); t = open(q, encoding='utf8').read()
open(q, 'w', encoding='utf8').write(t.replace('trans_params = np.array([w0, h0, s, t[0], t[1]])', 'trans_params = np.array([w0, h0, s, float(np.asarray(t[0]).ravel()[0]), float(np.asarray(t[1]).ravel()[0])])'))
'@
Set-Location .avatar\SadTalker
New-Item -ItemType Directory -Force -Path checkpoints, gfpgan\weights | Out-Null
function Get-IfMissing($url, $out) { if (-not (Test-Path $out) -or (Get-Item $out).Length -eq 0) { Invoke-WebRequest -Uri $url -OutFile $out } }
$R = 'https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc'
Get-IfMissing "$R/mapping_00109-model.pth.tar" 'checkpoints\mapping_00109-model.pth.tar'
Get-IfMissing "$R/mapping_00229-model.pth.tar" 'checkpoints\mapping_00229-model.pth.tar'
Get-IfMissing "$R/SadTalker_V0.0.2_256.safetensors" 'checkpoints\SadTalker_V0.0.2_256.safetensors'
Get-IfMissing 'https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth' 'gfpgan\weights\alignment_WFLW_4HG.pth'
Get-IfMissing 'https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth' 'gfpgan\weights\detection_Resnet50_Final.pth'
Get-IfMissing 'https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth' 'gfpgan\weights\GFPGANv1.4.pth'
Get-IfMissing 'https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth' 'gfpgan\weights\parsing_parsenet.pth'
Write-Host 'Avatares listos.'
