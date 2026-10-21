"""Project handoff boundaries: stale notes, explicit files, confinement and seekable previews."""
import copy
import hashlib
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import project_index as index
from serve import Handler


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class ProjectsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.project = self.root / 'projects' / 'demo'
        self.project.mkdir(parents=True)
        (self.project / 'STATUS.md').write_text('Review V02; V01 accepted.')
        (self.project / 'review.mp4').write_bytes(b'0123456789')
        (self.project / 'unregistered.txt').write_text('Never serve by guessed filename.')
        self.record = {
            'id': 'demo', 'primary_artifact': 'review', 'state': 'review',
            'source_notes': [{'label': 'Status', 'path': 'STATUS.md',
                              'sha256': hashlib.sha256((self.project / 'STATUS.md').read_bytes()).hexdigest()}],
            'artifacts': [{'id': 'review', 'type': 'video', 'path': 'review.mp4', 'role': 'current'}],
        }
        self.registry = self.root / 'projects.json'
        self.save()
        self.patches = [patch.object(index, 'STUDIO', self.root), patch.object(index, 'REGISTRY', self.registry)]
        for p in self.patches:
            p.start()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = f'127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    def save(self):
        self.registry.write_text(json.dumps({'schema_version': 1, 'projects': [self.record]}))

    def request(self, path, method='GET', **headers):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        c.request(method, path, headers=headers)
        r = c.getresponse()
        result = (r.status, dict(r.getheaders()), r.read())
        c.close()
        return result

    def test_changed_status_flags_snapshot_without_inventing_new_approval(self):
        self.assertFalse(index.public_index()['projects'][0]['stale'])
        (self.project / 'STATUS.md').write_text('A new experiment needs review.')
        p = index.public_index()['projects'][0]
        self.assertTrue(p['stale'])
        self.assertEqual(p['state'], 'review')
        with self.assertRaisesRegex(ValueError, 'Stale navigation'):
            index.validate()

    def test_missing_file_is_visible_as_unavailable(self):
        (self.project / 'review.mp4').unlink()
        a = index.public_index()['projects'][0]['artifacts'][0]
        self.assertFalse(a['available'])
        self.assertNotIn('url', a)

    def test_only_registered_numeric_slots_and_bounded_indexes(self):
        self.assertEqual(self.request('/project-files/demo/1')[0], 200)
        for suffix in ['-1', '2', '01', 'review.mp4', 'unregistered.txt', '1/extra', '..%2fSTATUS.md']:
            self.assertEqual(self.request('/project-files/demo/' + suffix)[0], 404, suffix)
        self.assertEqual(self.request('/project-files/unknown/0')[0], 404)

    def test_outside_absolute_and_symlink_paths_rejected(self):
        outside = self.root / 'outside.txt'
        outside.write_text('Outside the requested project.')
        (self.project / 'escape.txt').symlink_to(outside)
        for value in ['../outside.txt', str(outside), 'escape.txt']:
            self.record['artifacts'][0]['path'] = value
            self.save()
            self.assertEqual(self.request('/project-files/demo/1', method='HEAD')[0], 404, value)

    def test_project_routes_reject_untrusted_host_origin_and_fetch_site(self):
        for path in ['/projects.json', '/project-files/demo/1']:
            for headers in [{'Host': 'example.invalid'}, {'Origin': 'https://example.invalid'},
                            {'Sec-Fetch-Site': 'cross-site'}]:
                self.assertEqual(self.request(path, method='HEAD', **headers)[0], 403)
            self.assertEqual(self.request(path, Origin='http://' + self.host)[0], 200)

    def test_preview_range_and_explicit_content_type(self):
        status, headers, body = self.request('/project-files/demo/1', Range='bytes=2-5')
        self.assertEqual((status, body, headers['Content-Type']), (206, b'2345', 'video/mp4'))
        self.assertEqual(headers['Content-Range'], 'bytes 2-5/10')
        self.assertEqual(self.request('/project-files/demo/1', Range='bytes=12-')[0], 416)
        self.assertTrue(self.request('/project-files/demo/0')[1]['Content-Type'].startswith('text/plain'))

    def test_empty_setup_and_duplicate_registry_validation(self):
        self.registry.unlink()
        self.assertEqual(index.public_index()['projects'], [])
        self.save()
        data = json.loads(self.registry.read_text())
        data['projects'].append(copy.deepcopy(self.record))
        self.registry.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Duplicate project'):
            index.validate()


if __name__ == '__main__':
    unittest.main()
