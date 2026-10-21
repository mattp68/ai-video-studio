"""Release exports fail closed when a private or symlinked file is added to the list."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'scripts/export_release.py'
spec=importlib.util.spec_from_file_location('release_export',path)
export=importlib.util.module_from_spec(spec);spec.loader.exec_module(export)

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.patch=patch.object(export,'ROOT',self.root);self.patch.start()
        (self.root/'README.md').write_text('A clean project.')
    def tearDown(self):self.patch.stop();self.tmp.cleanup()
    def select(self,text):(self.root/'release-files.txt').write_text(text)
    def test_exact_allowlist_omits_unlisted_owner_data(self):
        (self.root/'private.mp4').write_bytes(b'private fixture')
        self.select('README.md\n')
        self.assertEqual([n for n,_ in export.sources()],['README.md'])
    def test_private_registry_media_and_credentials_are_rejected(self):
        legacy=self.root/'style-library/references/demo/intake.md';legacy.parent.mkdir(parents=True);legacy.write_text('Private reference notes')
        for name in ['style-library/catalog.json','projects/demo/STATUS.md','references/demo/source.mp4','style-library/references/demo/intake.md','.env','secret.key','../outside.md']:
            self.select(name+'\n')
            with self.subTest(name=name),self.assertRaises(ValueError):export.sources()
    def test_symlinks_and_duplicate_paths_are_rejected(self):
        (self.root/'alias.md').symlink_to(self.root/'README.md')
        for value in ['alias.md\n','README.md\nREADME.md\n']:
            self.select(value)
            with self.assertRaises(ValueError):export.sources()
    def test_secret_candidate_stops_export(self):
        (self.root/'README.md').write_text('sk-'+'x'*30)
        self.select('README.md\n')
        with self.assertRaisesRegex(ValueError,'Credential candidate'):export.sources()
