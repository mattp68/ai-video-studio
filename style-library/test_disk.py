import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import disk

path = Path(__file__).resolve().parents[1] / 'scripts/studio.py'
spec = importlib.util.spec_from_file_location('studio_media', path)
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class CopyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.source = self.root / 'take.mov'
        self.source.write_bytes(b'original footage' * 1000)
        os.utime(self.source, (1_700_000_000, 1_700_000_000))

    def tearDown(self):
        self.tmp.cleanup()

    def test_copy_matches_original_and_changing_it_leaves_the_original_alone(self):
        target = self.root / 'raw/take.mov'
        target.parent.mkdir()
        how = disk.copy_file(self.source, target)
        self.assertIn(how, {'clone', 'copy'})
        self.assertEqual(target.read_bytes(), self.source.read_bytes())
        self.assertEqual(int(target.stat().st_mtime), 1_700_000_000)
        with target.open('r+b') as handle:
            handle.write(b'CHANGED')
        self.assertTrue(self.source.read_bytes().startswith(b'original footage'))

    def test_falls_back_to_an_ordinary_copy_when_the_disk_cannot_clone(self):
        target = self.root / 'copy.mov'
        with patch.object(disk, '_try_clone', return_value=False):
            self.assertEqual(disk.copy_file(self.source, target), 'copy')
        self.assertEqual(target.read_bytes(), self.source.read_bytes())

    def test_never_overwrites(self):
        target = self.root / 'existing.mov'
        target.write_bytes(b'keep me')
        with self.assertRaises(FileExistsError):
            disk.copy_file(self.source, target)
        self.assertEqual(target.read_bytes(), b'keep me')

    def test_tree_leaves_out_named_folders_at_any_depth_and_keeps_links(self):
        source = self.root / 'v01'
        (source / 'assets').mkdir(parents=True)
        (source / 'assets/plate.mp4').write_bytes(b'plate')
        (source / 'index.html').write_text('<main></main>')
        (source / '.scratch').mkdir()
        (source / '.scratch/f-0001.png').write_bytes(b'frame')
        (source / 'assets/.scratch').mkdir()
        (source / 'assets/.scratch/matte.png').write_bytes(b'matte')
        (source / 'link.mp4').symlink_to('assets/plate.mp4')
        summary = disk.copy_tree(source, self.root / 'v02', skip=(disk.SCRATCH,), symlinks=True)
        target = self.root / 'v02'
        self.assertEqual((target / 'assets/plate.mp4').read_bytes(), b'plate')
        self.assertFalse((target / '.scratch').exists())
        self.assertFalse((target / 'assets/.scratch').exists())
        self.assertTrue((target / 'link.mp4').is_symlink())
        self.assertEqual(summary['cloned'] + summary['copied'], 2)
        self.assertEqual(summary['skipped'], ['.scratch'])


class RenderSpaceTests(unittest.TestCase):
    def test_only_renders_are_checked(self):
        self.assertIsNone(disk.render_space_warning(['preview', 'demo'], 10, free=lambda _: 0))
        self.assertIsNone(disk.render_space_warning([], 10, free=lambda _: 0))

    def test_warns_in_plain_language_when_space_is_low(self):
        message = disk.render_space_warning(['render', 'demo', '--output', 'out.mp4'], 10, free=lambda _: 3e9)
        self.assertIn('3.0 GB free', message)
        self.assertIn('clean --dry-run', message)
        self.assertIsNone(disk.render_space_warning(['render', 'demo'], 10, free=lambda _: 50e9))

    def test_threshold_can_be_changed_or_turned_off_and_never_blocks(self):
        with patch.dict(os.environ, {'AI_VIDEO_STUDIO_MIN_FREE_GB': '0'}):
            self.assertIsNone(disk.render_space_warning(['render', 'demo'], free=lambda _: 0))
        with patch.dict(os.environ, {'AI_VIDEO_STUDIO_MIN_FREE_GB': '2'}):
            self.assertIsNone(disk.render_space_warning(['render', 'demo'], free=lambda _: 3e9))

        def broken(_):
            raise OSError('unavailable')
        self.assertIsNone(disk.render_space_warning(['render', 'demo'], 10, free=broken))


class NewVersionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.version = self.root / 'projects/demo/assembly-v01'
        (self.version / 'assets').mkdir(parents=True)
        (self.version / 'index.html').write_text('<main data-composition-id="demo"></main>')
        (self.version / 'assets/voice.wav').write_bytes(b'voice')
        for folder in ['.scratch', '.hyperframes', 'node_modules', '.thumbnails']:
            (self.version / folder).mkdir()
            (self.version / folder / 'file').write_bytes(b'regenerable')
        self.patch = patch.object(studio, 'ROOT', self.root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def run_new_version(self, source, name=None):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            studio.new_version(SimpleNamespace(source=source, name=name))

    def test_next_version_names_keep_their_padding(self):
        self.assertEqual(studio.next_version_name('assembly-v01'), 'assembly-v02')
        self.assertEqual(studio.next_version_name('assembly-v09'), 'assembly-v10')
        self.assertEqual(studio.next_version_name('storyboard-v1'), 'storyboard-v2')
        self.assertEqual(studio.next_version_name('assembly-v99'), 'assembly-v100')
        with self.assertRaises(ValueError):
            studio.next_version_name('final')

    def test_creates_the_next_version_without_regenerable_folders(self):
        self.run_new_version(self.version)
        created = self.root / 'projects/demo/assembly-v02'
        self.assertEqual((created / 'assets/voice.wav').read_bytes(), b'voice')
        self.assertIn('data-composition-id', (created / 'index.html').read_text())
        for folder in ['.scratch', '.hyperframes', 'node_modules', '.thumbnails']:
            self.assertFalse((created / folder).exists(), folder)
        self.assertTrue((self.version / '.scratch/file').exists())

    def test_named_versions_and_refusals(self):
        self.run_new_version(self.version, name='assembly-v01-alt')
        self.assertTrue((self.root / 'projects/demo/assembly-v01-alt/index.html').exists())
        with self.assertRaises(ValueError):
            self.run_new_version(self.version, name='assembly-v01-alt')
        with self.assertRaises(ValueError):
            self.run_new_version(self.version, name='../escape')
        with self.assertRaises(ValueError):
            self.run_new_version(self.root / 'projects/demo')
        outside = self.root / 'elsewhere-v01'
        outside.mkdir()
        with self.assertRaises(ValueError):
            self.run_new_version(outside)


class IngestTests(unittest.TestCase):
    def test_ingest_keeps_the_original_and_records_the_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            project = root / 'projects/demo'
            (project / 'raw').mkdir(parents=True)
            (project / 'media-manifest.json').write_text(json.dumps({'version': 1, 'sources': []}))
            original = root / 'Downloads/take.mov'
            original.parent.mkdir()
            original.write_bytes(b'footage')
            with patch.object(studio, 'probe', return_value={'format': {}}), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                studio.ingest(SimpleNamespace(project=project, source=original))
            self.assertEqual((project / 'raw/take.mov').read_bytes(), b'footage')
            self.assertEqual(original.read_bytes(), b'footage')
            manifest = json.loads((project / 'media-manifest.json').read_text())
            self.assertEqual(manifest['sources'][0]['file'], 'raw/take.mov')
            with self.assertRaises(ValueError):
                with patch.object(studio, 'probe', return_value={'format': {}}):
                    studio.ingest(SimpleNamespace(project=project, source=original))


if __name__ == '__main__':
    unittest.main()
