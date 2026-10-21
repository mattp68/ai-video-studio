"""An existing partial smoke run must never count as completed setup."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'scripts/smoke.py'
spec=importlib.util.spec_from_file_location('studio_smoke',path)
smoke=importlib.util.module_from_spec(spec);spec.loader.exec_module(smoke)
setup_spec=importlib.util.spec_from_file_location('studio_setup',path.with_name('setup.py'))
setup=importlib.util.module_from_spec(setup_spec);setup_spec.loader.exec_module(setup)

class CapabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.patches=[patch.object(setup,'ROOT',self.root),patch.object(setup,'PY',self.root/'.venv/bin/python'),
                      patch.object(setup.shutil,'which',return_value=None),patch.object(setup,'node_supported',return_value=False),
                      patch.object(setup,'local_package_present',return_value=False),
                      patch.object(setup.platform,'system',return_value='Darwin'),patch.object(setup.platform,'machine',return_value='arm64')]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def test_fresh_checkout_reports_missing_setup_without_installing(self):
        with patch.object(setup.subprocess,'run',side_effect=AssertionError('Check must not install')):
            r=setup.capability_report()
        self.assertFalse(r['ready_for_studio']);self.assertFalse(r['ready_for_media'])
        self.assertEqual(r['capabilities']['transcription']['status'],'not_installed')
        self.assertEqual(r['capabilities']['reference_browser']['status'],'check_in_chat')
        self.assertEqual(list(self.root.iterdir()),[])
    def test_render_readiness_needs_python_image_package(self):
        cli=self.root/'node_modules/hyperframes/bin/hyperframes.mjs';cli.parent.mkdir(parents=True);cli.write_text('fixture')
        with patch.object(setup.shutil,'which',return_value='/tool'),patch.object(setup,'node_supported',return_value=True):
            self.assertFalse(setup.capability_report()['ready_for_media'])
            with patch.object(setup,'local_package_present',return_value=True):
                r=setup.capability_report()
        self.assertTrue(r['ready_for_media']);self.assertEqual(r['capabilities']['rendering']['status'],'ready_for_smoke')
        self.assertEqual(r['capabilities']['reference_browser']['status'],'check_in_chat')
    def test_studio_only_can_be_ready_without_optional_media(self):
        base=self.root/'style-library';base.mkdir()
        for name in ['catalog','projects','settings']:(base/f'{name}.json').write_text('{}')
        r=setup.capability_report();self.assertTrue(r['ready_for_studio']);self.assertFalse(r['ready_for_media'])
    def test_non_mac_does_not_claim_local_speech_support(self):
        with patch.object(setup.platform,'system',return_value='Windows'),patch.object(setup.platform,'machine',return_value='AMD64'):
            r=setup.capability_report()
        self.assertEqual(r['capabilities']['transcription']['status'],'unsupported_platform')
        self.assertIn('pilot',r['validation_scope'])

class SetupTests(unittest.TestCase):
    def test_partial_demo_is_preserved_and_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'projects/setup-demo').mkdir(parents=True)
            with patch.object(smoke,'ROOT',root),patch.object(sys,'argv',['smoke']):
                with self.assertRaisesRegex(RuntimeError,'incomplete'):smoke.main()
            self.assertTrue((root/'projects/setup-demo').is_dir())
    def test_short_run_cannot_claim_full_render_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'projects/setup-demo').mkdir(parents=True);(root/'runtime').mkdir()
            (root/'runtime/smoke-report.json').write_text(json.dumps({'raw_unchanged':True,'motion_rendered':False}))
            with patch.object(smoke,'ROOT',root),patch.object(sys,'argv',['smoke']):
                with self.assertRaisesRegex(RuntimeError,'did not complete'):smoke.main()
