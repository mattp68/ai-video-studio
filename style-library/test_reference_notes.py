"""All reference-note writes use disposable catalogs and source files."""
import copy
import hashlib
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid
import reference_notes as notes
import project_index as index
import review_actions as storage
from serve import Handler


class Quiet(Handler):
    def log_message(self, *args): pass


class ReferenceNoteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.base = self.root / 'style-library'
        self.base.mkdir()
        self.media = self.root / 'references/demo.mp4'
        self.media.parent.mkdir()
        self.media.write_bytes(b'exact-original-source')
        self.slide = self.root / 'references/slide.png'
        self.slide.write_bytes(b'exact-slide')
        self.catalog = self.base / 'catalog.json'
        self.registry = self.base / 'projects.json'
        self.registry.write_text('{"projects":[]}')
        self.data = {'entries': [
            {'id': 'video', 'title': 'Creator video', 'creator': 'Demo', 'version': 'V01',
             'media_path': 'references/demo.mp4', 'duration': 10, 'collection': 'reference'},
            {'id': 'link', 'title': 'Saved link', 'creator': 'Demo', 'version': 'LINK',
             'source_url': 'https://example.com/source', 'collection': 'reference'},
            {'id': 'carousel', 'title': 'Carousel', 'creator': 'Demo', 'version': 'V01',
             'slides': [{'path': 'references/slide.png'}], 'collection': 'mine'}],
            'techniques': [{'id': 'tech-demo', 'title': 'Card reveal', 'examples': [
                {'id': 'first', 'style_id': 'video', 'label': 'First reveal', 'start': 2, 'end': 4,
                 'source_version': 'V01', 'source_path': 'references/demo.mp4',
                 'source_sha256': hashlib.sha256(self.media.read_bytes()).hexdigest()},
                {'id': 'second', 'style_id': 'video', 'label': 'Second reveal', 'start': 5, 'end': 8,
                 'source_version': 'V01', 'source_path': 'references/demo.mp4',
                 'source_sha256': hashlib.sha256(self.media.read_bytes()).hexdigest()}]}]}
        self.catalog.write_text(json.dumps(self.data))
        self.patches = [patch.object(index, 'STUDIO', self.root), patch.object(index, 'REGISTRY', self.registry),
                        patch.object(storage, 'BASE', self.base), patch.object(storage, 'CATALOG', self.catalog),
                        patch.object(storage, 'JOURNALS', self.base / 'runtime/review-actions')]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.temp.cleanup()

    def body(self, id='video', example=None, **delta):
        return {'reference_id': id, 'example_id': example, 'slide': None,
                'context_revision': notes.current(id, example)['context_revision'], 'text': 'Borrow the card entrance.',
                'time': None, 'focus': '', 'request_id': str(uuid.uuid4()), 'legacy_key': None, **delta}

    def row(self, state, slide=None):
        return {k: state[k] for k in ['reference_id', 'example_id', 'context_revision']} | {
            'slide': slide, 'note_ids': [n['id'] for n in state['notes'] if n['slide'] in (None, slide)]}

    def edit_body(self, state, text='Use a softer entrance.'):
        note = state['notes'][0]
        return {k: state[k] for k in ('reference_id', 'example_id', 'context_revision')} | {
            'note_id': note['id'], 'revision': note['content_revision'], 'text': text, 'request_id': str(uuid.uuid4())}

    def test_edit_preserves_identity_position_source_and_recoverable_wording(self):
        state = notes.save(self.body('tech-demo', 'first', time=2.5, focus='Opening'))
        notes.save(self.body('video', text='An unrelated saved note.'))
        before = json.loads((self.base / 'reference-notes.json').read_text())
        sources = self.catalog.read_bytes(), self.media.read_bytes(), self.registry.read_bytes()
        result = notes.edit(self.edit_body(state))
        edited = result['notes'][0]
        self.assertNotEqual(edited['content_revision'], state['notes'][0]['content_revision'])
        raw = json.loads((self.base / 'reference-notes.json').read_text())
        self.assertEqual(raw['notes'][0]['history'][0]['before'], before['notes'][0])
        self.assertEqual(raw['notes'][1], before['notes'][1])
        for key, value in before['notes'][0].items():
            if key != 'text': self.assertEqual(raw['notes'][0][key], value, key)
        self.assertEqual(edited['text'], 'Use a softer entrance.')
        self.assertEqual(sources, (self.catalog.read_bytes(), self.media.read_bytes(), self.registry.read_bytes()))
        row = self.row(result) | {'note_revisions': {edited['id']: edited['content_revision']}}
        copied = notes.handoff({'references': [row]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('Use a softer entrance.', copied)
        self.assertNotIn('Borrow the card entrance.', copied)
        self.assertIn('example=first', copied)

    def test_edit_retries_are_idempotent_and_never_revert_a_later_edit(self):
        first = notes.save(self.body())
        request = self.edit_body(first)
        second = notes.edit(request)
        self.assertEqual(second, notes.edit(request))
        third = notes.edit(self.edit_body(second, 'The latest direction.'))
        self.assertEqual(third, notes.edit(request))
        self.assertEqual(len(third['notes'][0]['history']), 2)
        with self.assertRaises(notes.NoteError): notes.edit(request | {'text': 'Different request'})

    def test_stale_wrong_scope_and_invalid_edits_preserve_saved_work(self):
        first = notes.save(self.body('tech-demo', 'first'))
        request = self.edit_body(first)
        notes.edit(request)
        before = (self.base / 'reference-notes.json').read_bytes()
        for delta in ({'revision': first['notes'][0]['content_revision']}, {'reference_id': 'video', 'example_id': None},
                      {'example_id': 'second'}, {'context_revision': 'old'}, {'text': ''}, {'text': 'x' * 2001},
                      {'time': 3}, {'revision': []}, {'request_id': 'bad'}, {'note_id': str(uuid.uuid4())}):
            with self.subTest(delta=delta), self.assertRaises(notes.NoteError):
                notes.edit(request | {'request_id': str(uuid.uuid4())} | delta)
        self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())

    def test_note_revisions_reject_unseen_edits_in_handoffs(self):
        state = notes.save(self.body())
        old = self.row(state) | {'note_revisions': {n['id']: n['content_revision'] for n in state['notes']}}
        notes.handoff({'references': [self.row(state)]}, 'http://127.0.0.1:4870')
        latest = notes.edit(self.edit_body(state))
        for row in (old, self.row(latest), self.row(latest) | {'note_revisions': {}}, self.row(latest) | {'note_revisions': None}):
            with self.subTest(row=row), self.assertRaises(notes.NoteError):
                notes.handoff({'references': [row]}, 'http://127.0.0.1:4870')
        fresh = self.row(latest) | {'note_revisions': {n['id']: n['content_revision'] for n in latest['notes']}}
        self.assertIn('softer entrance', notes.handoff({'references': [fresh]}, 'http://127.0.0.1:4870')['text'])

    def test_source_change_during_edit_is_guarded_and_keeps_the_note(self):
        state = notes.save(self.body(time=0))
        before = (self.base / 'reference-notes.json').read_bytes()
        commit = storage.commit
        def changed(*args, **kwargs):
            self.media.write_bytes(b'external-new-source')
            return commit(*args, **kwargs)
        with patch.object(storage, 'commit', side_effect=changed), self.assertRaises(storage.ReviewError):
            notes.edit(self.edit_body(state))
        self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())
        with self.assertRaises(notes.NoteError): notes.edit(self.edit_body(state))

    def test_concurrent_edits_accept_one_revision_without_losing_the_original(self):
        state = notes.save(self.body())
        bodies = [self.edit_body(state, text) for text in ('Direction A', 'Direction B')]
        errors = []
        def edit(body):
            try: notes.edit(body)
            except notes.NoteError as error: errors.append(error)
        threads = [threading.Thread(target=edit, args=(body,)) for body in bodies]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(len(errors), 1)
        result = notes.current('video')['notes'][0]
        self.assertEqual(len(result['history']), 1)
        self.assertEqual(result['history'][0]['before']['text'], state['notes'][0]['text'])

    def test_editing_requests_isolate_notes_without_erasing_prior_saved_work(self):
        legacy = notes.save(self.body())
        scope = str(uuid.uuid4())
        before = (self.base / 'reference-notes.json').read_bytes()
        self.assertEqual(notes.current('video', selection_id=scope)['notes'], [])
        self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())
        selected = notes.save(self.body(selection_id=scope, text='Only for this edit.'))
        self.assertEqual(len(selected['notes']), 1)
        self.assertEqual(notes.current('video')['notes'], legacy['notes'])
        self.assertEqual(notes.current('video', selection_id=str(uuid.uuid4()))['notes'], [])
        row = self.row(selected) | {'selection_id': scope}
        text = notes.handoff({'references': [row]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('Only for this edit.', text)
        self.assertNotIn('Borrow the card entrance.', text)
        with self.assertRaises(notes.NoteError):
            notes.handoff({'references': [row | {'selection_id': str(uuid.uuid4())}]}, 'http://127.0.0.1:4870')
        self.assertEqual(notes.current('video')['notes'], legacy['notes'])

    def test_scoped_note_edit_and_retries_keep_the_same_request(self):
        scope = str(uuid.uuid4())
        saved = notes.save(self.body('tech-demo', 'first', selection_id=scope))
        request = self.edit_body(saved) | {'selection_id': scope}
        result = notes.edit(request)
        self.assertEqual(result, notes.edit(request))
        self.assertEqual(result['notes'][0]['selection_id'], scope)
        self.assertEqual(notes.current('tech-demo', 'first')['notes'], [])
        with self.assertRaises(notes.NoteError):
            notes.edit(self.edit_body(result) | {'selection_id': str(uuid.uuid4())})
        for value in ('invalid', '', [], 3):
            with self.subTest(value=value), self.assertRaises(notes.NoteError):
                notes.current('video', selection_id=value)
            with self.subTest(value=value), self.assertRaises(notes.NoteError):
                notes.save(self.body(selection_id=value))

    def test_a_technique_has_one_new_direction_per_edit_and_retries_keep_its_identity(self):
        original = self.body('tech-demo', 'first')
        first = notes.save(original)
        before = (self.base / 'reference-notes.json').read_bytes()
        with self.assertRaisesRegex(notes.NoteError, 'choose Edit'):
            notes.save(self.body('tech-demo', 'first', text='An additional direction.'))
        self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())
        updated = notes.edit(self.edit_body(first))
        self.assertEqual(len(updated['notes']), 1)
        self.assertEqual(updated['notes'][0]['id'], first['notes'][0]['id'])
        self.assertEqual(notes.save(original)['notes'], updated['notes'])
        self.assertEqual(len(notes.save(self.body('tech-demo', 'second'))['notes']), 1)
        self.assertEqual(len(notes.save(self.body('tech-demo', 'first', selection_id=str(uuid.uuid4())))['notes']), 1)

    def test_existing_multiple_directions_keep_each_record_and_copy_without_a_migration(self):
        notes.save(self.body('tech-demo', 'first'))
        path = self.base / 'reference-notes.json';data = json.loads(path.read_text())
        second = copy.deepcopy(data['notes'][0]);second['id'] = str(uuid.uuid4());second['text'] = 'Another earlier instruction.'
        data['notes'].append(second);path.write_text(json.dumps(data));before = path.read_bytes()
        current = notes.current('tech-demo', 'first')
        self.assertEqual(len(current['notes']), 2);self.assertEqual(before, path.read_bytes())
        request = self.edit_body(current) | {'note_id': second['id'], 'revision': current['notes'][1]['content_revision'], 'text': 'The revised second instruction.'}
        updated = notes.edit(request)
        self.assertEqual(updated['notes'][0], current['notes'][0])
        self.assertEqual(updated['notes'][1]['id'], second['id'])
        row = self.row(updated) | {'note_revisions': {n['id']: n['content_revision'] for n in updated['notes']}}
        copied = notes.handoff({'references': [row]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('Borrow the card entrance.', copied)
        self.assertIn('The revised second instruction.', copied)

    def test_read_and_handoff_without_notes_do_not_create_owner_files(self):
        state = notes.current('video')
        text = notes.handoff({'references': [self.row(state)]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('Creator video — Demo', text)
        self.assertIn('#style=video', text)
        self.assertFalse((self.base / 'reference-notes.json').exists())
        self.assertFalse(storage.JOURNALS.exists())

    def test_preserved_technique_source_keeps_its_saved_note_context(self):
        before=notes.save(self.body('tech-demo','first'))
        data=json.loads(self.catalog.read_text());old=data['entries'][0]
        archived=copy.deepcopy(old);archived.update(id='video-saved-v01',archived_from='video')
        data['entries'].append(archived)
        for x in data['techniques'][0]['examples']:x['style_id']=archived['id']
        old['version']='V02';self.catalog.write_text(json.dumps(data))
        after=notes.current('tech-demo','first')
        self.assertEqual(before['context_revision'],after['context_revision'])
        self.assertEqual(before['notes'],after['notes'])

    def test_save_zero_timestamp_is_persistent_and_preserves_sources(self):
        before = self.catalog.read_bytes(), self.media.read_bytes(), self.registry.read_bytes()
        body = self.body(time=0)
        state = notes.save(body)
        self.assertEqual(state['notes'][0]['time'], 0)
        self.assertEqual(notes.current('video')['notes'], state['notes'])
        text = notes.handoff({'references': [self.row(state)]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('At 0:00: Borrow the card entrance.', text)
        self.assertNotIn('request_id', text)
        self.assertEqual(before, (self.catalog.read_bytes(), self.media.read_bytes(), self.registry.read_bytes()))

    def test_exact_example_range_and_note_ids_cannot_cross_sources(self):
        state = notes.save(self.body('tech-demo', 'first', time=3))
        text = notes.handoff({'references': [self.row(state)]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('First reveal (0:02–0:04)', text)
        self.assertIn('#technique=tech-demo&example=first', text)
        other = notes.current('tech-demo', 'second')
        row = self.row(other) | {'note_ids': [state['notes'][0]['id']]}
        with self.assertRaises(notes.NoteError): notes.handoff({'references': [row]}, 'http://127.0.0.1:4870')
        for time in [0, 4.01, True, float('nan')]:
            with self.subTest(time=time), self.assertRaises(notes.NoteError): notes.save(self.body('tech-demo', 'first', time=time))

    def test_same_family_handoff_keeps_independent_ranges_and_direction(self):
        first = self.row(notes.current('tech-demo', 'first')) | {'direction': 'Use it on the hook.'}
        second = self.row(notes.current('tech-demo', 'second')) | {'direction': 'Use it on the payoff.'}
        text = notes.handoff({'references': [first, second]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('First reveal (0:02–0:04)', text)
        self.assertIn('Second reveal (0:05–0:08)', text)
        self.assertIn('example=first\nWhat to borrow: Use it on the hook.', text)
        self.assertIn('example=second\nWhat to borrow: Use it on the payoff.', text)
        self.assertFalse((self.base / 'reference-notes.json').exists())
        stale = second | {'context_revision': first['context_revision']}
        with self.assertRaises(notes.NoteError):
            notes.handoff({'references': [stale]}, 'http://127.0.0.1:4870')

    def test_handoff_combines_exact_examples_and_unsaved_timestamp_notes(self):
        first = self.row(notes.current('tech-demo', 'first'))
        second = self.row(notes.current('tech-demo', 'second')) | {'direction': 'Use it for the hook.'}
        source = self.row(notes.current('video'))
        moment = source | {'moment': {'time': 0, 'text': 'Start with this frame.'}}
        later = source | {'moment': {'time': 8.125, 'text': 'Borrow this pause.'}}
        text = notes.handoff({'references': [first, second, moment, later]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('example=first', text)
        self.assertIn('example=second\nWhat to borrow: Use it for the hook.', text)
        self.assertIn('style=video&time=0\nWhat to borrow: Start with this frame.', text)
        self.assertIn('style=video&time=8.125\nWhat to borrow: Borrow this pause.', text)
        self.assertFalse((self.base / 'reference-notes.json').exists())
        for value in [-1, 11, True, float('nan')]:
            with self.subTest(value=value), self.assertRaises(notes.NoteError):
                notes.handoff({'references': [source | {'moment': {'time': value, 'text': ''}}]}, 'http://127.0.0.1:4870')
        with self.assertRaises(notes.NoteError):
            notes.handoff({'references': [first | {'moment': moment['moment']}]}, 'http://127.0.0.1:4870')
        self.media.write_bytes(b'changed source')
        with self.assertRaises(notes.NoteError):
            notes.handoff({'references': [moment]}, 'http://127.0.0.1:4870')

    def test_whole_video_handoff_includes_direction_only_when_supplied(self):
        state = notes.save(self.body(time=2))
        source = self.row(state)
        origin = 'http://127.0.0.1:4870'
        direct = notes.handoff({'references': [source]}, origin)['text']
        selected = notes.handoff({'references': [source | {'direction': 'Borrow the pacing.'}]}, origin)['text']
        self.assertIn('#style=video\nAt 0:02: Borrow the card entrance.', direct)
        self.assertEqual(selected, direct + '\nWhat to borrow: Borrow the pacing.')
        for reference_id in ('link', 'carousel'):
            with self.subTest(reference_id=reference_id), self.assertRaises(notes.NoteError):
                row = self.row(notes.current(reference_id)) | {'direction': 'Borrow the pacing.'}
                notes.handoff({'references': [row]}, origin)

    def test_changed_source_keeps_earlier_notes_and_rejects_stale_copy_save(self):
        body = self.body(time=1)
        state = notes.save(body)
        self.media.write_bytes(b'new-source-must-not-inherit-old-timestamps')
        current = notes.current('video')
        self.assertEqual(current['notes'], [])
        self.assertEqual(current['earlier_notes'][0]['id'], body['request_id'])
        with self.assertRaises(notes.NoteError): notes.save(body | {'request_id': str(uuid.uuid4())})
        with self.assertRaises(notes.NoteError): notes.handoff({'references': [self.row(state)]}, 'http://127.0.0.1:4870')
        with self.assertRaises(notes.NoteError): notes.current('tech-demo', 'first')

    def test_carousel_scope_and_browser_import_are_exact_and_idempotent(self):
        first = notes.save(self.body('carousel', slide=1))
        legacy = self.body('carousel', text='Keep the original note.', focus='slides 1–2', legacy_key='a' * 64)
        notes.save(legacy)
        state = notes.save(legacy | {'request_id': str(uuid.uuid4())})
        self.assertEqual(len(state['notes']), 2)
        text = notes.handoff({'references': [self.row(state, 1)]}, 'http://127.0.0.1:4870')['text']
        self.assertIn('&slide=1', text)
        self.assertIn('slides 1–2', text)
        with self.assertRaises(notes.NoteError): notes.handoff({'references': [self.row(first) | {'note_ids': [first['notes'][0]['id']]}]}, 'http://127.0.0.1:4870')
        with self.assertRaises(notes.NoteError): notes.save(self.body('carousel', slide=2))
        with self.assertRaises(notes.NoteError): notes.save(self.body('carousel', time=1))
        with self.assertRaises(notes.NoteError): notes.save(legacy | {'request_id': str(uuid.uuid4()), 'text': 'Different note'})

    def test_retry_ids_and_invalid_payloads_do_not_overwrite_notes(self):
        body = self.body()
        state = notes.save(body)
        self.assertEqual(notes.save(body)['notes'], state['notes'])
        before = (self.base / 'reference-notes.json').read_bytes()
        for delta in [{'text': 'different'}, {'extra': True}, {'text': ''}, {'text': 'x' * 2001},
                      {'reference_id': '../outside'}, {'example_id': 'wrong'}, {'time': -1}, {'request_id': 'invalid'},
                      {'legacy_key': []}, {'focus': 'x' * 1001}, {'slide': True}]:
            with self.subTest(delta=delta), self.assertRaises(notes.NoteError): notes.save(body | delta)
        self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())
        with self.assertRaises(notes.NoteError): notes.save(self.body('link', time=1))

    def test_corrupt_symlink_and_escaped_sources_are_preserved(self):
        path = self.base / 'reference-notes.json'
        path.write_text('{bad')
        with self.assertRaises(notes.NoteError): notes.current('video')
        self.assertEqual(path.read_text(), '{bad')
        outside = self.root / 'outside.json'
        outside.write_text('{"schema_version":1,"notes":[]}')
        path.unlink(); path.symlink_to(outside)
        with self.assertRaises(notes.NoteError): notes.current('video')
        self.assertEqual(outside.read_text(), '{"schema_version":1,"notes":[]}')
        path.unlink()
        self.data['entries'][0]['media_path'] = '../outside.mp4'
        self.catalog.write_text(json.dumps(self.data))
        with self.assertRaises(notes.NoteError): notes.current('video')

    def test_concurrent_saves_merge_and_external_catalog_changes_are_guarded(self):
        bodies = [self.body(text=f'Note {i}') for i in range(2)]
        errors = []
        def save(body):
            try: notes.save(body)
            except Exception as error: errors.append(error)
        threads = [threading.Thread(target=save, args=(b,)) for b in bodies]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertFalse(errors)
        self.assertEqual(len(notes.current('video')['notes']), 2)
        commit = storage.commit
        external = copy.deepcopy(self.data) | {'owner_change': 'Keep this'}
        def changed(*args, **kwargs):
            self.catalog.write_text(json.dumps(external))
            return commit(*args, **kwargs)
        body = self.body()
        with patch.object(storage, 'commit', side_effect=changed), self.assertRaises(storage.ReviewError): notes.save(body)
        self.assertEqual(json.loads(self.catalog.read_text()), external)
        self.assertEqual(len(notes.current('video')['notes']), 2)

    def test_source_changed_at_commit_cannot_receive_an_old_timestamp(self):
        body = self.body(time=2)
        commit = storage.commit
        def changed(*args, **kwargs):
            self.media.write_bytes(b'external-new-source')
            return commit(*args, **kwargs)
        with patch.object(storage, 'commit', side_effect=changed), self.assertRaises(storage.ReviewError): notes.save(body)
        self.assertFalse((self.base / 'reference-notes.json').exists())
        self.assertEqual(self.media.read_bytes(), b'external-new-source')

    def test_prepared_recovery_blocks_new_writes(self):
        body = self.body()
        folder = storage.JOURNALS / 'unfinished'; folder.mkdir(parents=True)
        (folder / 'transaction.json').write_text('{"state":"prepared"}')
        with self.assertRaises(Exception): notes.save(body)
        self.assertFalse((self.base / 'reference-notes.json').exists())

    def test_endpoint_guards_and_explicit_stateless_copy(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        valid = {'Origin': origin, 'Content-Type': 'application/json', 'X-Studio-Action': 'reference-note'}
        body = json.dumps(self.body())
        def request(headers, value=body, path='/reference-notes', method='POST'):
            c = http.client.HTTPConnection('127.0.0.1', server.server_port)
            c.request(method, path, body=value, headers=headers)
            r = c.getresponse(); result = r.status, r.read(); c.close(); return result
        try:
            for field in ['Origin', 'X-Studio-Action']:
                h = valid.copy(); h.pop(field); self.assertEqual(request(h)[0], 403)
            for extra in [{'Host': 'attacker.invalid'}, {'Origin': 'https://attacker.invalid'}, {'Sec-Fetch-Site': 'cross-site'}]:
                self.assertEqual(request(valid | extra)[0], 403)
            self.assertEqual(request(valid | {'Content-Type': 'text/plain'})[0], 415)
            self.assertEqual(request(valid, 'x' * 16385)[0], 413)
            self.assertEqual(request(valid, '{bad')[0], 400)
            self.assertEqual(request(valid)[0], 200)
            status, raw = request({}, '', '/reference-notes?id=video', 'GET')
            self.assertEqual(status, 200)
            self.assertEqual(request({}, '', '/reference-notes?id=video&selection=invalid', 'GET')[0], 400)
            self.assertEqual(request({}, '', '/reference-notes?id=video&selection='+str(uuid.uuid4()), 'GET')[0], 200)
            self.assertEqual(request({}, '', '/reference-notes?id=video&id=link', 'GET')[0], 400)
            before = (self.base / 'reference-notes.json').read_bytes()
            copied = request(valid | {'X-Studio-Action': 'reference-handoff'}, json.dumps({'references': [self.row(json.loads(raw))]}), '/reference-handoff')
            self.assertEqual(copied[0], 200)
            self.assertIn(origin, json.loads(copied[1])['text'])
            self.assertEqual(before, (self.base / 'reference-notes.json').read_bytes())
            edit_headers = valid | {'X-Studio-Action': 'reference-note-edit'}
            edit_body = json.dumps(self.edit_body(json.loads(raw)))
            for field in ('Origin', 'X-Studio-Action'):
                headers = edit_headers.copy(); headers.pop(field)
                self.assertEqual(request(headers, edit_body, '/reference-note-edit')[0], 403)
            self.assertEqual(request(edit_headers | {'Origin': 'https://attacker.invalid'}, edit_body, '/reference-note-edit')[0], 403)
            self.assertEqual(request(edit_headers | {'Content-Type': 'text/plain'}, edit_body, '/reference-note-edit')[0], 415)
            self.assertEqual(request(edit_headers, 'x' * 16385, '/reference-note-edit')[0], 413)
            status, edited = request(edit_headers, edit_body, '/reference-note-edit')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(edited)['notes'][0]['text'], 'Use a softer entrance.')
            self.assertEqual(request({'Origin': 'https://attacker.invalid'}, '', '/reference-notes?id=video', 'GET')[0], 403)
        finally:
            server.shutdown(); server.server_close(); thread.join()
