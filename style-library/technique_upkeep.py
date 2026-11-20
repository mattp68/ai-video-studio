"""Discover incomplete video catalogs and prepare exact-source chat handoffs.

Discovery and copying never analyze media, approve work or write owner records.
Prepared examples stay project-local until their exact video is approved.
"""
import argparse
import copy
from functools import lru_cache
import hashlib
import json
import uuid
from pathlib import Path
from urllib.parse import urlencode
import project_index as index
import review_actions as storage
from library import catalog_path
from security import registered_file

VIDEO = {'.mp4', '.mov', '.webm', '.m4v'}


def signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@lru_cache(maxsize=512)
def file_digest(path, size, mtime, ctime):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def digest(path):
    info = path.stat()
    return file_digest(str(path), info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def video_snapshot(entry):
    path = registered_file(index.STUDIO, entry['media_path'], VIDEO)
    return {'source_path': entry['media_path'], 'source_version': entry['version'], 'source_sha256': digest(path)}


def complete(entry, snapshot):
    return entry.get('technique_review_sha256') == snapshot['source_sha256'] and entry.get('source_sha256') == snapshot['source_sha256']


def discover():
    with index.STATE_LOCK:
        storage.check_storage()
        data = json.loads(storage.CATALOG.read_text(encoding='utf-8')) if storage.CATALOG.exists() else {'entries': [], 'techniques': []}
        projects = index.registry()['projects']
        project_map = {p['id']: p for p in projects}
        removed = data.get('removed_references', {})
        items, represented = [], set()
        # A current representative wins over all historical/project drafts.
        for entry in data['entries']:
            if entry.get('project_id') and not entry.get('archived_from') and entry['id'] in removed:
                represented.add(entry['project_id'])
            if entry.get('archived_from') or entry['id'] in removed or entry.get('asset_type') in {'carousel', 'project'} or entry.get('reference_format') == 'carousel':
                continue
            own = entry.get('collection') == 'mine'
            if own and entry.get('review_status') != 'preferred' and entry.get('delivery_status') != 'final':
                project = project_map.get(entry.get('project_id'), {})
                artifact = next((a for a in project.get('artifacts', []) if a['id'] == project.get('primary_artifact')), {})
                if (project.get('state') != 'final' or entry.get('version') != artifact.get('version')
                        or entry.get('media_path') != catalog_path('projects', project['id'], artifact.get('path', ''))):
                    continue
            if entry.get('project_id'):
                represented.add(entry['project_id'])
            try:
                snapshot = video_snapshot(entry)
            except (OSError, ValueError, KeyError):
                # An inaccessible source remains available through its existing analysis action.
                continue
            if complete(entry, snapshot):
                continue
            count = sum(x.get('style_id') == entry['id'] and all(x.get(k) == v for k, v in snapshot.items())
                        for t in data.get('techniques', []) for x in t.get('examples', []))
            item = {'id': 'reference:' + entry['id'], 'reference_id': entry['id'], 'title': entry['title'],
                    'group': 'mine' if own else 'reference', 'examples': count, 'moments': len(entry.get('moments', [])),
                    'source': snapshot, 'route': {'style': entry['id']}}
            if entry.get('project_id'):
                item['project_id'] = entry['project_id']
            # Notes/removal/analysis edits invalidate a request prepared from earlier context.
            item['revision'] = signature([str(index.STUDIO.resolve()), entry, snapshot])
            items.append(item)
        for project in projects:
            if project['id'] in represented or project.get('format') != 'video' or project.get('state') != 'final':
                continue
            artifact = next((a for a in project.get('artifacts', []) if a['id'] == project.get('primary_artifact')), None)
            if not artifact or artifact.get('type') != 'video' or artifact.get('role') == 'history':
                continue
            try:
                path = index.resolve(project, artifact['path'])
                snapshot = {'source_version': artifact['version'], 'source_path': path.relative_to(index.STUDIO).as_posix(), 'source_sha256': digest(path)}
            except (OSError, ValueError, KeyError):
                continue
            items.append({'id': 'project:' + project['id'] + '@' + artifact['id'], 'project_id': project['id'],
                          'artifact_id': artifact['id'], 'title': project['title'], 'group': 'mine', 'examples': 0,
                          'moments': 0, 'source': snapshot, 'revision': signature([str(index.STUDIO.resolve()), project, snapshot]),
                          'route': {'project': project['id'], 'artifact': artifact['id']}})
        return {'items': items, 'signature': signature(sorted((i['id'], i['revision']) for i in items))}


def handoff(body, base_url):
    if (not isinstance(body, dict) or set(body) != {'items'} or not isinstance(body['items'], list)
            or not 1 <= len(body['items']) <= 100):
        raise storage.ReviewError('Choose between 1 and 100 videos.')
    available = {i['id']: i for i in discover()['items']}
    chosen = []
    for request in body['items']:
        if (not isinstance(request, dict) or set(request) != {'id', 'revision'}
                or not isinstance(request['id'], str) or not isinstance(request['revision'], str)):
            raise storage.ReviewError('Choose a current video.')
        item = available.get(request['id'])
        if not item or request['revision'] != item['revision']:
            raise storage.ReviewError('A selected video changed or is already complete. Review the video list again.', 409)
        if any(i['id'] == item['id'] for i in chosen):
            raise storage.ReviewError('Choose each video once.')
        chosen.append(item)
    lines = ['Complete the reusable technique catalog for these exact videos in my studio.',
             'Studio folder: ' + str(index.STUDIO.resolve()),
             'Read docs/TECHNIQUE-CATALOGING.md. Verify each source snapshot below before working. Inspect the full video and reconcile earlier observations; preserve existing examples, notes, removals and approvals. Group distinct verified moves into technique families, without duplicate drafts. Report inaccessible sources or incomplete work. Do not edit or approve the videos.', '']
    for item in chosen:
        lines.extend([item['title'] + ' · ' + item['source']['source_version'], base_url + '/#' + urlencode(item['route']),
                      'Technique source: ' + json.dumps({k: v for k, v in item.items() if k in {'id', 'reference_id', 'project_id', 'artifact_id', 'revision', 'source'}}, ensure_ascii=False), ''])
    return {'text': '\n'.join(lines).strip()}


def prepared(project, artifact, expected=None):
    path = index.STUDIO / 'projects' / project['id'] / 'technique-plan.json'
    if not path.exists():
        return None
    path = index.resolve(project, 'technique-plan.json')
    if expected is not None:
        expected[path] = digest(path)
    plans = json.loads(path.read_text(encoding='utf-8'))['plans']
    matches = [p for p in plans if p['artifact_id'] == artifact['id'] and p['source_version'] == artifact['version']
               and p['source_path'] == catalog_path('projects', project['id'], artifact['path'])
               and p['source_sha256'] == digest(index.resolve(project, artifact['path']))]
    return matches[-1] if matches else None


def prepare(project_id, artifact_id, entry_path, examples_path):
    """An assistant calls this only after inspecting the exact finished export."""
    from technique_examples import register_examples
    with index.STATE_LOCK:
        storage.check_storage()
        registry_hash = digest(index.REGISTRY)
        catalog_bytes = storage.CATALOG.read_bytes()
        project = next(p for p in index.registry()['projects'] if p['id'] == project_id)
        artifact = next(a for a in project['artifacts'] if a['id'] == artifact_id)
        if artifact['type'] != 'video' or artifact.get('role') == 'history' or project['primary_artifact'] != artifact_id or index.review_options(project)['kind'] != 'final':
            raise ValueError('Prepare techniques for the current final-review video.')
        entry, examples = json.loads(Path(entry_path).read_text(encoding='utf-8')), json.loads(Path(examples_path).read_text(encoding='utf-8'))
        snapshot = video_snapshot(entry)
        if entry.get('collection') != 'mine' or snapshot['source_path'] != catalog_path('projects', project_id, artifact['path']) or snapshot['source_version'] != artifact['version']:
            raise ValueError('The technique plan must match this exact project checkpoint.')
        catalog = json.loads(catalog_bytes)
        prior = next((e for e in catalog['entries'] if e['id'] == entry['id']), None)
        if project.get('reference_id') and project['reference_id'] != entry['id'] or prior and prior.get('project_id', project_id) != project_id:
            raise ValueError('Keep this project’s existing reference identity.')
        for family in catalog.get('techniques', []):
            for old in family['examples']:
                if any(r['example']['id'] == old['id'] and r['family']['id'] == family['id'] for r in examples) and any(old.get(k) != v for k, v in snapshot.items()):
                    raise ValueError('Keep earlier example links; use a new example ID for the new video version.')
        # Validate without publishing draft examples. Earlier-source examples remain with their version.
        validation = copy.deepcopy(catalog)
        for family in validation.get('techniques', []):
            family['examples'] = [x for x in family['examples'] if x.get('style_id') != entry['id'] or all(x.get(k) == v for k, v in snapshot.items())]
        register_examples(validation, entry, examples, [], index.STUDIO)
        entry.update(source_sha256=snapshot['source_sha256'], technique_review_sha256=snapshot['source_sha256'])
        target = index.STUDIO / 'projects' / project_id / 'technique-plan.json'
        if target.is_symlink() or target.parent.resolve() != (index.STUDIO / 'projects' / project_id).resolve():
            raise ValueError('Keep the prepared plan inside its project.')
        before = target.read_bytes() if target.exists() else None
        saved = json.loads(before) if before else {'schema_version': 1, 'plans': []}
        plan = {'artifact_id': artifact_id, **snapshot, 'reference': entry, 'examples': examples}
        if not saved['plans'] or saved['plans'][-1] != plan:
            saved['plans'].append(plan)
        expected = {target: hashlib.sha256(before).hexdigest() if before else None,
                    storage.CATALOG.resolve(): hashlib.sha256(catalog_bytes).hexdigest(), index.REGISTRY.resolve(): registry_hash,
                    index.resolve(project, artifact['path']): snapshot['source_sha256']}
        storage.commit({target: storage.json_bytes(saved)}, {'request_id': str(uuid.uuid4()), 'action': 'prepare-techniques'}, expected)
        return {'prepared': True, 'artifact_id': artifact_id, 'examples': len(examples), 'published': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('list')
    p = sub.add_parser('prepare')
    p.add_argument('project'); p.add_argument('artifact')
    p.add_argument('--entry', required=True); p.add_argument('--examples', required=True)
    p.add_argument('--reviewed', action='store_true', required=True, help='Confirm actual full-source inspection')
    args = parser.parse_args()
    print(json.dumps(discover() if args.action == 'list' else prepare(args.project, args.artifact, args.entry, args.examples), ensure_ascii=False))
