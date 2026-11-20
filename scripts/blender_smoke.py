"""Render synthetic Blender clips and verify their use in a disposable HyperFrames edit.

Exercises scripts/blender_render.py end to end in a temporary version folder: the
render-time estimate, an opaque clip and a transparent overlay, removal of the
frames from .scratch, and the HyperFrames composite. Skips when Blender is absent.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from setup import ROOT, blender_capability
from blender_render import Shot


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def sample(path, select, crop):
    return run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-an',
                '-vf', f"select='{select}',crop={crop},scale=64:64",
                '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
               capture_output=True).stdout


def difference(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / max(1, len(a))


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    capability = blender_capability()
    if capability['status'] == 'not_installed':
        print('Skipped optional Blender smoke because Blender is not installed.')
        return
    if capability['status'] != 'ready_for_smoke':
        raise SystemExit(capability['detail'])
    example = ROOT / 'examples/blender-check'
    with tempfile.TemporaryDirectory(prefix='ai-video-studio-blender-') as directory:
        work = Path(directory)  # Stands in for a project version folder.
        shutil.copyfile(example / 'index.html', work / 'index.html')
        estimate = Shot(work, example / 'scene.py', 'insert', capability=capability).estimate()
        if estimate['frames'] != 12 or not (work / estimate['preview']).is_file():
            raise RuntimeError('The render-time estimate did not report the fixture frames and preview')
        opaque = Shot(work, example / 'scene.py', 'insert', capability=capability).render()
        overlay = Shot(work, example / 'scene.py', 'overlay', alpha=True, capability=capability).render()
        for result in (opaque, overlay):
            if not result['frames_removed'] or (work / '.scratch/blender' / result['name']).exists():
                raise RuntimeError('Frames were left in .scratch after encoding')
            if not (work / result['record']).is_file():
                raise RuntimeError('Missing render record')
        if sorted(path.name for path in (work / 'assets/blender').iterdir()) != [
                'insert.json', 'insert.mp4', 'overlay.json', 'overlay.webm']:
            raise RuntimeError('Only the final clips and their records should be kept')
        review = work / 'review.mp4'
        run([sys.executable, ROOT / 'scripts/hf.py', 'render', work, '--workers', '1',
             '--fps', '30', '--strict', '--output', review], timeout=180)
        probe = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', review],
                               capture_output=True).stdout)
        video, = probe['streams']
        if (video['width'], video['height'], int(video['nb_frames'])) != (640, 440, 12):
            raise RuntimeError('Unexpected size or frame count in the composite')
        frames, stride = 'eq(n,2)+eq(n,10)', 64 * 64 * 3
        source = sample(work / opaque['clip'], frames, '320:320:0:0')
        composite = sample(review, frames, '320:320:0:60')
        if len(source) != 2 * stride or len(composite) != 2 * stride:
            raise RuntimeError('Missing comparison frames')
        if difference(source[:stride], source[stride:]) < 2:
            raise RuntimeError('The Blender fixture did not animate')
        if difference(source, composite) > 8:
            raise RuntimeError('The HyperFrames output did not preserve the Blender insert')
        # The overlay keeps the lit cube and lets the composition background show around it.
        background = bytes((0x6b, 0x3f, 0x1f)) * (64 * 64)
        overlay_corner = sample(review, 'eq(n,2)', '40:40:320:60')
        insert_corner = sample(review, 'eq(n,2)', '40:40:0:60')
        if difference(overlay_corner, background) > 8 or difference(insert_corner, background) < 16:
            raise RuntimeError('The transparent overlay did not show the composition background')
        if difference(sample(review, 'eq(n,2)', '96:96:432:172'), sample(review, 'eq(n,2)', '96:96:112:172')) > 10:
            raise RuntimeError('The transparent overlay did not preserve the Blender object')
        print(f"Blender {capability['version']} estimated, rendered an opaque insert and a transparent overlay, "
              f"kept only the final clips, and passed the HyperFrames handoff. Estimate: {estimate['estimate']}.")


if __name__ == '__main__':
    main()
