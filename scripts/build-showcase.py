"""Encode timestamped, lossless browser PNGs without a lossy video stage."""
import hashlib
import json
from pathlib import Path
import shutil
import statistics
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs/media'
MANIFEST = ROOT / 'output/readme-showcase/manifest.json'
MAXIMUM_BYTES = 10_000_000


def concat_path(path):
    return "'" + path.as_posix().replace("'", "'\\''") + "'"


def encode(ffmpeg, clip):
    directory = ROOT / 'output/readme-showcase' / ('encode-' + clip['slug'])
    directory.mkdir(parents=True, exist_ok=True)
    timeline = directory / 'frames.ffconcat'
    lines = ['ffconcat version 1.0']
    for frame in clip['frames']:
        lines.extend([
            'file ' + concat_path(ROOT / frame['file']),
            'option framerate 100',
            f'duration {max(10, frame["duration_ms"]) / 1000:.3f}',
        ])
    lines.extend([
        'file ' + concat_path(ROOT / clip['frames'][-1]['file']),
        'option framerate 100',
    ])
    timeline.write_text('\n'.join(lines) + '\n')
    palette = directory / 'palette.png'
    common = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
    source = ['-f', 'concat', '-safe', '0', '-i', str(timeline)]
    # Two passes avoid buffering an entire retina recording in paletteuse.
    subprocess.run(common + source + [
        '-vf', 'palettegen=max_colors=256:stats_mode=full:reserve_transparent=1',
        '-frames:v', '1', str(palette),
    ], check=True)
    destination = MEDIA / (clip['slug'] + '.gif')
    subprocess.run(common + source + [
        '-i', str(palette),
        '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle',
        '-fps_mode', 'vfr', '-enc_time_base', '1:100',
        '-loop', '0', '-gifflags', '+transdiff', str(destination),
    ], check=True)
    return destination


def main():
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('FFmpeg is required to encode the lossless browser PNGs.')
    manifest = json.loads(MANIFEST.read_text())
    MEDIA.mkdir(parents=True, exist_ok=True)
    for clip in manifest['clips']:
        source_frames = clip['frames']
        destination = encode(ffmpeg, clip)
        with Image.open(ROOT / clip['poster']) as poster:
            expected = (clip['output_width'], clip['viewport']['height'] * clip['device_scale_factor'])
            if poster.size != expected:
                raise SystemExit(f'Unexpected source size for {clip["slug"]}: {poster.size}')
            # Preserve all raster detail. README displays this at half intrinsic size.
            poster.save(MEDIA / (clip['slug'] + '.png'), optimize=True)
        delays = []
        with Image.open(destination) as gif:
            if gif.info.get('loop') != 0:
                raise SystemExit(f'{destination.name} must loop indefinitely')
            for index in range(gif.n_frames):
                gif.seek(index)
                gif.load()
                delays.append(gif.info.get('duration', 0))
            dimensions = gif.size
            encoded_count = gif.n_frames
        moving_delays = [delay for delay in delays if 0 < delay <= 125]
        clip['source_frames'] = source_frames
        clip['frames'] = encoded_count
        clip.update(
            width=dimensions[0], height=dimensions[1],
            duration_ms=sum(delays),
            minimum_frame_duration_ms=min(delays),
            median_motion_frame_duration_ms=statistics.median(moving_delays),
            maximum_reading_hold_ms=max(delays),
            gif=str(destination.relative_to(ROOT)),
            bytes=destination.stat().st_size,
            sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
            poster='docs/media/' + clip['slug'] + '.png',
        )
        if clip['bytes'] > MAXIMUM_BYTES:
            raise SystemExit(f'{destination.name} exceeds the 10 MB quality budget: {clip["bytes"]:,} bytes')
        print(
            f'{destination.name}: {clip["bytes"]:,} bytes, '
            f'{encoded_count} variable-duration frames, {sum(delays) / 1000:.1f}s, '
            f'{dimensions[0]}×{dimensions[1]}, '
            f'motion median {clip["median_motion_frame_duration_ms"]}ms, '
            f'capture {clip["measured_capture_fps"]}fps',
            flush=True,
        )
    manifest['encoding'] = (
        'Lossless 2x PNG source; no WebM, JPEG or spatial resizing. '
        '256-colour GIF with no dithering, source timestamps rounded to GIF '
        'centiseconds, unchanged frames represented as reading holds, and '
        'frame-difference compression. No synthetic frames or interpolation.'
    )
    manifest['display'] = 'Desktop 2240px assets at 1120px display width; mobile 780px assets at 390px.'
    manifest['reproduction'] = [
        '.venv/bin/python tests/serve_concept_fixture.py --port 8788',
        'node scripts/capture-showcase.cjs',
        '.venv/bin/python scripts/build-showcase.py',
    ]
    (MEDIA / 'showcase-provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
