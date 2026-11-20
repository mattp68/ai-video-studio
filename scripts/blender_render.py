"""Render one storyboard-approved Blender shot into a version folder as a single B-roll clip.

Use it only for shots docs/WORKFLOW.md sends to Blender. The scene is a trusted .py
script that builds the scene without rendering (see examples/blender-check/scene.py)
or a .blend file; scripts embedded in a .blend stay disabled.

  --estimate  Render two sample frames and print an estimated render time for the
              storyboard. The sample still is kept in .scratch to show the look.
  (default)   Render every frame into <version>/.scratch/blender/<name>/, encode
              <version>/assets/blender/<name>.mp4 (.webm with --alpha), check it,
              write a small <name>.json render record and remove the frames, so only
              the final clip is kept. An existing clip is never overwritten.
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

from setup import ROOT, blender_capability

sys.path.insert(0, str(ROOT / 'style-library'))
import disk  # noqa: E402

NAME = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
SCENE_TYPES = {'.py', '.blend'}

# Runs inside Blender after the scene is built and before it renders: fixes the frame
# format and records the scene's own frame rate, range and size for the encoder. For
# an estimate it then narrows the render to two sample frames from the middle.
SETTINGS = '''
import bpy, json, time
scene = bpy.context.scene
render = scene.render
render.image_settings.file_format = "PNG"
render.image_settings.color_mode = "RGBA" if {alpha!r} else "RGB"
render.image_settings.color_depth = "8"
render.film_transparent = {alpha!r}
info = {{"fps": render.fps, "fps_base": render.fps_base, "frame_start": scene.frame_start,
        "frame_end": scene.frame_end, "frame_step": scene.frame_step,
        "width": render.resolution_x * render.resolution_percentage // 100,
        "height": render.resolution_y * render.resolution_percentage // 100,
        "engine": render.engine, "blender": bpy.app.version_string}}
if {sample!r}:
    middle = scene.frame_start + (scene.frame_end - scene.frame_start) // 2
    info["sample"] = [middle, min(middle + 1, scene.frame_end)]
    scene.frame_start, scene.frame_end = info["sample"]
info["ready_at"] = time.time()
with open({path!r}, "w") as handle:
    json.dump(info, handle)
'''


class RenderError(RuntimeError):
    pass


def duration_label(seconds):
    if seconds < 90:
        return f'about {max(1, math.ceil(seconds))} seconds'
    if seconds < 90 * 60:
        return f'about {math.ceil(seconds / 60)} minutes'
    return f'about {seconds / 3600:.1f} hours'


def frame_rate(info):
    return (Fraction(info['fps']) / Fraction(str(info['fps_base']))).limit_denominator(1001)


def blender_command(executable, scene, info_path, alpha, frames=None, sample=False):
    """Blender handles its arguments in order: build the scene, fix the settings, render."""
    command = [executable, '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1']
    command += [str(scene)] if scene.suffix == '.blend' else ['--python', str(scene)]
    command += ['--python-expr', SETTINGS.format(alpha=bool(alpha), sample=bool(sample), path=str(info_path))]
    if frames is not None:
        command += ['--render-output', str(frames / 'frame-####'), '--use-extension', '1', '--render-anim']
    return command


def encode_command(frames, start, rate, output, alpha):
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-framerate', str(rate), '-start_number', str(start),
               '-i', str(frames / 'frame-%04d.png'), '-an',
               '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=' + ('yuva420p' if alpha else 'yuv420p'),
               '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
    if alpha:  # VP9 keeps transparency and plays in the browser and in HyperFrames.
        command += ['-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-row-mt', '1', '-auto-alt-ref', '0']
    else:
        command += ['-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart']
    return command + [str(output)]


def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
                             '-show_entries', 'stream=codec_name,width,height,nb_read_frames:stream_tags',
                             '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    stream, = json.loads(result.stdout)['streams']
    tags = {key.lower(): value for key, value in stream.get('tags', {}).items()}
    return {'width': stream['width'], 'height': stream['height'], 'frames': int(stream['nb_read_frames']),
            'alpha': tags.get('alpha_mode') == '1'}


class Shot:
    def __init__(self, version, scene, name, alpha=False, capability=None):
        self.version = Path(version).resolve()
        self.scene = Path(scene).resolve()
        if not self.version.is_dir():
            raise RenderError(f'{version} is not a folder. Pass the version folder that holds (or will hold) the composition.')
        if self.scene.suffix not in SCENE_TYPES or not self.scene.is_file():
            raise RenderError(f'{scene} is not a Blender scene. Pass a .py scene script or a .blend file.')
        if not NAME.fullmatch(name):
            raise RenderError('Use a short lowercase shot name such as key-press.')
        self.name, self.alpha = name, alpha
        self.capability = capability or blender_capability()
        if not (shutil.which('ffmpeg') and shutil.which('ffprobe')):
            raise RenderError('FFmpeg and FFprobe are needed to encode the clip. See SETUP.md.')
        if self.capability['status'] != 'ready_for_smoke':
            raise RenderError('Blender is not ready: ' + self.capability['detail'] + ' It is optional; install it only '
                              'with the creator\'s OK (docs/WORKFLOW.md), or use a HyperFrames treatment instead.')
        self.clip = self.version / 'assets/blender' / (name + ('.webm' if alpha else '.mp4'))
        self.record = self.clip.with_suffix('.json')

    def scratch(self, kind='blender'):
        """A fresh .scratch/<kind>/<name> folder. It only ever holds regenerable files."""
        root = self.version / disk.SCRATCH / kind
        folder = root / self.name
        if folder.is_symlink() or (folder.exists() and not folder.resolve().is_relative_to(root.resolve())):
            raise RenderError(f'{folder} is not a plain scratch folder; inspect it before rendering.')
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir(parents=True)
        return folder

    def blender(self, folder, frames=None, sample=False):
        info_path = folder / 'scene.json'
        info_path.unlink(missing_ok=True)
        command = blender_command(self.capability['executable'], self.scene, info_path, self.alpha, frames, sample)
        with open(folder / 'blender.log', 'w') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, cwd=self.scene.parent)
        if result.returncode != 0 or not info_path.is_file():
            lines = (folder / 'blender.log').read_text(errors='replace').splitlines()[-15:]
            raise RenderError('Blender stopped with an error. Last lines of its log:\n' + '\n'.join(lines))
        info = json.loads(info_path.read_text())
        if info['frame_step'] != 1:
            raise RenderError('Set the scene frame step to 1; change the frame rate or range instead.')
        if info['width'] % 2 or info['height'] % 2:
            raise RenderError(f"Use an even width and height for video (the scene is {info['width']}x{info['height']}).")
        info['frames'] = info['frame_end'] - info['frame_start'] + 1
        if info['frames'] < 1:
            raise RenderError('The scene has no frames to render.')
        return info

    def estimate(self):
        """Render two sample frames from the middle of the shot and extrapolate."""
        folder = self.scratch('blender-estimate')
        frames = folder / 'frames'
        started = time.time()
        info = self.blender(folder, frames, sample=True)
        samples = [frames / f'frame-{n:04d}.png' for n in range(info['sample'][0], info['sample'][1] + 1)]
        if not all(path.is_file() for path in samples):
            raise RenderError('Blender did not write the sample frames; see ' + str(folder / 'blender.log'))
        startup = max(0.0, info['ready_at'] - started)
        first = max(0.0, samples[0].stat().st_mtime - info['ready_at'])  # Includes shader compilation.
        each = samples[1].stat().st_mtime - samples[0].stat().st_mtime if len(samples) > 1 else first
        total = startup + first + (info['frames'] - 1) * max(each, 0.01)
        label = duration_label(total)
        return {'name': self.name, 'tool': 'Blender ' + info['blender'], 'engine': info['engine'],
                'frames': info['frames'], 'fps': str(frame_rate(info)), 'size': f"{info['width']}x{info['height']}",
                'seconds_per_frame': round(each, 2), 'estimated_seconds': round(total),
                'estimate': label + ' on this computer', 'preview': self.relative(samples[0]),
                'storyboard_line': f"Blender render time: {label} on this computer "
                                   f"({info['frames']} frames at about {each:.1f} s each)."}

    def render(self, keep_frames=False):
        for path in (self.clip, self.record):
            if path.exists():
                raise RenderError(f'{path} already exists. Keep it, render under a new --name, or start a new '
                                  'version with python3 scripts/studio.py new-version.')
        folder = self.scratch()
        info = self.blender(folder)  # Catch scene errors and check space before the long render.
        frame_bytes = info['frames'] * info['width'] * info['height'] * (4 if self.alpha else 3)
        warning = disk.frames_space_warning(folder, frame_bytes)
        if warning:
            print(warning, file=sys.stderr)
        frames = folder / 'frames'
        started = time.time()
        info = self.blender(folder, frames)
        expected = [frames / f'frame-{n:04d}.png' for n in range(info['frame_start'], info['frame_end'] + 1)]
        missing = [path.name for path in expected if not path.is_file()]
        if missing:
            raise RenderError(f'Blender did not write {len(missing)} of {len(expected)} frames, starting with '
                              f'{missing[0]}. The frames so far are in {frames} (safe to delete).')
        rendered = time.time() - started
        encoded = folder / self.clip.name
        subprocess.run(encode_command(frames, info['frame_start'], frame_rate(info), encoded, self.alpha), check=True)
        check = probe(encoded)
        if (check['width'], check['height'], check['frames']) != (info['width'], info['height'], info['frames']):
            raise RenderError(f'The encoded clip does not match the render: {check}. The frames are in {frames}.')
        if self.alpha and not check['alpha']:
            raise RenderError('This FFmpeg build dropped the transparency while encoding VP9. Render without --alpha '
                              f'over a matching background instead. The frames are in {frames}.')
        self.clip.parent.mkdir(parents=True, exist_ok=True)
        if self.clip.exists():
            raise RenderError(f'{self.clip} appeared while rendering; nothing was replaced.')
        encoded.rename(self.clip)
        frames_size = sum(path.stat().st_size for path in expected)
        record = {'name': self.name, 'clip': self.clip.name, 'scene': self.relative(self.scene),
                  'scene_sha256': hashlib.sha256(self.scene.read_bytes()).hexdigest(),
                  'blender': info['blender'], 'engine': info['engine'], 'fps': str(frame_rate(info)),
                  'frames': info['frames'], 'frame_range': [info['frame_start'], info['frame_end']],
                  'size': f"{info['width']}x{info['height']}", 'alpha': self.alpha,
                  'codec': 'vp9 (alpha)' if self.alpha else 'h264', 'render_seconds': round(rendered),
                  'rendered_at': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        with open(self.record, 'x') as handle:
            json.dump(record, handle, indent=2)
            handle.write('\n')
        if not keep_frames:
            shutil.rmtree(folder)
        return {**record, 'clip': self.relative(self.clip), 'record': self.relative(self.record),
                'frames_removed': not keep_frames, 'frames_bytes': frames_size,
                'clip_bytes': self.clip.stat().st_size}

    def relative(self, path):
        return str(path.relative_to(self.version)) if path.is_relative_to(self.version) else str(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('version', type=Path, help='Version folder, such as projects/<slug>/edit-v02')
    parser.add_argument('--scene', type=Path, required=True, help='Scene script (.py) or .blend file')
    parser.add_argument('--name', required=True, help='Shot name, such as key-press')
    parser.add_argument('--alpha', action='store_true', help='Transparent background for an overlay (VP9 .webm)')
    parser.add_argument('--estimate', action='store_true', help='Estimate the render time for the storyboard')
    parser.add_argument('--keep-frames', action='store_true', help='Leave the frames in .scratch after encoding')
    args = parser.parse_args()
    try:
        shot = Shot(args.version, args.scene, args.name, alpha=args.alpha)
        result = shot.estimate() if args.estimate else shot.render(keep_frames=args.keep_frames)
    except (RenderError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
    print(json.dumps(result, indent=2))
    if args.estimate:
        print(result['storyboard_line'], file=sys.stderr)


if __name__ == '__main__':
    main()
