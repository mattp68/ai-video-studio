"""Creator packs end to end with synthetic studios: build, install, serve, reinstall, upgrade, remove.

Every studio here is a temporary fixture with synthetic bytes standing in for media. Nothing reads
or writes a real owner studio.
"""
import contextlib
import copy
import hashlib
import http.client
from http.server import ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import threading
import unittest
import zipfile
from unittest.mock import patch

import creator_packs as packs
import library
import project_index as index
import review_actions as storage
import saved_collections
import serve
import technique_upkeep

PACK = 'creator-pack-1'
STAMP = '2026-11-01T00:00:00+00:00'


def png(seed):
    return b'\x89PNG\r\n\x1a\n' + hashlib.sha256(seed.encode()).digest() * 8


def video(seed, size=8192):
    return b'\x00\x00\x00\x18ftypisom' + hashlib.sha256(seed.encode()).digest() * (size // 32)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Fixture:
    def __init__(self, root):
        self.root = root
        self.base = root / 'style-library'
        (self.base / 'dist' / 'assets').mkdir(parents=True)

    def write(self, relative, data):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data if isinstance(data, bytes) else data.encode())
        return path

    def json(self, relative, value):
        return self.write(relative, json.dumps(value, indent=2) + '\n')

    def read(self, relative):
        return json.loads((self.root / relative).read_text())

    @contextlib.contextmanager
    def active(self):
        patches = [patch.object(index, 'STUDIO', self.root), patch.object(index, 'REGISTRY', self.base / 'projects.json'),
                   patch.object(storage, 'BASE', self.base), patch.object(storage, 'CATALOG', self.base / 'catalog.json'),
                   patch.object(storage, 'JOURNALS', self.base / 'runtime' / 'review-actions'),
                   patch.object(library, 'BASE', self.base), patch.object(library, 'STUDIO', self.root),
                   patch.object(serve, 'BASE', self.base), patch.object(serve, 'STUDIO', self.root)]
        for p in patches:
            p.start()
        try:
            yield self
        finally:
            for p in reversed(patches):
                p.stop()


def example(id, style, start, end, at, media, digest, version):
    return {'id': id, 'style_id': style, 'start': start, 'end': end, 'poster_at': at, 'label': f'Example {id}',
            'poster': f'assets/techniques/{id}.png', 'evidence': f'Observed {id} in the export.',
            'source_version': version, 'source_path': media, 'source_sha256': digest}


def author_studio(root):
    """The pack author's studio: two own videos, one other creator's reference, one personal collection."""
    s = Fixture(root)
    orbit, captions, other = video('orbit-v02'), video('captions-v01'), video('other')
    media = {'demo-orbit': 'projects/demo-orbit/exports/orbit-v02.mp4',
             'demo-captions': 'projects/demo-captions/exports/captions-v01.mp4',
             'other-creator': 'references/other-creator/source.mp4'}
    for key, data in [('demo-orbit', orbit), ('demo-captions', captions), ('other-creator', other)]:
        s.write(media[key], data)
        s.write(f'style-library/dist/assets/posters/{key}.png', png(key))
    s.write('projects/demo-orbit/exports/orbit-v02.music-credit.txt', 'Example Groove by Example Artist\nLicensed under CC BY 4.0\n')
    s.write('projects/demo-orbit/assembly-v02/index.html', '<!doctype html><title>orbit</title>')
    s.write('projects/demo-orbit/assembly-v02/asset-ledger.csv',
            'asset,type,source,sha256,rights\n'
            'assets/audio/voice.wav,audio,Author speech,abc,Author speech / original effects / CC BY music where mixed\n'
            'assets/audio/tick.wav,audio,Local synthesis,def,Original local synthesis; no third-party samples\n')
    s.write('projects/demo-orbit/STATUS.md', 'Private status')
    entries = [
        {'id': 'demo-orbit', 'title': 'Orbit demo', 'subtitle': 'Final V02', 'version': 'V02', 'creator': 'Test Author',
         'creator_id': 'test-author', 'creator_handle': 'testauthor', 'collection': 'mine',
         'summary': 'Cards orbit the speaker.', 'media_path': media['demo-orbit'], 'project_id': 'demo-orbit',
         'duration': 20.0, 'source_sha256': sha(orbit), 'poster': 'assets/posters/demo-orbit.png', 'poster_at': 4.0,
         'palette': ['#112233'], 'tags': ['Orbit'], 'traits': {'Sound': 'Quiet CC BY groove under the voice.'},
         'keep': ['Keep the face clear.'], 'avoid': [], 'moments': [{'time': 5.0, 'label': 'Cards enter'}],
         'notes': ['projects/demo-orbit/STATUS.md'], 'evidence': 'Approved V02 after review.',
         'composition': 'projects/demo-orbit/assembly-v02/index.html', 'review_status': 'preferred',
         'delivery_status': 'final', 'approval': {'request_id': 'private', 'files': []},
         'source_url': 'https://www.instagram.com/reel/DEMO123/'},
        {'id': 'demo-captions', 'title': 'Caption demo', 'subtitle': '', 'version': 'V01', 'creator': 'Test Author',
         'creator_id': 'test-author', 'collection': 'mine', 'summary': 'Captions build word by word.',
         'media_path': media['demo-captions'], 'duration': 12.0, 'source_sha256': sha(captions),
         'poster': 'assets/posters/demo-captions.png', 'palette': [], 'tags': [], 'traits': {}, 'keep': [], 'avoid': [],
         'moments': [], 'notes': [], 'evidence': 'Own edit.', 'review_status': 'preferred'},
        {'id': 'other-creator', 'title': 'Someone else', 'subtitle': '', 'version': 'REF', 'creator': 'Someone Else',
         'creator_id': 'someone-else', 'collection': 'reference', 'summary': 'Not ours.', 'media_path': media['other-creator'],
         'duration': 10.0, 'source_sha256': sha(other), 'poster': 'assets/posters/other-creator.png', 'palette': [],
         'tags': [], 'traits': {}, 'keep': [], 'avoid': [], 'moments': [], 'notes': [], 'evidence': 'Reference.'},
    ]
    digests = {'demo-orbit': sha(orbit), 'demo-captions': sha(captions), 'other-creator': sha(other)}
    versions = {'demo-orbit': 'V02', 'demo-captions': 'V01', 'other-creator': 'REF'}
    rows = [('tech-orbit', 'orbit-demo', 'demo-orbit', 2, 6, 4), ('tech-orbit', 'orbit-other', 'other-creator', 1, 3, 2),
            ('tech-captions', 'captions-demo', 'demo-captions', 1, 4, 2),
            ('tech-captions', 'captions-demo-two', 'demo-captions', 6, 9, 7)]
    families = {}
    for fid, xid, style, start, end, at in rows:
        family = families.setdefault(fid, {
            'id': fid, 'title': fid.removeprefix('tech-').title(), 'category': 'Video layouts',
            'summary': f'{fid} summary', 'direction': f'{fid} direction', 'aliases': [fid], 'keep': ['Adapt it.'],
            'avoid': ['Copying footage.'], 'evidence': 'Grouped by visible behavior.', 'default_example': xid, 'examples': []})
        family['examples'].append(example(xid, style, start, end, at, media[style], digests[style], versions[style]))
        s.write(f'style-library/dist/assets/techniques/{xid}.png', png(xid))
    s.json('style-library/catalog.json', {'schema_version': 4, 'entries': entries, 'techniques': list(families.values())})
    save_collection(s, [('example', 'tech-orbit', 'orbit-demo'), ('example', 'tech-captions', 'captions-demo'),
                        ('reference', 'demo-captions'), ('moment', 'demo-orbit', 5.0)])
    s.write('LICENSE-pack.txt', '# Creator Pack license\nCopyright (c) 2026 Test Author.\nPersonal use in your own videos. No redistribution or resale.\n')
    return s


def save_collection(s, items, name='Creator Pack 1'):
    catalog = s.read('style-library/catalog.json')
    members = []
    for item in items:
        raw = ({'kind': 'example', 'technique_id': item[1], 'example_id': item[2]} if item[0] == 'example' else
               {'kind': item[0], 'reference_id': item[1], **({'time': item[2]} if item[0] == 'moment' else {})})
        members.append(saved_collections.resolve(raw, catalog, False))
    s.json('style-library/collections.json', {'schema_version': 1, 'requests': {}, 'collections': [
        {'id': 'col-11111111-1111-4111-8111-111111111111', 'name': name, 'kind': 'personal', 'members': members,
         'created_at': STAMP, 'history': []}]})


def buyer_studio(root):
    """A buyer's populated studio with its own video, a same-named technique family and private records."""
    s = Fixture(root)
    mine = video('buyer-own')
    s.write('projects/my-video/exports/v01.mp4', mine)
    s.write('projects/my-video/STATUS.md', 'Buyer status')
    s.write('style-library/dist/assets/posters/my-video.png', png('my-video'))
    s.write('style-library/dist/assets/techniques/my-orbit.png', png('my-orbit'))
    s.json('style-library/catalog.json', {'schema_version': 4, 'entries': [
        {'id': 'my-video', 'title': 'My video', 'subtitle': '', 'version': 'V01', 'collection': 'mine', 'creator': 'Buyer',
         'creator_id': 'buyer', 'summary': 'My own edit.', 'media_path': 'projects/my-video/exports/v01.mp4',
         'project_id': 'my-video', 'duration': 8.0, 'source_sha256': sha(mine), 'poster': 'assets/posters/my-video.png',
         'palette': [], 'tags': [], 'traits': {}, 'keep': [], 'avoid': [], 'moments': [],
         'notes': ['projects/my-video/STATUS.md'], 'evidence': 'Mine.', 'review_status': 'preferred',
         'technique_review_sha256': sha(mine)}],
        'techniques': [{'id': 'tech-orbit', 'title': 'My orbit', 'category': 'Layouts', 'summary': 'Mine.', 'direction': 'Mine.',
                        'aliases': [], 'keep': [], 'avoid': [], 'evidence': 'Mine.', 'default_example': 'my-orbit',
                        'examples': [example('my-orbit', 'my-video', 1, 3, 2, 'projects/my-video/exports/v01.mp4', sha(mine), 'V01')]}],
        'removed_references': {'gone-video': {'removed_at': STAMP}}})
    s.json('style-library/runtime/source-evidence.json',
           [{'id': 'my-video', 'source': 'projects/my-video/exports/v01.mp4', 'version': 'V01', 'source_sha256': sha(mine)}])
    s.json('style-library/projects.json', {'schema_version': 1, 'projects': [{'id': 'my-video', 'title': 'My video', 'state': 'final'}]})
    s.json('style-library/reference-notes.json', {'schema_version': 1, 'notes': [
        {'id': '22222222-2222-4222-8222-222222222222', 'reference_id': 'my-video', 'example_id': None, 'text': 'Keep my pacing.'}]})
    catalog = s.read('style-library/catalog.json')
    member = saved_collections.resolve({'kind': 'example', 'technique_id': 'tech-orbit', 'example_id': 'my-orbit'}, catalog, False)
    s.json('style-library/collections.json', {'schema_version': 1, 'requests': {}, 'collections': [
        {'id': 'col-33333333-3333-4333-8333-333333333333', 'name': 'My hooks', 'kind': 'personal', 'members': [member],
         'created_at': STAMP, 'history': []}]})
    return s


OWNER_FILES = ['style-library/projects.json', 'style-library/reference-notes.json',
               'projects/my-video/STATUS.md', 'projects/my-video/exports/v01.mp4']


class PackTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.tmp = Path(self.temp.name).resolve()
        self.author = author_studio(self.tmp / 'author')
        self.buyer = buyer_studio(self.tmp / 'buyer')
        self.out = self.tmp / 'out'
        self.out.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def build(self, version='1.0.0', name=None, **kw):
        out = self.out / (name or f'{PACK}-{version}.zip')
        return packs.build(self.author.root, 'Creator Pack 1', out, PACK, version, self.author.root / 'LICENSE-pack.txt',
                           author_url='https://example.com/kit', **kw), out

    def install(self, path, **kw):
        with self.buyer.active():
            return packs.install(path, **kw)

    def owner_snapshot(self):
        catalog = self.buyer.read('style-library/catalog.json')
        personal = [c for c in self.buyer.read('style-library/collections.json')['collections'] if c['kind'] == 'personal']
        mine = [e for e in catalog['entries'] if not e.get('pack')]
        return ({name: (self.buyer.root / name).read_bytes() for name in OWNER_FILES},
                personal, mine, catalog.get('removed_references'))

    def assert_untouched(self, before):
        self.assertEqual(self.owner_snapshot(), before)

    def pack_files(self):
        folder = self.buyer.root / 'references' / f'pack-{PACK}'
        return sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()) if folder.exists() else []


class BuildTests(PackTestCase):
    def test_build_is_deterministic_and_exports_exactly_the_collection(self):
        report, first = self.build()
        _, second = self.build(name='again.zip')
        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(report['sha256'], sha(first.read_bytes()))
        with zipfile.ZipFile(first) as z:
            manifest = json.loads(z.read('pack.json'))
            data = json.loads(z.read('library.json'))
            names = z.namelist()
            self.assertTrue(all(i.date_time == (1980, 1, 1, 0, 0, 0) and i.compress_type == zipfile.ZIP_STORED for i in z.infolist()))
        self.assertEqual(names[0], 'pack.json')
        self.assertEqual((manifest['pack_id'], manifest['name'], manifest['version']), (PACK, 'Creator Pack 1', '1.0.0'))
        self.assertEqual(manifest['author'], {'name': 'Test Author', 'creator_id': 'test-author', 'url': 'https://example.com/kit'})
        self.assertIn('No redistribution', manifest['license']['summary'])
        self.assertEqual({f['path'] for f in manifest['files']} | {'pack.json'}, set(names))
        examples = sorted(x['id'] for f in data['techniques'] for x in f['examples'])
        self.assertEqual(examples, [f'{PACK}-captions-demo', f'{PACK}-orbit-demo'])
        self.assertEqual(sorted(e['id'] for e in data['entries']), [f'{PACK}-demo-captions-v01', f'{PACK}-demo-orbit-v02'])
        raw = json.dumps(data)
        for private in ['approval', 'project_id', 'composition', 'STATUS.md', 'review_status', 'other-creator', 'Someone Else']:
            self.assertNotIn(private, raw)
        self.assertEqual(len(data['members']), 4)
        self.assertEqual(report['families_with_several_examples'], {})
        self.assertEqual(manifest['license']['summary'], 'Personal use in your own videos. No redistribution or resale.')
        self.assertEqual(report['warnings'], packs.build(self.author.root, 'Creator Pack 1', None, PACK, '1.0.0',
                                                         self.author.root / 'LICENSE-pack.txt', dry_run=True)['warnings'])

    def test_other_creators_media_is_refused(self):
        save_collection(self.author, [('example', 'tech-orbit', 'orbit-demo'), ('example', 'tech-orbit', 'orbit-other')])
        with self.assertRaisesRegex(packs.PackError, 'another creator'):
            self.build()
        self.assertEqual(list(self.out.iterdir()), [])

    def test_music_and_unverified_licensing_are_flagged(self):
        report, _ = self.build()
        text = '\n'.join(report['warnings'])
        self.assertIn('has music (Example Groove', text)
        self.assertIn('CC BY music where mixed', text)
        self.assertNotIn('no third-party samples', text)
        self.assertIn('Caption demo (V01): not linked to a project', text)
        with self.assertRaisesRegex(packs.PackError, 'strict'):
            self.build(name='strict.zip', strict=True)

    def test_changed_member_must_be_saved_again(self):
        catalog = self.author.read('style-library/catalog.json')
        catalog['techniques'][0]['examples'][0]['end'] = 7
        self.author.json('style-library/catalog.json', catalog)
        with self.assertRaisesRegex(packs.PackError, 'Save it to the collection again'):
            self.build()

    def test_overrides_and_recipes(self):
        overrides = self.author.json('overrides.json', {
            'entries': {'demo-orbit': {'summary': 'Buyer-facing summary.', 'source_url': None}},
            'techniques': {'tech-orbit': {'title': 'Orbiting cards'}},
            'examples': {'tech-orbit@orbit-demo': {'label': 'Five cards orbit'}}})
        recipes = self.tmp / 'recipes'
        (recipes / 'tech-orbit' / 'assets').mkdir(parents=True)
        (recipes / 'tech-orbit' / 'index.html').write_text('<!doctype html><div class="orbit"></div>')
        (recipes / 'tech-orbit' / 'assets' / 'card.png').write_bytes(png('card'))
        (recipes / 'tech-orbit' / '.DS_Store').write_bytes(b'junk')
        (recipes / 'tech-orbit' / 'assets' / 'author-take.mp4').write_bytes(video('take'))
        report, path = self.build(overrides=overrides, recipes=recipes)
        self.assertIn('leave out your footage', ' '.join(report['warnings']))
        with zipfile.ZipFile(path) as z:
            data = json.loads(z.read('library.json'))
            names = z.namelist()
        orbit = next(f for f in data['techniques'] if f['id'] == f'tech-{PACK}-orbit')
        self.assertEqual(orbit['title'], 'Orbiting cards')
        self.assertEqual(orbit['examples'][0]['label'], 'Five cards orbit')
        self.assertTrue(orbit['recipe'].startswith(f'recipes/tech-{PACK}-orbit-'))
        self.assertIn(orbit['recipe'] + '/index.html', names)
        self.assertNotIn(orbit['recipe'] + '/.DS_Store', names)
        entry = next(e for e in data['entries'] if e['id'] == f'{PACK}-demo-orbit-v02')
        self.assertEqual(entry['summary'], 'Buyer-facing summary.')
        self.assertNotIn('source_url', entry)
        self.assertEqual(report['recipes'], 1)
        bad = self.author.json('bad-overrides.json', {'entries': {'demo-orbit': {'media_path': 'x'}}})
        with self.assertRaisesRegex(packs.PackError, 'may change only'):
            self.build(name='bad.zip', overrides=bad)


class InstallTests(PackTestCase):
    def test_install_end_to_end_into_a_populated_studio(self):
        _, path = self.build()
        before = self.owner_snapshot()
        report = self.install(path)
        self.assertEqual(report['action'], 'install')
        self.assertTrue(report['validation']['ok'], report['validation'])
        self.assertEqual(report['added'], {'videos': 2, 'techniques': 2, 'examples': 2})
        self.assert_untouched(before)
        catalog = self.buyer.read('style-library/catalog.json')
        entry = next(e for e in catalog['entries'] if e['id'] == f'{PACK}-demo-orbit-v02')
        self.assertEqual(entry['collection'], 'reference')
        self.assertEqual(entry['creator'], 'Test Author')
        self.assertTrue(entry['media_path'].startswith(f'references/pack-{PACK}/media/'))
        self.assertEqual(entry['notes'], [f'references/pack-{PACK}/README.md', f'references/pack-{PACK}/LICENSE.txt'])
        self.assertEqual(entry['pack'], {'id': PACK, 'name': 'Creator Pack 1'})
        self.assertEqual(entry['technique_review_sha256'], entry['source_sha256'])
        families = {t['id']: t for t in catalog['techniques']}
        self.assertEqual(families['tech-orbit']['title'], 'My orbit')
        self.assertEqual([x['id'] for x in families[f'tech-{PACK}-orbit']['examples']], [f'{PACK}-orbit-demo'])
        collections = self.buyer.read('style-library/collections.json')['collections']
        pack = next(c for c in collections if c['kind'] == 'pack')
        self.assertEqual((pack['pack_id'], pack['name'], pack['pack_version']), (PACK, 'Creator Pack 1', '1.0.0'))
        self.assertEqual([m['kind'] for m in pack['members']], ['example', 'example', 'reference', 'moment'])
        with self.buyer.active():
            for member in pack['members']:
                saved_collections.resolve(member, catalog, require_snapshot=True)
            self.assertNotIn(f'reference:{PACK}-demo-orbit-v02', {i['id'] for i in technique_upkeep.discover()['items']})
            brief = library.reference_brief([f'tech-{PACK}-orbit@{PACK}-orbit-demo'])
            self.assertIn(f'references/pack-{PACK}/LICENSE.txt', brief)
            self.assert_served(entry)
        self.assertEqual(self.buyer.read('style-library/packs.json')['packs'][PACK]['version'], '1.0.0')

    def assert_served(self, entry):
        server = ThreadingHTTPServer(('127.0.0.1', 0), serve.Handler)
        server.RequestHandlerClass.log_message = lambda *a: None
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            host = f'127.0.0.1:{server.server_port}'
            for path, expected in [(f'/media/{entry["id"]}', self.buyer.root / entry['media_path']),
                                   ('/' + entry['poster'], self.buyer.base / 'dist' / entry['poster']),
                                   (f'/notes/{entry["id"]}/1', self.buyer.root / entry['notes'][1])]:
                conn = http.client.HTTPConnection(host)
                conn.request('GET', path)
                response = conn.getresponse()
                self.assertEqual((path, response.status), (path, 200))
                self.assertEqual(response.read(), expected.read_bytes())
                conn.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_each_pack_family_stays_its_own_card_beside_same_titled_families(self):
        catalog = self.buyer.read('style-library/catalog.json')
        catalog['techniques'][0]['title'] = 'Orbit'  # Same title as the pack's family.
        self.buyer.json('style-library/catalog.json', catalog)
        _, path = self.build()
        self.install(path)
        families = self.buyer.read('style-library/catalog.json')['techniques']
        orbit = [t for t in families if t['title'] == 'Orbit']
        self.assertEqual(sorted(t['id'] for t in orbit), sorted(['tech-orbit', f'tech-{PACK}-orbit']))
        pack = {t['id']: [x['id'] for x in t['examples']] for t in families if t.get('pack')}
        self.assertEqual(pack, {f'tech-{PACK}-orbit': [f'{PACK}-orbit-demo'], f'tech-{PACK}-captions': [f'{PACK}-captions-demo']})
        self.assertEqual(next(t for t in families if t['id'] == 'tech-orbit')['examples'][0]['id'], 'my-orbit')

    def test_reinstall_is_idempotent_and_repairs_a_missing_file(self):
        _, path = self.build()
        self.install(path)
        files = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file() and 'review-actions' not in p.parts}
        report = self.install(path)
        self.assertEqual(report['action'], 'unchanged')
        after = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file() and 'review-actions' not in p.parts}
        self.assertEqual(files, after)
        media = next((self.buyer.root / f'references/pack-{PACK}/media').iterdir())
        media.unlink()
        report = self.install(path)
        self.assertEqual((report['action'], report['copy']['files']), ('reinstall', 1))
        self.assertTrue(media.exists())

    def test_unzipped_folder_installs_the_same_way(self):
        _, path = self.build()
        folder = self.tmp / 'unzipped'
        with zipfile.ZipFile(path) as z:
            z.extractall(folder)
        (folder / '.DS_Store').write_bytes(b'finder')
        report = self.install(folder)
        self.assertEqual(report['action'], 'install')
        self.assertTrue(report['validation']['ok'])
        self.assertEqual(self.install(path)['action'], 'unchanged')

    def test_upgrade_keeps_unchanged_links_and_retires_dropped_files(self):
        _, v1 = self.build()
        self.install(v1)
        catalog = self.buyer.read('style-library/catalog.json')
        orbit = next(t for t in catalog['techniques'] if t['id'] == f'tech-{PACK}-orbit')
        dropped = next(t for t in catalog['techniques'] if t['id'] == f'tech-{PACK}-captions')
        collections = self.buyer.read('style-library/collections.json')
        personal = collections['collections'][0]
        for family, xid in [(orbit, f'{PACK}-orbit-demo'), (dropped, f'{PACK}-captions-demo')]:
            personal['members'].append(saved_collections.resolve(
                {'kind': 'example', 'technique_id': family['id'], 'example_id': xid}, catalog, False))
        pack = next(c for c in collections['collections'] if c['kind'] == 'pack')
        pack['deleted_at'] = STAMP  # The buyer hid the pack collection.
        self.buyer.json('style-library/collections.json', collections)
        before = self.owner_snapshot()
        old_poster = self.buyer.base / 'dist' / dropped['examples'][0]['poster']
        captions_media = self.buyer.root / next(e['media_path'] for e in catalog['entries'] if e['id'] == f'{PACK}-demo-captions-v01')
        save_collection(self.author, [('example', 'tech-orbit', 'orbit-demo'), ('moment', 'demo-orbit', 5.0)])
        _, v2 = self.build('1.1.0')
        report = self.install(v2)
        self.assertEqual((report['action'], report['previous_version']), ('upgrade', '1.0.0'))
        self.assertEqual(report['removed'], {'videos': 1, 'examples': 1})
        self.assertEqual(report['saved_items_affected'], {'personal_collection_items': 1, 'reference_notes': 0})
        self.assertTrue(report['validation']['ok'], report['validation'])
        self.assert_untouched(before)
        self.assertFalse(old_poster.exists())
        self.assertFalse(captions_media.exists())
        catalog = self.buyer.read('style-library/catalog.json')
        self.assertNotIn(f'tech-{PACK}-captions', {t['id'] for t in catalog['techniques']})
        with self.buyer.active():
            saved_collections.resolve(personal['members'][1], catalog, require_snapshot=True)
        pack = next(c for c in self.buyer.read('style-library/collections.json')['collections'] if c['kind'] == 'pack')
        self.assertEqual(pack['deleted_at'], STAMP)
        self.assertEqual((len(pack['members']), pack['pack_version'], pack['history'][-1]['action']), (2, '1.1.0', 'pack-upgrade'))
        self.assertEqual(self.install(v2)['action'], 'unchanged')
        with self.assertRaisesRegex(packs.PackError, 'older'):
            self.install(v1)
        self.assertEqual(self.install(v1, allow_downgrade=True)['action'], 'downgrade')

    def test_changed_video_bytes_move_to_a_new_path(self):
        _, v1 = self.build()
        self.install(v1)
        old = self.buyer.root / next(e['media_path'] for e in self.buyer.read('style-library/catalog.json')['entries']
                                     if e['id'] == f'{PACK}-demo-captions-v01')
        catalog = self.author.read('style-library/catalog.json')
        fresh = video('captions-v01-reexport')
        self.author.write('projects/demo-captions/exports/captions-v01b.mp4', fresh)
        entry = next(e for e in catalog['entries'] if e['id'] == 'demo-captions')
        entry.update(media_path='projects/demo-captions/exports/captions-v01b.mp4', source_sha256=sha(fresh))
        for x in catalog['techniques'][1]['examples']:
            x.update(source_path=entry['media_path'], source_sha256=sha(fresh))
        self.author.json('style-library/catalog.json', catalog)
        save_collection(self.author, [('example', 'tech-orbit', 'orbit-demo'), ('example', 'tech-captions', 'captions-demo'),
                                      ('reference', 'demo-captions'), ('moment', 'demo-orbit', 5.0)])
        _, v2 = self.build('1.0.1')
        report = self.install(v2)
        self.assertEqual(report['updated']['videos'], 1)
        self.assertTrue(report['validation']['ok'], report['validation'])
        self.assertFalse(old.exists())
        new = next(e for e in self.buyer.read('style-library/catalog.json')['entries'] if e['id'] == f'{PACK}-demo-captions-v01')
        self.assertEqual(sha((self.buyer.root / new['media_path']).read_bytes()), sha(fresh))

    def test_records_that_are_not_the_packs_are_never_taken_over(self):
        _, path = self.build()
        catalog = self.buyer.read('style-library/catalog.json')
        clash = copy.deepcopy(catalog['entries'][0])
        clash['id'] = f'{PACK}-demo-orbit-v02'
        catalog['entries'].append(clash)
        self.buyer.json('style-library/catalog.json', catalog)
        before = (self.buyer.base / 'catalog.json').read_bytes()
        with self.assertRaisesRegex(packs.PackError, 'already has a record'):
            self.install(path)
        self.assertEqual((self.buyer.base / 'catalog.json').read_bytes(), before)
        self.assertEqual(self.pack_files(), [])
        self.assertFalse((self.buyer.base / 'packs.json').exists())

    def test_local_edits_to_pack_records_need_explicit_replacement(self):
        _, path = self.build()
        self.install(path)
        catalog = self.buyer.read('style-library/catalog.json')
        next(e for e in catalog['entries'] if e.get('pack'))['title'] = 'Renamed by the buyer'
        self.buyer.json('style-library/catalog.json', catalog)
        _, v2 = self.build('1.0.1')
        with self.assertRaisesRegex(packs.PackError, 'changed in this studio'):
            self.install(v2)
        with self.assertRaisesRegex(packs.PackError, 'changed in this studio'):
            with self.buyer.active():
                packs.remove(PACK)
        report = self.install(v2, replace_local_edits=True)
        self.assertIn('Replaced pack records', ' '.join(report['warnings']))

    def test_owner_examples_in_a_pack_family_survive_upgrade_and_removal(self):
        _, path = self.build()
        self.install(path)
        catalog = self.buyer.read('style-library/catalog.json')
        family = next(t for t in catalog['techniques'] if t['id'] == f'tech-{PACK}-orbit')
        mine = next(e for e in catalog['entries'] if e['id'] == 'my-video')
        family['examples'].append(example('my-second-orbit', 'my-video', 4, 6, 5, mine['media_path'], mine['source_sha256'], 'V01'))
        self.buyer.write('style-library/dist/assets/techniques/my-second-orbit.png', png('mine-2'))
        self.buyer.json('style-library/catalog.json', catalog)
        _, v2 = self.build('1.0.1')
        self.install(v2)
        family = next(t for t in self.buyer.read('style-library/catalog.json')['techniques'] if t['id'] == f'tech-{PACK}-orbit')
        self.assertIn('my-second-orbit', [x['id'] for x in family['examples']])
        with self.buyer.active():
            report = packs.remove(PACK)
        self.assertEqual(report['kept_families_with_your_examples'], [f'tech-{PACK}-orbit'])
        self.assertTrue(report['validation']['ok'], report['validation'])
        family = next(t for t in self.buyer.read('style-library/catalog.json')['techniques'] if t['id'] == f'tech-{PACK}-orbit')
        self.assertEqual(([x['id'] for x in family['examples']], family['default_example']), (['my-second-orbit'], 'my-second-orbit'))
        self.assertNotIn('pack', family)
        again = self.install(v2)
        self.assertTrue(again['validation']['ok'], again['validation'])
        family = next(t for t in self.buyer.read('style-library/catalog.json')['techniques'] if t['id'] == f'tech-{PACK}-orbit')
        self.assertEqual([x['id'] for x in family['examples']], [f'{PACK}-orbit-demo', 'my-second-orbit'])
        self.assertEqual(family['pack']['id'], PACK)

    def test_remove_then_reinstall_restores_the_same_ids(self):
        _, path = self.build()
        first = self.install(path)
        before = self.owner_snapshot()
        with self.buyer.active():
            self.assertTrue(packs.remove(PACK, dry_run=True)['dry_run'])
            self.assertTrue(self.pack_files())
            report = packs.remove(PACK)
        self.assertEqual(report['removed']['videos'], 2)
        self.assertTrue(report['validation']['ok'], report['validation'])
        self.assert_untouched(before)
        self.assertEqual(self.pack_files(), [])
        self.assertFalse((self.buyer.base / f'dist/assets/techniques/packs/{PACK}').exists())
        catalog = self.buyer.read('style-library/catalog.json')
        self.assertFalse([e for e in catalog['entries'] if e.get('pack')])
        self.assertEqual(catalog['removed_references'], {'gone-video': {'removed_at': STAMP}})
        pack = next(c for c in self.buyer.read('style-library/collections.json')['collections'] if c['kind'] == 'pack')
        self.assertTrue(pack['deleted_at'] and pack['pack_removed_at'])
        with self.buyer.active():
            self.assertEqual(packs.installed(), {'packs': []})
        again = self.install(path)
        self.assertEqual(again['collection']['id'], first['collection']['id'])
        self.assertFalse(again['collection']['hidden'])
        self.assertIn(f'{PACK}-demo-orbit-v02', {e['id'] for e in self.buyer.read('style-library/catalog.json')['entries']})

    def test_failed_save_leaves_no_copied_files(self):
        _, path = self.build()
        before = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}
        with patch.object(storage, 'commit', side_effect=storage.ReviewError('disk full', 503)):
            with self.assertRaises(storage.ReviewError):
                self.install(path)
        self.assertEqual({p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}, before)

    def test_install_is_undone_when_the_library_stops_validating(self):
        _, path = self.build()
        before = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}
        results = iter([{'ok': True}, {'ok': False, 'error': 'synthetic failure'}])
        with patch.object(packs, 'validation', side_effect=lambda: next(results)):
            with self.assertRaisesRegex(packs.PackError, 'undone'):
                self.install(path)
        after = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file() and 'review-actions' not in p.parts}
        self.assertEqual(after, before)

    def test_dry_run_changes_nothing(self):
        _, path = self.build()
        before = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}
        report = self.install(path, dry_run=True)
        self.assertTrue(report['dry_run'])
        self.assertGreater(report['copy']['files'], 0)
        self.assertEqual({p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}, before)


class UnsafePackTests(PackTestCase):
    def setUp(self):
        super().setUp()
        _, self.good = self.build()
        with zipfile.ZipFile(self.good) as z:
            self.files = {name: z.read(name) for name in z.namelist()}

    def repack(self, files, fix_manifest=True, infos=None):
        files = dict(files)
        if fix_manifest:
            manifest = json.loads(files['pack.json'])
            manifest['files'] = sorted(({'path': n, 'bytes': len(b), 'sha256': sha(b)} for n, b in files.items() if n != 'pack.json'),
                                       key=lambda r: r['path'])
            files['pack.json'] = json.dumps(manifest).encode()
        path = self.tmp / f'bad-{len(list(self.tmp.glob("bad-*")))}.zip'
        with zipfile.ZipFile(path, 'w') as z:
            for name, data in files.items():
                z.writestr(name, data)
            for info, data in infos or []:
                z.writestr(info, data)
        return path

    def assert_rejected(self, path, message):
        before = {p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}
        with self.assertRaisesRegex(packs.PackError, message):
            self.install(path)
        self.assertEqual({p: p.read_bytes() for p in self.buyer.root.rglob('*') if p.is_file()}, before)

    def media(self):
        return next(n for n in self.files if n.startswith('media/'))

    def test_tampered_bytes_fail_their_checksum(self):
        files = dict(self.files)
        files[self.media()] = files[self.media()][:-1] + b'!'
        self.assert_rejected(self.repack(files, fix_manifest=False), 'checksum')

    def test_unexpected_missing_and_oversized_files(self):
        self.assert_rejected(self.repack(self.files | {'notes.txt': b'hi'}, fix_manifest=False), 'Unexpected file')
        self.assert_rejected(self.repack(self.files | {'media/extra.mp4': video('x')}), 'Unexpected file')
        files = dict(self.files)
        del files[self.media()]
        self.assert_rejected(self.repack(files, fix_manifest=False), 'missing files')
        manifest = json.loads(self.files['pack.json'])
        next(r for r in manifest['files'] if r['path'] == self.media())['bytes'] = 5 * 10**9
        self.assert_rejected(self.repack(self.files | {'pack.json': json.dumps(manifest).encode()}, fix_manifest=False), 'too large')
        manifest['files'] = json.loads(self.files['pack.json'])['files']
        next(r for r in manifest['files'] if r['path'] == self.media())['bytes'] -= 10
        self.assert_rejected(self.repack(self.files | {'pack.json': json.dumps(manifest).encode()}, fix_manifest=False), 'does not match')

    def test_unsafe_paths_links_and_duplicates(self):
        for name in ['../escape.txt', '/etc/escape.txt', 'media/..', 'media\\evil.mp4', 'C:/evil.mp4', 'media/CON.mp4',
                     'media/.hidden.mp4', 'media/trailing.', '__MACOSX/._pack.json']:
            with self.subTest(name=name):
                info = zipfile.ZipInfo('placeholder')
                info.filename = name
                self.assert_rejected(self.repack(self.files, infos=[(info, b'x')]), 'Unsafe path|Unexpected')
        link = zipfile.ZipInfo('media/link.mp4')
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.assert_rejected(self.repack(self.files, infos=[(link, b'/etc/passwd')]), 'link or special')
        folder = zipfile.ZipInfo('media/sub/')
        self.assert_rejected(self.repack(self.files, infos=[(folder, b'')]), 'folder entry')
        upper = self.media().replace('media/', 'MEDIA/')
        self.assert_rejected(self.repack(self.files, infos=[(zipfile.ZipInfo(upper), b'x')]), 'repeats a file name')

    def test_records_outside_the_pack_namespace_are_rejected(self):
        for change, message in [
            (lambda d: d['entries'][0].update(id='my-video'), "must start with"),
            (lambda d: d['techniques'][0].update(id='tech-orbit'), "must start with"),
            (lambda d: d['entries'][0].update(creator='Someone Else'), 'own video'),
            (lambda d: d['entries'][0].update(palette=['red;background:url(https://x)']), 'hex'),
            (lambda d: d['entries'][0].update(media_path='projects/my-video/exports/v01.mp4'), 'unknown fields'),
            (lambda d: d['techniques'][0]['examples'][0].update(end=999), 'window'),
            (lambda d: d['members'].append({'kind': 'reference', 'reference_id': 'my-video'}), 'missing video'),
        ]:
            with self.subTest(message=message):
                data = json.loads(self.files['library.json'])
                change(data)
                self.assert_rejected(self.repack(self.files | {'library.json': json.dumps(data).encode()}), message)

    def test_folder_with_a_symlink_is_rejected(self):
        folder = self.tmp / 'linked'
        with zipfile.ZipFile(self.good) as z:
            z.extractall(folder)
        os.symlink(self.buyer.root / 'style-library/catalog.json', folder / 'media' / 'sneaky.mp4')
        self.assert_rejected(folder, 'link or special')

    def test_path_rules(self):
        for good in ['media/a-b_c.1.mp4', 'recipes/tech-x-1/assets/card.png']:
            packs.archive_parts(good)
        for bad in ['', 'a//b', 'aux.txt', 'lpt1', 'a/b:c', 'x' * 101, 'a/ b']:
            with self.subTest(bad=bad), self.assertRaises(packs.PackError):
                packs.archive_parts(bad)

    def test_verify_reports_contents_without_installing(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            import importlib.util
            spec = importlib.util.spec_from_file_location('pack_cli', Path(__file__).resolve().parents[1] / 'scripts/pack.py')
            cli = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cli)
            cli.main(['verify', str(self.good)])
        report = json.loads(out.getvalue())
        self.assertEqual((report['pack_id'], report['videos'], report['examples'], report['verified']), (PACK, 2, 2, True))
        self.assertEqual(report['archive_sha256'], sha(self.good.read_bytes()))


if __name__ == '__main__':
    unittest.main()
