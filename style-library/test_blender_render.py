"""Blender shots keep only the final clip, never overwrite one and estimate their render time.

A fake Blender runs the helper's real in-Blender settings code against a stand-in
bpy module, so these tests run in CI without Blender. scripts/blender_smoke.py
covers a real Blender render.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import blender_render  # noqa: E402

READY = {'status': 'ready_for_smoke', 'version': '5.2.2', 'executable': '/fake/blender', 'detail': ''}


def fake_bpy(scene):
    render = types.SimpleNamespace(fps=scene['fps'], fps_base=scene['fps_base'], resolution_x=scene['width'],
                                   resolution_y=scene['height'], resolution_percentage=100,
                                   engine='BLENDER_EEVEE', film_transparent=None,
                                   image_settings=types.SimpleNamespace())
    context_scene = types.SimpleNamespace(render=render, frame_start=scene['start'], frame_end=scene['end'],
                                          frame_step=scene.get('step', 1))
    return types.SimpleNamespace(context=types.SimpleNamespace(scene=context_scene),
                                 app=types.SimpleNamespace(version_string='5.2.2 LTS'))


class FakeTools:
    """Stands in for Blender, FFmpeg and FFprobe and records every command."""

    def __init__(self, scene, alpha_tag=True, blender_fails=False, frame_seconds=None):
        self.scene, self.alpha_tag, self.blender_fails = scene, alpha_tag, blender_fails
        self.frame_seconds = frame_seconds
        self.commands, self.settings, self.encoded_alpha = [], [], False

    def __call__(self, command, **kwargs):
        command = [str(part) for part in command]
        self.commands.append(command)
        if command[0] == READY['executable']:
            return self.blender(command, kwargs.get('stdout'))
        if command[0] == 'ffmpeg':
            Path(command[-1]).write_bytes(b'encoded clip')
            return subprocess.CompletedProcess(command, 0)
        if command[0] == 'ffprobe':
            alpha = self.encoded_alpha and self.alpha_tag
            stream = {'width': self.scene['width'], 'height': self.scene['height'],
                      'nb_read_frames': str(self.scene['end'] - self.scene['start'] + 1),
                      'tags': {'ALPHA_MODE': '1'} if alpha else {}}
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({'streams': [stream]}))
        raise AssertionError('Unexpected command ' + command[0])

    def blender(self, command, log):
        if self.blender_fails:
            log.write('Traceback: the scene script failed\n')
            return subprocess.CompletedProcess(command, 1)
        bpy, settings = fake_bpy(self.scene), {}
        with patch.dict(sys.modules, {'bpy': bpy}):
            exec(command[command.index('--python-expr') + 1], settings)
        self.settings.append(bpy.context.scene.render)
        self.encoded_alpha = bpy.context.scene.render.image_settings.color_mode == 'RGBA'
        if '--render-anim' in command:
            output = Path(command[command.index('--render-output') + 1])
            output.parent.mkdir(parents=True, exist_ok=True)
            ready = settings['info']['ready_at']
            scene = bpy.context.scene  # The settings code may have narrowed the range to sample frames.
            for index, frame in enumerate(range(scene.frame_start, scene.frame_end + 1)):
                path = output.parent / f'frame-{frame:04d}.png'
                path.write_bytes(b'x' * 100)
                if self.frame_seconds:
                    stamp = ready + self.frame_seconds[0] + index * self.frame_seconds[1]
                    os.utime(path, (stamp, stamp))
        return subprocess.CompletedProcess(command, 0)


class BlenderRenderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.version = Path(self.tmp.name).resolve() / 'projects/demo/edit-v02'
        (self.version / 'blender').mkdir(parents=True)
        self.scene = self.version / 'blender/key-press.py'
        self.scene.write_text('# builds the scene\n')
        self.patches = [patch.object(blender_render.shutil, 'which', return_value='/usr/bin/tool')]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.tmp.cleanup()

    def shot(self, **kwargs):
        return blender_render.Shot(self.version, self.scene, 'key-press', capability=READY, **kwargs)

    def run_with(self, tools, action):
        with patch.object(blender_render.subprocess, 'run', side_effect=tools), \
                contextlib.redirect_stderr(io.StringIO()) as errors:
            result = action()
        return result, errors.getvalue()

    def test_render_keeps_only_the_final_clip_and_a_render_record(self):
        tools = FakeTools({'fps': 30, 'fps_base': 1.001, 'width': 1920, 'height': 1080, 'start': 1, 'end': 48})
        result, _ = self.run_with(tools, lambda: self.shot().render())
        clip = self.version / 'assets/blender/key-press.mp4'
        self.assertEqual(clip.read_bytes(), b'encoded clip')
        self.assertEqual(sorted(p.name for p in clip.parent.iterdir()), ['key-press.json', 'key-press.mp4'])
        self.assertFalse((self.version / '.scratch/blender/key-press').exists())
        self.assertTrue(result['frames_removed'])
        record = json.loads((self.version / 'assets/blender/key-press.json').read_text())
        self.assertEqual((record['fps'], record['frames'], record['size'], record['alpha'], record['scene']),
                         ('30000/1001', 48, '1920x1080', False, 'blender/key-press.py'))
        self.assertEqual(record['blender'], '5.2.2 LTS')
        render = tools.commands[1]  # The first Blender run only reads the scene settings.
        self.assertNotIn('--render-anim', tools.commands[0])
        self.assertIn('--disable-autoexec', render)
        self.assertLess(render.index('--python'), render.index('--python-expr'))
        self.assertLess(render.index('--python-expr'), render.index('--render-anim'))
        frames = Path(render[render.index('--render-output') + 1]).parent
        self.assertEqual(frames, self.version / '.scratch/blender/key-press/frames')
        self.assertEqual(tools.settings[-1].image_settings.color_mode, 'RGB')
        self.assertFalse(tools.settings[-1].film_transparent)
        encode = next(c for c in tools.commands if c[0] == 'ffmpeg')
        self.assertIn('libx264', encode)
        self.assertEqual(encode[encode.index('-framerate') + 1], '30000/1001')

    def test_an_existing_clip_is_never_overwritten(self):
        clip = self.version / 'assets/blender/key-press.mp4'
        clip.parent.mkdir(parents=True)
        clip.write_bytes(b'approved shot')
        tools = FakeTools({'fps': 30, 'fps_base': 1, 'width': 64, 'height': 64, 'start': 1, 'end': 4})
        with self.assertRaisesRegex(blender_render.RenderError, 'already exists'):
            self.run_with(tools, lambda: self.shot().render())
        self.assertEqual(tools.commands, [])
        self.assertEqual(clip.read_bytes(), b'approved shot')

    def test_frames_can_be_kept_and_a_transparent_overlay_is_vp9(self):
        tools = FakeTools({'fps': 24, 'fps_base': 1, 'width': 64, 'height': 64, 'start': 10, 'end': 13})
        result, _ = self.run_with(tools, lambda: self.shot(alpha=True).render(keep_frames=True))
        self.assertEqual(result['clip'], 'assets/blender/key-press.webm')
        self.assertEqual(sorted(p.name for p in (self.version / '.scratch/blender/key-press/frames').iterdir()),
                         ['frame-0010.png', 'frame-0011.png', 'frame-0012.png', 'frame-0013.png'])
        self.assertEqual(tools.settings[-1].image_settings.color_mode, 'RGBA')
        self.assertTrue(tools.settings[-1].film_transparent)
        encode = next(c for c in tools.commands if c[0] == 'ffmpeg')
        self.assertIn('libvpx-vp9', encode)
        self.assertEqual(encode[encode.index('-start_number') + 1], '10')

    def test_lost_transparency_stops_before_saving_a_clip(self):
        tools = FakeTools({'fps': 30, 'fps_base': 1, 'width': 64, 'height': 64, 'start': 1, 'end': 4},
                          alpha_tag=False)
        with self.assertRaisesRegex(blender_render.RenderError, 'dropped the transparency'):
            self.run_with(tools, lambda: self.shot(alpha=True).render())
        self.assertFalse((self.version / 'assets/blender/key-press.webm').exists())

    def test_estimate_renders_two_middle_frames_and_extrapolates(self):
        tools = FakeTools({'fps': 30, 'fps_base': 1, 'width': 1920, 'height': 1080, 'start': 1, 'end': 100},
                          frame_seconds=(2.0, 0.5))
        result, _ = self.run_with(tools, lambda: self.shot().estimate())
        self.assertEqual(len(tools.commands), 1)
        frames = self.version / '.scratch/blender-estimate/key-press/frames'
        self.assertEqual(sorted(p.name for p in frames.iterdir()), ['frame-0050.png', 'frame-0051.png'])
        self.assertEqual((result['frames'], result['seconds_per_frame']), (100, 0.5))
        self.assertGreaterEqual(result['estimated_seconds'], 2 + 99 * 0.5 - 1)
        self.assertLess(result['estimated_seconds'], 2 + 99 * 0.5 + 5)
        self.assertEqual(result['preview'], '.scratch/blender-estimate/key-press/frames/frame-0050.png')
        self.assertIn('100 frames', result['storyboard_line'])
        self.assertFalse((self.version / 'assets').exists())

    def test_render_warns_when_the_frames_may_not_fit(self):
        tools = FakeTools({'fps': 30, 'fps_base': 1, 'width': 100, 'height': 50, 'start': 1, 'end': 10})
        with patch.object(blender_render.disk, 'frames_space_warning', return_value='Warning: low space') as check:
            _, errors = self.run_with(tools, lambda: self.shot().render())
        self.assertEqual(check.call_args.args[1], 10 * 100 * 50 * 3)
        self.assertIn('Warning: low space', errors)

    def test_unusable_scenes_and_missing_blender_are_explained(self):
        for scene, message in [({'step': 2}, 'frame step'), ({'width': 321}, 'even width')]:
            values = {'fps': 30, 'fps_base': 1, 'width': 64, 'height': 64, 'start': 1, 'end': 4, **scene}
            with self.subTest(message=message), self.assertRaisesRegex(blender_render.RenderError, message):
                self.run_with(FakeTools(values), lambda: self.shot().render())
        failing = FakeTools({'fps': 30, 'fps_base': 1, 'width': 64, 'height': 64, 'start': 1, 'end': 4},
                            blender_fails=True)
        with self.assertRaisesRegex(blender_render.RenderError, 'scene script failed'):
            self.run_with(failing, lambda: self.shot().render())
        missing = {'status': 'not_installed', 'detail': 'Optional and not part of the studio.'}
        with self.assertRaisesRegex(blender_render.RenderError, "creator's OK"):
            blender_render.Shot(self.version, self.scene, 'key-press', capability=missing)
        for name in ['Key Press', '../escape', '']:
            with self.subTest(name=name), self.assertRaisesRegex(blender_render.RenderError, 'shot name'):
                blender_render.Shot(self.version, self.scene, name, capability=READY)
        with self.assertRaisesRegex(blender_render.RenderError, 'not a Blender scene'):
            blender_render.Shot(self.version, self.version / 'index.html', 'key-press', capability=READY)

    def test_a_linked_scratch_folder_is_not_emptied(self):
        elsewhere = Path(self.tmp.name) / 'keep'
        elsewhere.mkdir()
        (elsewhere / 'important.txt').write_text('owner file')
        (self.version / '.scratch/blender').mkdir(parents=True)
        (self.version / '.scratch/blender/key-press').symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaisesRegex(blender_render.RenderError, 'not a plain scratch folder'):
            self.shot().scratch()
        self.assertEqual((elsewhere / 'important.txt').read_text(), 'owner file')

    def test_duration_labels_read_naturally(self):
        self.assertEqual(blender_render.duration_label(7.2), 'about 8 seconds')
        self.assertEqual(blender_render.duration_label(560), 'about 10 minutes')
        self.assertEqual(blender_render.duration_label(3 * 3600), 'about 3.0 hours')


if __name__ == '__main__':
    unittest.main()
