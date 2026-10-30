"""Assemble browser captures; no synthetic or generated UI frames."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'output/demo-frames/manifest.json').read_text())
frames = []
for item in manifest['frames']:
    with Image.open(root / item['file']) as image:
        image = image.convert('RGB')
        image = image.resize((1120, 735), Image.Resampling.LANCZOS)
        frames.append(image.quantize(colors=192, method=Image.Quantize.MEDIANCUT))
frames[0].save(root / 'docs/demo.gif', save_all=True, append_images=frames[1:],
               duration=[item['duration'] for item in manifest['frames']], loop=0, optimize=True, disposal=2)
with Image.open(root / manifest['frames'][0]['file']) as image:
    image.save(root / 'docs/preview.png')
(root / 'docs/evidence').mkdir(exist_ok=True)
with Image.open(root / 'output/demo-frames/mobile.png') as image:
    image.save(root / 'docs/evidence/0.6-mobile.png')
with Image.open(root / manifest['frames'][0]['file']) as image:
    image.save(root / 'docs/evidence/0.6-desktop.png')
print('GIF bytes:', (root / 'docs/demo.gif').stat().st_size, 'Frames:', len(frames))
