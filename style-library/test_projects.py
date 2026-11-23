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
        (self.project / 'STATUS.md').write_text('Review V02; V01 accepted.', encoding='utf-8')
        (self.project / 'review.mp4').write_bytes(b'0123456789')
        (self.project / 'unregistered.txt').write_text('Never serve by guessed filename.', encoding='utf-8')
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
        self.registry.write_text(json.dumps({'schema_version': 1, 'projects': [self.record]}), encoding='utf-8')

    def request(self, path, method='GET', **headers):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        c.request(method, path, headers=headers)
        r = c.getresponse()
        result = (r.status, dict(r.getheaders()), r.read())
        c.close()
        return result

    def test_changed_status_flags_snapshot_without_inventing_new_approval(self):
        self.assertFalse(index.public_index()['projects'][0]['stale'])
        (self.project / 'STATUS.md').write_text('A new experiment needs review.', encoding='utf-8')
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
        outside.write_text('Outside the requested project.', encoding='utf-8')
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

    def test_stable_asset_link_survives_inserting_a_new_version(self):
        url = index.public_index()['projects'][0]['artifacts'][0]['url']
        (self.project / 'new.mp4').write_bytes(b'new version')
        self.record['artifacts'].insert(0, {'id': 'new', 'type': 'video', 'path': 'new.mp4', 'role': 'history'})
        self.save()
        self.assertEqual(self.request(url)[2], b'0123456789')
        self.assertEqual(self.request(url, Range='bytes=2-5')[2], b'2345')
        self.assertEqual(self.request(url, Origin='https://example.invalid')[0], 403)

    def cover(self):
        p = index.public_index()['projects'][0]
        return {k: p[k] for k in ('cover', 'cover_video', 'cover_source') if k in p}

    def test_card_picture_falls_back_without_a_chosen_cover(self):
        # Projects registered without cover_path still show real work instead of the placeholder.
        (self.project / 'frame.jpg').write_bytes(b'storyboard frame')
        (self.project / 'poster.jpg').write_bytes(b'prepared poster')
        (self.project / 'chosen.png').write_bytes(b'chosen cover')
        (self.root / 'dist' / 'assets' / 'posters').mkdir(parents=True)
        (self.root / 'dist' / 'assets' / 'posters' / 'demo-v02.jpg').write_bytes(b'library poster')
        (self.root / 'catalog.json').write_text(json.dumps({'entries': [
            {'id': 'demo-ref', 'poster': 'assets/posters/demo-v02.jpg'},
            {'id': 'escape-ref', 'poster': '../projects.json'}]}), encoding='utf-8')

        video = self.cover()
        self.assertEqual(video['cover_source'], 'video')
        self.assertNotIn('cover', video)
        self.assertEqual(self.request(video['cover_video'])[2], b'0123456789')

        self.record['artifacts'].insert(0, {'id': 'board', 'type': 'board', 'role': 'storyboard',
                                             'frames': [{'path': 'missing.jpg'}, {'path': 'frame.jpg'}]})
        self.record['primary_artifact'] = 'board'
        self.save()
        frame = self.cover()
        self.assertEqual(frame['cover_source'], 'artifact')
        self.assertEqual(self.request(frame['cover'])[2], b'storyboard frame')

        self.record['reference_poster_source'] = 'poster.jpg'
        self.save()
        poster = self.cover()
        self.assertEqual(poster['cover_source'], 'poster')
        self.assertEqual(self.request(poster['cover'])[2], b'prepared poster')

        self.record['reference_id'] = 'escape-ref'
        self.save()
        self.assertEqual(self.cover()['cover_source'], 'poster')
        self.record['reference_id'] = 'demo-ref'
        self.save()
        self.assertEqual(self.cover(), {'cover': 'assets/posters/demo-v02.jpg', 'cover_source': 'library'})

        for chosen in ['missing.png', 'review.mp4', '../outside.jpg']:
            self.record['cover_path'] = chosen
            self.save()
            self.assertEqual(self.cover()['cover_source'], 'library', chosen)
        self.record['cover_path'] = 'chosen.png'
        self.save()
        chosen = self.cover()
        self.assertEqual(chosen['cover_source'], 'chosen')
        self.assertEqual(self.request(chosen['cover'])[2], b'chosen cover')

        del self.record['cover_path']
        self.record['cover'] = 'assets/posters/demo-v02.jpg'
        self.save()
        self.assertEqual(self.cover(), {'cover': 'assets/posters/demo-v02.jpg', 'cover_source': 'chosen'})

    def test_project_with_no_picture_keeps_the_placeholder(self):
        (self.project / 'script.md').write_text('An idea, not yet recorded.', encoding='utf-8')
        self.record['artifacts'] = [{'id': 'script', 'type': 'document', 'path': 'script.md', 'role': 'current'}]
        self.record['primary_artifact'] = 'script'
        self.record['cover'] = 'https://example.invalid/tracker.jpg'
        self.save()
        self.assertEqual(self.cover(), {})

    def test_prepared_poster_does_not_shift_existing_file_slots(self):
        before = index.files(self.record)
        (self.project / 'poster.jpg').write_bytes(b'prepared poster')
        self.record['reference_poster_source'] = 'poster.jpg'
        self.save()
        self.assertEqual(index.files(self.record)[:len(before)], before)
        self.assertEqual(self.request('/project-files/demo/1')[2], b'0123456789')

    def test_empty_setup_and_duplicate_registry_validation(self):
        self.registry.unlink()
        self.assertEqual(index.public_index()['projects'], [])
        self.save()
        data = json.loads(self.registry.read_text(encoding='utf-8'))
        data['projects'].append(copy.deepcopy(self.record))
        self.registry.write_text(json.dumps(data), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Duplicate project'):
            index.validate()


if __name__ == '__main__':
    unittest.main()
