"""Owner collections of exact library items. Never edits the catalog or borrowing notes."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import uuid
from pathlib import Path
import project_index as index
import review_actions as storage


def target():
    storage.check_storage()
    path = storage.BASE / 'collections.json'
    if path.is_symlink() or path.resolve() != path.absolute():
        raise storage.ReviewError('The collections file needs a safe local path.', 503)
    return path


def read():
    path = target()
    if not path.exists():
        return path, {'schema_version': 1, 'collections': [], 'requests': {}}, None
    if path.stat().st_size > 8_000_000:
        raise storage.ReviewError('Collections need attention. Existing records are preserved.', 503)
    raw = path.read_bytes();data = json.loads(raw)
    if data.get('schema_version') != 1 or not isinstance(data.get('collections'), list) or not isinstance(data.get('requests', {}), dict):
        raise storage.ReviewError('The collections file could not be read. Existing records are preserved.', 503)
    ids = [c['id'] for c in data['collections']]
    if len(ids) != len(set(ids)):
        raise storage.ReviewError('Collection IDs need attention.', 503)
    return path, data, hashlib.sha256(raw).hexdigest()


def catalog():
    return json.loads(storage.CATALOG.read_text(encoding='utf-8')) if storage.CATALOG.exists() else {'entries': [], 'techniques': []}


def identity(member):
    fields = {'kind', 'reference_id', 'technique_id', 'example_id', 'slide', 'time'}
    return json.dumps({k: v for k, v in member.items() if k in fields}, sort_keys=True)


def resolve(member, data, require_snapshot=True):
    if not isinstance(member, dict):
        raise storage.ReviewError('Choose a saved library item.', 400)
    kind = member.get('kind')
    fields = {'example': {'technique_id', 'example_id'}, 'reference': {'reference_id'},
              'slide': {'reference_id', 'slide'}, 'moment': {'reference_id', 'time'}}.get(kind)
    if fields is None or set(member) - fields - {'kind', 'source'} or not fields <= set(member):
        raise storage.ReviewError('Choose an exact example, reference, slide or moment.', 400)
    for name in fields - {'slide', 'time'}:
        if not isinstance(member[name], str) or not index.TOKEN.fullmatch(member[name]):
            raise storage.ReviewError('Choose valid library IDs.', 400)
    example = None
    if kind == 'example':
        family = next((t for t in data.get('techniques', []) if t['id'] == member['technique_id']), {})
        example = next((x for x in family.get('examples', []) if x['id'] == member['example_id']), None)
        reference_id = example['style_id'] if example else None
    else:
        reference_id = member['reference_id']
    entry = next((e for e in data['entries'] if e['id'] == reference_id), None)
    if not entry or reference_id in data.get('removed_references', {}) or entry.get('archived_from') in data.get('removed_references', {}):
        raise storage.ReviewError('That source is unavailable or removed. Your collection is unchanged.')
    if example and member['technique_id'] + '@' + member['example_id'] in data.get('removed_technique_examples', {}):
        raise storage.ReviewError('Restore this example before saving it to a collection.')
    source = {'reference_id': entry['id'], 'version': entry.get('version'), 'path': entry.get('media_path'),
              'sha256': entry.get('source_sha256'), 'url': entry.get('source_url')}
    if example:
        if example['source_path'] != entry.get('media_path') or example['source_version'] != entry.get('version'):
            raise storage.ReviewError('This example needs its source rechecked.')
        source.update(example_id=example['id'], start=example['start'], end=example['end'], sha256=example['source_sha256'])
    if kind == 'slide':
        slide = member['slide']
        if type(slide) is not int or not 1 <= slide <= len(entry.get('slides', [])):
            raise storage.ReviewError('Choose a saved slide.', 400)
        frame = entry['slides'][slide - 1]
        source.update(slide=slide, path=frame['path'], sha256=frame.get('sha256'))
    if kind == 'moment':
        time = member['time']
        if type(time) not in (int, float) or not math.isfinite(time) or not entry.get('media_path') or not 0 <= time <= entry.get('duration', 0):
            raise storage.ReviewError('Choose a time inside the saved video.', 400)
    if require_snapshot and member.get('source') != source:
        raise storage.ReviewError('This source changed. Reopen it before saving to a collection.')
    return {k: member[k] for k in ['kind', *sorted(fields)]} | {'source': source}


def current():
    with index.STATE_LOCK:
        _, data, revision = read()
        return {'schema_version': 1, 'collections': data['collections'], 'revision': revision}


def name(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 80 or any(ord(c) < 32 for c in value):
        raise storage.ReviewError('Give the collection a name of up to 80 characters.', 400)
    return value.strip()


def save(body):
    fields = {'action', 'revision', 'request_id'}
    extra = {'create': {'name', 'members'}, 'rename': {'id', 'name'}, 'add': {'id', 'members'},
             'remove': {'id', 'members'}, 'delete': {'id'}, 'restore': {'id'}, 'undo_remove': {'id', 'index'}}.get(body.get('action') if isinstance(body, dict) else None)
    if extra is None or set(body) != fields | extra:
        raise storage.ReviewError('Use a valid collection action.', 400)
    try:
        if not isinstance(body['request_id'], str) or str(uuid.UUID(body['request_id'])) != body['request_id']:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise storage.ReviewError('Use a fresh collection request.', 400)
    with index.STATE_LOCK:
        path, data, revision = read()
        requests = data.setdefault('requests', {})
        previous = requests.get(body['request_id'])
        if previous:
            if previous['body'] != body:
                raise storage.ReviewError('That request ID has already been used.')
            return {**current(), 'collection_id': previous['collection_id'], 'duplicate': True}
        if body['revision'] != revision:
            raise storage.ReviewError('Collections changed in another window. Refresh and try again.')
        before_catalog = storage.CATALOG.read_bytes() if storage.CATALOG.exists() else None
        source_data = json.loads(before_catalog) if before_catalog else {'entries': [], 'techniques': []}
        stamp = datetime.now(timezone.utc).isoformat()
        action = body['action']
        collection = next((c for c in data['collections'] if c['id'] == body.get('id')), None)
        if action != 'create' and collection is None:
            raise storage.ReviewError('This collection is unavailable.', 404)
        if action in {'create', 'rename'}:
            title = name(body['name'])
            if any(c['id'] != body.get('id') and not c.get('deleted_at') and c['name'].casefold() == title.casefold() for c in data['collections']):
                raise storage.ReviewError('A collection already has that name. Choose it or use another name.', 400)
        if action in {'create', 'add', 'remove'}:
            members = body['members']
            if not isinstance(members, list) or not (0 if action == 'create' else 1) <= len(members) <= 500:
                raise storage.ReviewError('Choose up to 500 items.', 400)
            # Removal can recover an unavailable/stale item; additions require an exact current source.
            members = [resolve(m, source_data) for m in members] if action != 'remove' else members
            if any(not isinstance(m, dict) or m.get('kind') not in {'reference', 'example', 'slide', 'moment'} for m in members):
                raise storage.ReviewError('Choose a saved collection item.', 400)
        undone = None
        if action == 'undo_remove':
            history = collection.get('history', [])
            if type(body['index']) is not int or body['index'] != len(history)-1 or not history or history[-1]['action'] != 'remove':
                raise storage.ReviewError('This collection changed after that removal. Review its current contents.')
            undone = copy.deepcopy(history[-1]['before']['members'])
        if action == 'create':
            collection = {'id': 'col-' + str(uuid.uuid4()), 'name': title, 'kind': 'personal', 'members': [], 'created_at': stamp, 'history': []}
            data['collections'].append(collection)
        else:
            if collection.get('kind') == 'pack' and action in {'rename', 'add', 'remove'}:
                raise storage.ReviewError('Save these examples into a personal collection to organize them.')
            if collection.get('deleted_at') and action != 'restore':
                raise storage.ReviewError('Restore this collection before changing it.')
            collection.setdefault('history', []).append({'at': stamp, 'action': action, 'before': {k: copy.deepcopy(v) for k, v in collection.items() if k != 'history'}})
        if action == 'rename': collection['name'] = title
        if action in {'create', 'add'}:
            known = {identity(m) for m in collection['members']}
            for member in members:
                if identity(member) not in known:
                    collection['members'].append(member);known.add(identity(member))
        if action == 'remove':
            remove = {identity(m) for m in members}
            collection['members'] = [m for m in collection['members'] if identity(m) not in remove]
        if action == 'delete': collection['deleted_at'] = stamp
        if action == 'restore': collection.pop('deleted_at', None)
        if action == 'undo_remove': collection['members'] = undone
        collection['updated_at'] = stamp
        requests[body['request_id']] = {'body': copy.deepcopy(body), 'collection_id': collection['id']}
        expected = {path: revision, storage.CATALOG.resolve(): hashlib.sha256(before_catalog).hexdigest() if before_catalog else None}
        storage.commit({path: storage.json_bytes(data)}, {'request_id': body['request_id'], 'operation': 'collection-' + action}, expected)
        return {**current(), 'collection_id': collection['id']}


def import_pack(manifest):
    """Register memberships only after the pack's sources/examples are installed locally."""
    with index.STATE_LOCK:
        path, data, revision = read()
        if set(manifest) != {'pack_id', 'version', 'name', 'members'} or not isinstance(manifest['pack_id'], str) or not index.TOKEN.fullmatch(manifest['pack_id']):
            raise ValueError('Use a stable pack ID, version, name and installed members.')
        title = name(manifest['name'])
        if not isinstance(manifest['version'], str) or not 1 <= len(manifest['version']) <= 40 or not isinstance(manifest['members'], list) or not 1 <= len(manifest['members']) <= 500:
            raise ValueError('Use a pack version and 1–500 installed items.')
        raw = storage.CATALOG.read_bytes();source_data = json.loads(raw)
        members = [resolve(m, source_data, require_snapshot=False) for m in manifest['members']]
        pack = next((c for c in data['collections'] if c.get('pack_id') == manifest['pack_id']), None)
        if pack:
            if pack.get('pack_version') == manifest['version']:
                return current()
            pack.setdefault('history', []).append({'at': datetime.now(timezone.utc).isoformat(), 'action': 'pack-update', 'before': {k: copy.deepcopy(v) for k, v in pack.items() if k != 'history'}})
        else:
            pack = {'id': 'col-' + str(uuid.uuid4()), 'kind': 'pack', 'pack_id': manifest['pack_id'], 'name': title, 'members': [], 'history': []}
            data['collections'].append(pack)
        known = {identity(m) for m in pack['members']}
        for member in members:
            if identity(member) not in known:pack['members'].append(member);known.add(identity(member))
        pack['pack_version'] = manifest['version']
        pack['updated_at'] = datetime.now(timezone.utc).isoformat()
        storage.commit({path: storage.json_bytes(data)}, {'request_id': str(uuid.uuid4()), 'operation': 'import-collection-membership'},
                       {path: revision, storage.CATALOG.resolve(): hashlib.sha256(raw).hexdigest()})
        return current()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['list', 'import']);parser.add_argument('manifest', nargs='?')
    args = parser.parse_args()
    print(json.dumps(current() if args.action == 'list' else import_pack(json.loads(Path(args.manifest).read_text(encoding='utf-8'))), ensure_ascii=False))
