"""Render a synthetic Blender clip and verify its use in a disposable HyperFrames edit."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from setup import ROOT, blender_capability


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def sample(path, select, crop):
    return run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-an',
                '-vf', f"select='{select}',crop={crop},scale=64:64",
                '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
               capture_output=True).stdout


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
        work = Path(directory)
        (work / 'assets').mkdir()
        shutil.copyfile(example / 'index.html', work / 'index.html')
        run([capability['executable'], '--background', '--factory-startup', '--disable-autoexec',
             '--python-exit-code', '1', '--python', example / 'scene.py', '--', work], timeout=180)
        insert = work / 'assets/insert.mp4'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '30', '-start_number', '1',
             '-i', work / 'frame-%04d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', insert])
        review = work / 'review.mp4'
        run([sys.executable, ROOT / 'scripts/hf.py', 'render', work, '--workers', '1',
             '--fps', '30', '--strict', '--output', review], timeout=180)
        probe = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', review],
                               capture_output=True).stdout)
        video, = probe['streams']
        if (video['width'], video['height'], int(video['nb_frames'])) != (320, 440, 12):
            raise RuntimeError('Unexpected size or frame count in the composite')
        source = sample(insert, 'eq(n,2)+eq(n,10)', '320:320:0:0')
        composite = sample(review, 'eq(n,2)+eq(n,10)', '320:320:0:60')
        stride = 64 * 64 * 3
        if len(source) != 2 * stride or len(composite) != 2 * stride:
            raise RuntimeError('Missing comparison frames')
        if sum(abs(a - b) for a, b in zip(source[:stride], source[stride:])) / stride < 2:
            raise RuntimeError('The Blender fixture did not animate')
        if sum(abs(a - b) for a, b in zip(source, composite)) / len(source) > 8:
            raise RuntimeError('The HyperFrames output did not preserve the Blender insert')
        print(f"Blender {capability['version']} rendered a 12-frame insert and passed the HyperFrames handoff.")


if __name__ == '__main__':
    main()
