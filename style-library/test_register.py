"""Registration order: new projects list first, replacements stay put, references still append."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import library
import project_index as index

path = Path(__file__).resolve().parents[1] / 'scripts/register.py'
spec = importlib.util.spec_from_file_location('studio_register', path)
register = importlib.util.module_from_spec(spec)
spec.loader.exec_module(register)


class RegisterOrderTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base = self.root / 'style-library'
        self.base.mkdir()
        self.registry = self.base / 'projects.json'
        self.registry.write_text(json.dumps({'schema_version': 1, 'projects': [
            {'id': 'recent', 'title': 'Recent'}, {'id': 'middle', 'title': 'Middle'}, {'id': 'oldest', 'title': 'Oldest'}]}))
        self.patches = [patch.object(register, 'ROOT', self.root), patch.object(library, 'BASE', self.base),
                        patch.object(index, 'STUDIO', self.root), patch.object(index, 'REGISTRY', self.registry)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    def descriptor(self, slug, title):
        project = self.root / 'projects' / slug
        project.mkdir(parents=True, exist_ok=True)
        (project / 'STATUS.md').write_text('Review V01.')
        (project / 'review.mp4').write_bytes(b'synthetic fixture')
        manifest = project / 'studio-entry.json'
        manifest.write_text(json.dumps({
            'id': slug, 'title': title, 'format': 'video', 'summary': 'Synthetic fixture.', 'next_step': 'Review V01.',
            'state': 'review', 'stage': 'edit', 'primary_artifact': 'review',
            'source_notes': [{'label': 'Status', 'path': 'STATUS.md'}],
            'artifacts': [{'id': 'review', 'label': 'Review', 'type': 'video', 'version': 'v01',
                           'path': 'review.mp4', 'role': 'current'}]}))
        return manifest

    def projects(self):
        return json.loads(self.registry.read_text())['projects']

    def test_new_projects_are_listed_first(self):
        register.register('project', self.descriptor('newer', 'Newer'))
        register.register('project', self.descriptor('newest', 'Newest'))
        self.assertEqual([p['id'] for p in self.projects()], ['newest', 'newer', 'recent', 'middle', 'oldest'])

    def test_replacement_keeps_its_position(self):
        register.register('project', self.descriptor('middle', 'Middle, revised'), replace=True)
        projects = self.projects()
        self.assertEqual([p['id'] for p in projects], ['recent', 'middle', 'oldest'])
        self.assertEqual(projects[1]['title'], 'Middle, revised')

    def test_existing_id_without_replace_changes_nothing(self):
        before = self.registry.read_bytes()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            register.register('project', self.descriptor('middle', 'Middle, revised'))
        self.assertEqual(self.registry.read_bytes(), before)

    def test_new_references_still_append(self):
        catalog = self.base / 'catalog.json'
        catalog.write_text(json.dumps({'schema_version': 4, 'entries': [{'id': 'saved-earlier'}], 'techniques': []}))
        poster = self.base / 'dist' / 'assets' / 'fixture.png'
        poster.parent.mkdir(parents=True)
        poster.write_bytes(b'synthetic poster')
        manifest = self.root / 'reference.json'
        manifest.write_text(json.dumps({
            'id': 'saved-later', 'title': 'Saved later', 'subtitle': 'Fixture', 'version': 'v1', 'collection': 'reference',
            'creator': 'Fixture creator', 'creator_id': 'fixture-creator', 'summary': 'Synthetic fixture.', 'tags': [],
            'palette': [], 'traits': [], 'keep': [], 'avoid': [], 'moments': [], 'notes': [],
            'poster': 'assets/fixture.png', 'evidence': 'Synthetic fixture.'}))
        register.register('reference', manifest)
        self.assertEqual([e['id'] for e in json.loads(catalog.read_text())['entries']], ['saved-earlier', 'saved-later'])


if __name__ == '__main__':
    unittest.main()
