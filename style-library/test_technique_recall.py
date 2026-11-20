"""Technique recall reads a disposable synthetic studio and never writes to it."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import technique_recall as recall


def entry(id, collection='reference', creator='Other Creator', **extra):
    return {'id': id, 'title': id.replace('-', ' ').title(), 'subtitle': '', 'collection': collection, 'creator': creator,
            'creator_id': creator.lower().replace(' ', '-'), 'version': 'V01', 'media_path': f'references/{id}.mp4',
            'summary': '', 'tags': [], 'traits': {}, 'moments': [], **extra}


def example(id, style_id, label, start=1, end=3, **extra):
    return {'id': id, 'style_id': style_id, 'label': label, 'start': start, 'end': end, 'poster_at': start,
            'poster': f'assets/techniques/{id}.jpg', 'source_version': 'V01', 'source_path': f'references/{style_id}.mp4',
            'evidence': '', **extra}


def family(id, title, summary, examples, aliases=(), category='Motion', **extra):
    return {'id': id, 'title': title, 'category': category, 'summary': summary, 'direction': 'Keep it readable.',
            'aliases': list(aliases), 'keep': [], 'avoid': [], 'evidence': 'Synthetic fixture.',
            'default_example': examples[0]['id'], 'examples': examples, **extra}


class TechniqueRecallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        (self.root / 'style-library').mkdir()
        self.entries = [entry('my-launch', 'mine', 'Owner', project_id='launch'), entry('ref-zoom'), entry('ref-list'),
                        entry('pack-one-video', creator='Pack Author', pack={'id': 'pack-one', 'name': 'Pack One'}),
                        entry('ref-gone'), entry('my-old', 'mine', 'Owner', archived_from='my-launch')]
        self.techniques = [
            family('tech-checklist', 'Checklist reveal', 'Items tick off one by one as they are named.',
                   [example('list-ref', 'ref-list', 'Three pills light up as named'), example('list-mine', 'my-launch', 'Steps ticked in my app')],
                   aliases=['numbered steps']),
            family('tech-punch-zoom', 'Punch-in zoom', 'A quick zoom on a word for emphasis.',
                   [example('zoom-ref', 'ref-zoom', 'Snap zoom on the punchline')], aliases=['snap zoom'], category='Camera & transitions'),
            family('tech-before-after', 'Before & after', 'Make the change easy to compare.',
                   [example('compare-mine', 'my-launch', 'Raw take then the finished edit')], aliases=['comparison']),
            family('tech-tech-pack-orbit', 'Orbiting cards', 'Cards orbit around the speaker.',
                   [example('pack-one-orbit', 'pack-one-video', 'Five cards orbit the speaker')],
                   recipe='references/pack-pack-one/recipes/tech-pack-orbit', pack={'id': 'pack-one', 'name': 'Pack One'}),
            family('tech-removed', 'Removed glitch', 'A glitch that was removed from the library.',
                   [example('glitch-gone', 'ref-gone', 'Glitch on a removed source')]),
            family('tech-archived', 'Archived glitch', 'A glitch seen only on an earlier version.',
                   [example('glitch-old', 'my-old', 'Glitch on the earlier version')]),
        ]
        self.catalog = {'schema_version': 4, 'entries': self.entries, 'techniques': self.techniques,
                        'removed_references': {'ref-gone': {'removed_at': '2026-11-01T00:00:00Z'}},
                        'removed_technique_examples': {}}
        self.projects = [{'id': 'launch', 'title': 'Launch video', 'state': 'final', 'synced_on': '2026-11-10', 'artifacts': [], 'source_notes': []},
                         {'id': 'current', 'title': 'Current video', 'state': 'review', 'synced_on': '2026-11-19', 'artifacts': [], 'source_notes': []}]
        self.packs = {'schema_version': 1, 'packs': {'pack-one': {'license': {'title': 'Pack One license', 'summary': 'Recreate with your own footage.', 'file': 'LICENSE.txt'}}}}
        self.save()
        self.patch = patch.object(recall, 'STUDIO', self.root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def save(self):
        base = self.root / 'style-library'
        (base / 'catalog.json').write_text(json.dumps(self.catalog))
        (base / 'projects.json').write_text(json.dumps({'schema_version': 1, 'projects': self.projects}))
        (base / 'packs.json').write_text(json.dumps(self.packs))

    def ids(self, result):
        return [r['technique_id'] for r in result['results']]

    def snapshot(self):
        return {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_best_fit_first_with_exact_example_link_and_creator(self):
        result = recall.recall('A numbered list of three steps appears as I name them', recent=0)
        self.assertEqual(result['schema_version'], 1)
        top = result['results'][0]
        self.assertEqual(top['technique_id'], 'tech-checklist')
        self.assertIn('list', top['matched'])
        self.assertTrue(top['reason'].startswith('Matches'))
        first = top['examples'][0]
        self.assertEqual(first['token'], 'tech-checklist@' + first['example_id'])
        self.assertEqual(first['link'], '#technique=tech-checklist&example=' + first['example_id'])
        self.assertIsNone(first['url'])
        self.assertIn(first['source']['kind'], {'mine', 'other_creator'})
        self.assertEqual({x['source']['creator'] for x in top['examples']}, {'Other Creator', 'Owner'})
        self.assertEqual(top['used_in_my_videos'], 1)

    def test_synonyms_and_word_forms_find_the_move(self):
        self.assertEqual(self.ids(recall.recall('punch in on the joke, zooming fast', recent=0))[0], 'tech-punch-zoom')
        self.assertEqual(self.ids(recall.recall('compare my raw take with the result', recent=0))[0], 'tech-before-after')
        self.assertEqual(recall.stem('wiped'), recall.stem('wipe'))
        self.assertEqual(recall.stem('wiping'), recall.stem('wipes'))
        self.assertIn(('pop', 'out'), recall.pairs('I pop out of the frame'))

    def test_only_visible_current_examples(self):
        result = recall.recall('glitch', recent=0)
        self.assertEqual(result['results'], [])
        self.catalog['removed_technique_examples'] = {'tech-checklist@list-ref': {'removed_at': '2026-11-02T00:00:00Z'}}
        self.techniques[1]['examples'][0]['source_version'] = 'V00'
        self.save()
        result = recall.recall('numbered list steps snap zoom', recent=0, examples=5)
        self.assertNotIn('tech-punch-zoom', self.ids(result))
        checklist = next(r for r in result['results'] if r['technique_id'] == 'tech-checklist')
        self.assertEqual([x['example_id'] for x in checklist['examples']], ['list-mine'])
        self.assertEqual(result['library']['all_examples'], 7)

    def test_recent_projects_rank_lower_and_can_be_turned_off(self):
        query = 'before and after comparison of the edit, then a numbered list'
        self.assertEqual(self.ids(recall.recall(query, recent=0))[0], 'tech-before-after')
        lowered = recall.recall(query, project_id='current')
        self.assertEqual(lowered['recent_projects'], ['launch'])
        before = next(r for r in lowered['results'] if r['technique_id'] == 'tech-before-after')
        self.assertEqual(before['recently_used_in'], [{'project_id': 'launch', 'title': 'Launch video'}])
        self.assertIn('recent project “Launch video”', before['reason'])
        self.assertLess(before['score'], next(r for r in recall.recall(query, recent=0)['results'] if r['technique_id'] == 'tech-before-after')['score'])
        # The project being planned is never its own recent project.
        self.assertEqual(recall.recall(query, project_id='launch')['recent_projects'], ['current'])

    def test_storyboard_picks_plans_and_note_links_count_as_used(self):
        folder = self.root / 'projects/current'
        folder.mkdir(parents=True)
        (folder / 'STORYBOARD.md').write_text('Beat 2: [Snap zoom](http://127.0.0.1:4870/#technique=tech-punch-zoom&example=zoom-ref)')
        (folder / 'technique-plan.json').write_text(json.dumps({'schema_version': 1, 'plans': [{'examples': [{'family': {'id': 'tech-tech-pack-orbit'}, 'example': {}}]}]}))
        self.projects[1]['source_notes'] = [{'path': 'STORYBOARD.md', 'label': 'Storyboard', 'sha256': 'x'},
                                            {'path': '../launch/escape.md', 'label': 'Outside', 'sha256': 'x'}]
        self.projects[1]['artifacts'] = [{'id': 'board', 'type': 'board', 'frames': [{'path': 'f.png', 'title': 'Hook', 'technique': {'technique_id': 'tech-checklist'}}]}]
        self.save()
        used = recall.families_in_project(self.projects[1], self.catalog, {t['id'] for t in self.techniques})
        self.assertEqual(used, {'tech-punch-zoom', 'tech-tech-pack-orbit', 'tech-checklist'})
        result = recall.recall('snap zoom on the punchline', project_id='current')
        self.assertTrue(result['results'][0]['in_this_project'])
        self.assertIn('already picked in this project', result['results'][0]['reason'])
        elsewhere = recall.recall('snap zoom on the punchline', project_id='launch')
        self.assertEqual(elsewhere['results'][0]['recently_used_in'][0]['project_id'], 'current')

    def test_pack_techniques_carry_license_and_recipe(self):
        result = recall.recall('cards orbit around me', recent=0)
        top = result['results'][0]
        self.assertEqual(top['technique_id'], 'tech-tech-pack-orbit')
        self.assertEqual(top['pack'], {'id': 'pack-one', 'name': 'Pack One', 'license_file': 'references/pack-pack-one/LICENSE.txt',
                                       'license_summary': 'Recreate with your own footage.'})
        self.assertEqual(top['recipe'], 'references/pack-pack-one/recipes/tech-pack-orbit')
        self.assertEqual(top['examples'][0]['source']['kind'], 'pack')
        self.assertEqual(top['examples'][0]['source']['pack_id'], 'pack-one')
        self.assertIn('installed pack Pack One', top['reason'])

    def test_source_filter_and_exclusions(self):
        query = 'numbered list of steps'
        mine = recall.recall(query, recent=0, source='mine')
        self.assertEqual({x['source']['kind'] for r in mine['results'] for x in r['examples']}, {'mine'})
        self.assertEqual(recall.recall('cards orbit', recent=0, source='others')['results'], [])
        self.assertNotIn('tech-checklist', self.ids(recall.recall(query, recent=0, exclude=['tech-checklist'])))
        kept = recall.recall(query, recent=0, exclude=['tech-checklist@list-ref'], examples=5)['results'][0]
        self.assertEqual([x['example_id'] for x in kept['examples']], ['list-mine'])

    def test_beats_prefer_variety(self):
        result = recall.recall(beats=['A numbered list of steps', 'Another numbered list of steps'], recent=0)
        first, second = result['beats']
        self.assertEqual([first['beat'], second['beat']], [1, 2])
        self.assertEqual(first['results'][0]['technique_id'], 'tech-checklist')
        repeat = next(r for r in second['results'] if r['technique_id'] == 'tech-checklist')
        self.assertEqual(repeat['also_top_for_beats'], [1])
        self.assertLess(repeat['score'], first['results'][0]['score'])
        self.assertNotIn('results', result)

    def test_empty_library_and_no_meaningful_words(self):
        self.assertEqual(recall.recall('the and of it', recent=0)['results'], [])
        self.catalog['techniques'] = []
        self.save()
        result = recall.recall('numbered list', recent=0)
        self.assertEqual((result['results'], result['library']['techniques']), ([], 0))
        for name in ['catalog.json', 'projects.json', 'packs.json']:
            (self.root / 'style-library' / name).unlink()
        self.assertEqual(recall.recall('numbered list')['results'], [])

    def test_rejects_invalid_requests(self):
        cases = [dict(query='x', limit=0), dict(query='x', limit=21), dict(query='x', examples=6), dict(query='x', recent=-1),
                 dict(query='x', limit=True), dict(query='x', source='everyone'), dict(query='x', project_id='../x'),
                 dict(query='x', project_id='missing'), dict(query='x', exclude=['orbit']), dict(query='x', base_url='file:///tmp'),
                 dict(query=''), dict(query='x' * 2001), dict(query='bad\x00text'), dict(), dict(query='x', beats=['y']),
                 dict(beats=[]), dict(beats=['x'] * 41), dict(beats=['']), dict(beats='not a list')]
        for kwargs in cases:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                recall.recall(**kwargs)

    def test_links_use_the_running_local_studio_only(self):
        runtime = self.root / 'style-library/runtime'
        runtime.mkdir()
        (runtime / 'server.json').write_text(json.dumps({'url': 'http://127.0.0.1:4871'}))
        first = recall.recall('numbered list', recent=0)['results'][0]['examples'][0]
        self.assertEqual(first['url'], 'http://127.0.0.1:4871/' + first['link'])
        (runtime / 'server.json').write_text(json.dumps({'url': 'https://example.com'}))
        self.assertIsNone(recall.recall('numbered list', recent=0)['results'][0]['examples'][0]['url'])
        given = recall.recall('numbered list', recent=0, base_url='http://localhost:4999')['results'][0]['examples'][0]
        self.assertTrue(given['url'].startswith('http://localhost:4999/#technique='))

    def test_read_only(self):
        folder = self.root / 'projects/current'
        folder.mkdir(parents=True)
        (folder / 'technique-plan.json').write_text('{"plans": []}')
        before = self.snapshot()
        recall.recall('numbered list', project_id='current')
        recall.recall(beats=['zoom', 'compare'], project_id='current')
        self.assertEqual(self.snapshot(), before)

    def test_command_line_prints_json(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = recall.main(['--query', 'numbered list', '--recent', '0', '--limit', '1', '--studio', str(self.root)])
        self.assertEqual(code, 0)
        self.assertEqual([r['technique_id'] for r in json.loads(out.getvalue())['results']], ['tech-checklist'])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = recall.main(['--beat', 'numbered list', '--beat', 'snap zoom', '--exclude', 'tech-checklist'])
        self.assertEqual((code, [len(b['results']) > 0 for b in json.loads(out.getvalue())['beats']]), (0, [False, True]))
        self.techniques[0]['title'] = 'Checklist reveal ✅ 番号'
        self.save()
        raw = io.BytesIO()
        piped = io.TextIOWrapper(raw, encoding='cp1252')  # A Windows pipe's default code page.
        with contextlib.redirect_stdout(piped):
            code = recall.main(['--query', 'numbered list', '--recent', '0', '--limit', '1'])
        piped.flush()
        self.assertEqual((code, json.loads(raw.getvalue().decode('utf-8'))['results'][0]['title']), (0, 'Checklist reveal ✅ 番号'))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = recall.main(['--query', 'x', '--project', 'missing'])
        self.assertEqual((code, json.loads(out.getvalue())['error']), (1, 'No project missing in this studio.'))


if __name__ == '__main__':
    unittest.main()
