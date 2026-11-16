"""Check captured GIFs, source integrity, proportions and README fallbacks."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request
from PIL import Image, ImageChops, ImageDraw, ImageStat

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--verify-live', action='store_true',
                    help='Compare the public alias with the recorded deployment before it advances.')
args = parser.parse_args()

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs/media'
OUT = ROOT / 'output/readme-showcase/refresh-qa'
OUT.mkdir(parents=True, exist_ok=True)
manifest = json.loads((MEDIA / 'showcase-provenance.json').read_text())
readme = (ROOT / 'README.md').read_text()
walkthrough_tags = re.findall(r'<img[^>]*src="docs/media/[^\"]+\.gif"[^>]*>', readme)
assert len(walkthrough_tags) == 3
assert all('width=' in tag and 'height=' not in tag for tag in walkthrough_tags)
assert len(re.findall(r'<source media="\(prefers-reduced-motion: reduce\)"', readme)) == 3
origin = 'https://employment-agency-demo.vercel.app'
deployment = manifest['deployment']
assert deployment['origin'] == origin
assert manifest['deployment_unchanged_before_after_capture'] is True
if args.verify_live:
    with urllib.request.urlopen(origin + '/release.json', timeout=15) as response:
        assert response.geturl() == origin + '/release.json'
        assert json.load(response) == deployment['release'], 'Public alias has advanced since capture'
    for route, key in [('/discover/', 'served_html_sha256'), ('/demo/preview.json', 'preview_sha256')]:
        with urllib.request.urlopen(origin + route, timeout=15) as response:
            assert response.geturl() == origin + route
            assert hashlib.sha256(response.read()).hexdigest() == deployment[key], f'{route} changed since capture'
assert {clip['slug'] for clip in manifest['clips']} == {
    'discover-review', 'mobile-review', 'application-documents',
}, 'Capture all three walkthroughs before verifying'
report = {
    'schema_version': 1,
    'verified_at': datetime.now(timezone.utc).isoformat(),
    'capture_at': manifest['captured_at'],
    'scope': 'Validation of the refreshed three walkthroughs only; no comparisons with older application revisions.',
    'source_pipeline': manifest['source'],
    'deployment': deployment,
    'live_deployment_verified': args.verify_live,
    'encoding': manifest['encoding'],
    'checks': [
        'Capture verified that the public deployment stayed consistent from start to finish.',
        'Every captured source PNG hash and native 2x dimensions match its provenance record.',
        'Every GIF frame decoded, dimensions match source, loop is infinite, and file is below 10 MB.',
        'Static posters preserve source PNG pixels at native dimensions.',
        'All three walkthrough img tags retain width caps and omit fixed height attributes; all three reduced-motion still sources remain.',
    ],
    'poster_error_metric': 'Best matching decoded GIF frame versus its PNG poster, both resized to the intended display width using Lanczos; RGB mean squared error. This measures palette encoding error, not usability or animation smoothness.',
    'limitations': [
        'The lossless source is sampled at the measured capture rate rather than the browser refresh rate; short transitions can span only a few captured frames.',
        'GIF uses a 256-colour palette and centisecond timing. PNG posters preserve source pixels.',
        'Mobile touch input was emulated in Chromium.',
    ],
    'clips': [],
}
if args.verify_live:
    report['checks'].append('Live release marker, Opportunities HTML and public demo data match the recorded deployment.')
for clip in manifest['clips']:
    slug = clip['slug']
    width = clip['display_width']
    height = clip['viewport']['height']
    expected = (width * 2, height * 2)
    source_pixels = set()
    for source in clip['source_frames']:
        p = ROOT / source['file']
        assert hashlib.sha256(p.read_bytes()).hexdigest() == source['sha256']
        with Image.open(p) as im:
            assert im.size == expected
            source_pixels.add(hashlib.sha256(im.convert('RGB').tobytes()).hexdigest())
    poster_path = MEDIA / (slug + '.png')
    with Image.open(poster_path) as im:
        assert im.size == expected
        poster = im.convert('RGB')
    assert hashlib.sha256(poster.tobytes()).hexdigest() in source_pixels
    display_poster = poster.resize((width, height), Image.Resampling.LANCZOS)
    gif_path = MEDIA / (slug + '.gif')
    gif_bytes = gif_path.read_bytes()
    assert len(gif_bytes) < 10_000_000
    assert hashlib.sha256(gif_bytes).hexdigest() == clip['sha256']
    durations = []
    best = (float('inf'), None)
    decoded = []
    with Image.open(gif_path) as gif:
        assert gif.info.get('loop') == 0
        for index in range(gif.n_frames):
            gif.seek(index)
            gif.load()
            assert gif.size == expected
            durations.append(gif.info.get('duration', 0))
            display = gif.convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
            rms = ImageStat.Stat(ImageChops.difference(display, display_poster)).rms
            mse = sum(value * value for value in rms) / 3
            if mse < best[0]:
                best = (mse, index)
            decoded.append(display)
        frames = gif.n_frames
    assert sum(durations) == clip['duration_ms']
    assert len(decoded) == frames
    relative_actions = [(a['name'], max(0, a['at_ms'] - clip['source_frames'][0]['at_ms'])) for a in clip['actions']]
    action_samples = [(0, 'Shortlist / opening state')]
    # Action names and timing come from the actual captured journey, not an
    # assumed screen order. Sample after each action has had time to settle.
    for name, timestamp in relative_actions[1:]:
        action_samples.append((min(timestamp + 400, sum(durations) - 1), name))
    action_samples.append((sum(durations) - 250, 'Final state'))
    cols = 3 if slug == 'mobile-review' else 2
    rows = math.ceil(len(action_samples) / cols)
    sheet = Image.new('RGB', (cols * width, rows * (height + 32)), '#111214')
    draw = ImageDraw.Draw(sheet)
    for cell, (timestamp, label) in enumerate(action_samples):
        elapsed = 0
        chosen = len(decoded)-1
        for index, delay in enumerate(durations):
            if elapsed + delay > timestamp:
                chosen = index
                break
            elapsed += delay
        x, y = (cell % cols) * width, (cell // cols) * (height + 32)
        draw.text((x + 8, y + 8), f'{label} | {timestamp/1000:.2f}s | frame {chosen}', fill='white')
        sheet.paste(decoded[chosen], (x, y + 32))
    sheet.save(OUT / (slug + '-contact.png'), optimize=True)
    poster.save(OUT / (slug + '-poster.png'), optimize=True)
    mse, best_index = best
    report['clips'].append({
        'slug': slug,
        'native_dimensions_px': list(expected),
        'intended_display_dimensions_px': [width,height],
        'aspect_ratio_preserved': True,
        'gif_bytes': len(gif_bytes),
        'gif_sha256': hashlib.sha256(gif_bytes).hexdigest(),
        'png_bytes': poster_path.stat().st_size,
        'png_sha256': hashlib.sha256(poster_path.read_bytes()).hexdigest(),
        'decoded_gif_frames': frames,
        'source_png_frames_verified': len(clip['source_frames']),
        'duration_ms': sum(durations),
        'loop': 0,
        'measured_capture_fps': clip['measured_capture_fps'],
        'median_motion_frame_duration_ms': clip['median_motion_frame_duration_ms'],
        'maximum_frame_hold_ms': max(durations),
        'body_font_at_intended_display_width_px': clip['body_font_at_display_width_px'],
        'poster_best_matching_gif_frame': best_index,
        'poster_display_rgb_mse': round(mse,6),
        'poster_display_psnr_db': round(10 * math.log10(255*255/mse),2) if mse else None,
        'all_frames_decode': True,
        'poster_source_pixels_preserved': True,
    })
    print(slug, 'frames=', frames, 'MSE=',round(mse,6),'source frames=',len(clip['source_frames']),flush=True)
(MEDIA / 'quality-report.json').write_text(json.dumps(report,indent=2) + '\n')
print('Source hashes, dimensions, timing, looping, posters and width-only README markup verified. Contact sheets ready for visual review.')
