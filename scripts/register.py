"""Register an inspected checkpoint or reference; never approves a user's work."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import tempfile
import os
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'style-library'))
import library
import project_index as index
import prepare_assets
import review_actions as storage
from security import registered_file, MEDIA, NOTES

def atomic(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False,encoding='utf-8') as f:
        f.write(json.dumps(data,indent=2,ensure_ascii=False)+'\n'); name=f.name
    os.replace(name,path)

def register(kind, manifest, replace=False, techniques=None):
    with index.STATE_LOCK:
        storage.check_storage()
        for journal in storage.JOURNALS.glob('*/transaction.json'):
            if json.loads(journal.read_text()).get('state') == 'prepared':
                raise ValueError('An earlier save needs recovery before registering work.')
        return register_locked(kind, manifest, replace, techniques)

def register_locked(kind, manifest, replace, techniques=None):
    snapshots = {}
    for path in [index.REGISTRY, storage.CATALOG]:
        if path.is_symlink() or path.resolve() != path.absolute():
            raise ValueError('Registry must not be a symlink')
        snapshots[path.resolve()] = path.read_bytes() if path.exists() else None
    if techniques is not None and kind != 'reference':
        raise ValueError('Technique examples need a video reference.')
    projects = json.loads(snapshots[index.REGISTRY.resolve()]) if snapshots[index.REGISTRY.resolve()] is not None else {'schema_version': 1, 'projects': []}
    catalog = json.loads(snapshots[storage.CATALOG.resolve()]) if snapshots[storage.CATALOG.resolve()] is not None else {'schema_version': 4, 'entries': [], 'techniques': []}
    item=json.loads(Path(manifest).read_text())
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',item['id']):raise ValueError('Use a readable lowercase ID')
    if kind=='project':
        required={'title','format','summary','next_step','state','stage','primary_artifact','artifacts','source_notes'}
        if required-set(item):raise ValueError('Project descriptor missing: '+', '.join(sorted(required-set(item))))
        if item['state'] not in {'in_progress','review'}:raise ValueError('New registrations cannot claim approval; use explicit review controls or record actual user approval in chat')
        for path in index.files(item): index.resolve(item,path)
        for note in item['source_notes']:note['sha256']=index.digest(index.resolve(item,note['path']))
        if item['primary_artifact'] not in {a['id'] for a in item['artifacts']}:raise ValueError('Unknown primary checkpoint')
        item['synced_on']=datetime.now(timezone.utc).date().isoformat()
        item.setdefault('input_note','Source files, exact versions and decisions are saved with this project.')
        data=projects;target=index.REGISTRY;key='projects'
    else:
        required={'title','subtitle','version','collection','creator','creator_id','summary','tags','palette','traits','keep','avoid','moments','notes','poster','evidence'}
        if required-set(item):raise ValueError('Reference descriptor missing: '+', '.join(sorted(required-set(item))))
        if item['collection'] not in {'mine','reference'}:raise ValueError('Unknown collection')
        for path in [item.get('media_path'),*item.get('notes',[])]:
            if path:registered_file(ROOT,path,MEDIA|NOTES)
        poster=(ROOT/'style-library/dist'/item['poster']).resolve()
        if not poster.is_relative_to((ROOT/'style-library/dist/assets').resolve()) or not poster.is_file():raise ValueError('Create a genuine poster under dist/assets first')
        if item.get('delivery_status')=='final':raise ValueError('Register as review_pending; final requires an actual user decision')
        item['review_status']='review_pending' if item['collection']=='mine' else 'reference'
        data=catalog;target=storage.CATALOG;key='entries'
        source=library.source_key(item['source_url']) if item.get('source_url') else None
        if source and any(e['id']!=item['id'] and e.get('source_url') and library.source_key(e['source_url'])==source for e in data[key]):raise ValueError('That original source is already registered')
    existing=next((i for i,x in enumerate(data[key]) if x['id']==item['id']),None)
    if kind=='project':
        previous=data[key][existing].get('starter_request_id') if existing is not None else None
        if previous:
            item.setdefault('starter_request_id',previous)
            if item['starter_request_id']!=previous:
                raise ValueError('Keep the existing script starter request ID')
        request=index.starter_request(item)
        if request and any(row.get('starter_request_id')==request and row['id']!=item['id'] for row in data[key]):
            raise ValueError('This script starter request already has a project. Continue there.')
        previous_reference = data[key][existing].get('reference_id') if existing is not None else None
        if previous_reference:
            item.setdefault('reference_id', previous_reference)
        if not item.get('reference_id'):
            matches = library.project_reference_candidates(item, catalog)
            if len(matches) > 1:raise ValueError('More than one library entry matches this checkpoint. Reconcile them before registration.')
            if matches:item['reference_id'] = matches[0]['id']
    else:
        previous = data[key][existing] if existing is not None else None
        if techniques is not None and previous:
            for field in ('reference_note', 'source_url', 'collection', 'added_via'):
                if field in previous:
                    item[field] = previous[field]
        date_fields = ['created_at', 'added_at', 'added_on']
        if previous is not None:
            for field in date_fields:
                if field in previous:item[field] = previous[field]
                elif any(previous.get(key) for key in date_fields):item.pop(field, None)
        elif not any(item.get(field) for field in date_fields):
            item['created_at'] = datetime.now(timezone.utc).isoformat()
        else:
            for field in date_fields:
                if item.get(field):
                    try:datetime.fromisoformat(item[field].replace('Z', '+00:00'))
                    except (AttributeError, TypeError, ValueError):raise ValueError('Use an ISO date for the reference creation date.')
    if existing is not None:
        if not replace:raise ValueError('ID already exists. Read its decisions, then use --replace intentionally.')
        if data[key][existing].get('review_decision') or data[key][existing].get('approval'):
            raise ValueError('This record has saved approvals. Reconcile those explicitly before replacing its descriptor.')
        data[key][existing]=item
    # The Projects home lists projects.json in order, so a new project goes first.
    elif kind=='project':data[key].insert(0,item)
    else:data[key].append(item)
    changes = {}
    if kind == 'reference':
        if techniques is not None:
            plan = json.loads(Path(techniques).read_text())
            evidence_path = storage.BASE / 'runtime/source-evidence.json'
            if evidence_path.resolve() != evidence_path.absolute():
                raise ValueError('Source evidence must have a safe local path.')
            raw = evidence_path.read_bytes() if evidence_path.exists() else None
            snapshots[evidence_path] = raw
            records = json.loads(raw) if raw is not None else []
            source_file, digest = register_examples(catalog, item, plan, records)
            snapshots[source_file] = digest
            changes[evidence_path] = storage.json_bytes(records)
        elif previous and any(
            x['style_id'] == item['id'] and (x['source_version'], x['source_path']) != (item['version'], item.get('media_path'))
            for family in catalog.get('techniques', []) for x in family['examples']
        ):
            raise ValueError('Include rechecked existing technique examples when changing the source.')
    changes[target.resolve()] = storage.json_bytes(data)
    if kind == 'reference' and item['collection'] == 'mine':
        project = next((p for p in projects['projects'] if p['id'] == item.get('project_id')), None)
        if project and not project.get('reference_id'):
            matches = library.project_reference_candidates(project, catalog)
            if len(matches) > 1:raise ValueError('More than one library entry matches this checkpoint. Reconcile them before registration.')
            if matches:
                project['reference_id'] = matches[0]['id']
                changes[index.REGISTRY.resolve()] = storage.json_bytes(projects)
    if target.exists():
        backup=ROOT/'style-library/runtime/registration-backups'/f'{target.stem}-{hashlib.sha256(target.read_bytes()).hexdigest()}.json'
        if not backup.exists():atomic(backup,json.loads(target.read_text()))
    expected = {path: hashlib.sha256(raw).hexdigest() if isinstance(raw, bytes) else raw
                for path, raw in snapshots.items()}
    storage.commit(changes, {'request_id': str(uuid.uuid4()), 'operation': 'register-'+kind, 'id': item['id']}, expected)
    return item['id']

def register_examples(catalog, entry, plan, evidence_records):
    """Attach verified examples to one video, keeping existing links and user visibility."""
    if not isinstance(plan, list) or not entry.get('media_path'):
        raise ValueError('Provide a list of technique examples for a playable video.')
    source_file = registered_file(ROOT, entry['media_path'], {'.mp4', '.mov', '.webm', '.m4v'})
    digest = index.digest(source_file)
    families = {t['id']: t for t in catalog.setdefault('techniques', [])}
    existing = {(t['id'], x['id']): x for t in families.values() for x in t['examples'] if x['style_id'] == entry['id']}
    checked = set()
    duration = entry.get('duration')
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('A technique source needs a measured video duration.')
    snapshot = {'source_version': entry['version'], 'source_path': entry['media_path'], 'source_sha256': digest}
    if any(x['source_path'] == entry['media_path'] and x['source_sha256'] != digest for x in existing.values()):
        raise ValueError('Keep the previous media and use a new path for changed video bytes.')
    fresh_posters = []
    for row in plan:
        if not isinstance(row, dict) or set(row) != {'family', 'example'}:
            raise ValueError('Each technique needs a family and an example.')
        family, example = row['family'], row['example']
        family_id, example_id = family['id'], example['id']
        if not re.fullmatch(r'tech-[a-z0-9]+(?:-[a-z0-9]+)*', family_id) or not index.TOKEN.fullmatch(example_id):
            raise ValueError('Use stable lowercase technique and example IDs.')
        if set(example) != {'id', 'label', 'start', 'end', 'poster_at', 'poster', 'evidence'}:
            raise ValueError('Include a label, range, poster and evidence for each example.')
        if any(not isinstance(example[k], str) or not example[k].strip() for k in ('label', 'evidence')):
            raise ValueError('Describe what was verified in each example.')
        start, end, at = (example[k] for k in ('start', 'end', 'poster_at'))
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (start, end, at)) or not 0 <= start <= at < end <= duration:
            raise ValueError('Choose a playable example window and poster frame.')
        poster_path = Path(example['poster'])
        assets = ROOT / 'style-library/dist'
        if (poster_path.parts[:2] != ('assets', 'techniques') or
                not (assets / poster_path).resolve().is_relative_to(assets / 'assets/techniques') or
                poster_path.suffix.lower() not in {'.jpg', '.png', '.webp'}):
            raise ValueError('Use a versioned poster under assets/techniques.')
        key = (family_id, example_id)
        if key in checked:
            raise ValueError('Include each example once in the analysis.')
        checked.add(key)
        if family_id not in families:
            if set(family) != {'id', 'title', 'category', 'summary', 'direction', 'aliases', 'keep', 'avoid', 'evidence'}:
                raise ValueError('Give a new family a title, category, direction and evidence.')
            if (any(not isinstance(family[k], str) or not family[k].strip()
                    for k in ('title', 'category', 'summary', 'direction', 'evidence')) or
                any(not isinstance(family[k], list) or any(not isinstance(v, str) for v in family[k])
                    for k in ('aliases', 'keep', 'avoid'))):
                raise ValueError('Describe the new technique family.')
            families[family_id] = dict(family, default_example=example_id, examples=[])
            catalog['techniques'].append(families[family_id])
        examples = families[family_id]['examples']
        prior = next((x for x in examples if x['id'] == example_id), None)
        if prior is not None and prior['style_id'] != entry['id']:
            raise ValueError('This example ID belongs to another reference.')
        if prior and all(prior.get(k) == v for k, v in snapshot.items()):
            # Existing example links and notes point to the original range.
            continue
        if prior and prior['poster'] == example['poster']:
            raise ValueError('Give a changed source a fresh versioned poster.')
        if not prior and any(
            x['style_id'] == entry['id'] and all(x.get(k) == v for k, v in snapshot.items())
            and abs(x['start'] - start) <= .25 and abs(x['end'] - end) <= .25
            for x in examples
        ):
            continue
        saved = dict(example, style_id=entry['id'], **snapshot)
        if prior:
            examples[examples.index(prior)] = saved
        else:
            examples.append(saved)
        fresh_posters.append((poster_path.as_posix(), at))
    if any(key not in checked and any(x.get(k) != v for k, v in snapshot.items()) for key, x in existing.items()):
        raise ValueError('Recheck every existing example when changing its video source.')
    for path, at in fresh_posters:
        prepare_assets.poster(source_file, path, at)
    entry['source_sha256'] = digest
    evidence_records[:] = [r for r in evidence_records if r['id'] != entry['id']]
    evidence_records.append({'id': entry['id'], 'source': entry['media_path'], 'version': entry['version'], 'source_sha256': digest})
    return source_file, digest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind',choices=['project','reference'])
    parser.add_argument('manifest',type=Path)
    parser.add_argument('--replace',action='store_true')
    parser.add_argument('--techniques',type=Path,help='Inspected example descriptors for this video')
    args=parser.parse_args()
    try:print(register(args.kind,args.manifest,args.replace,args.techniques))
    except (ValueError,KeyError,OSError,TypeError,storage.ReviewError,prepare_assets.subprocess.CalledProcessError) as e:
        parser.exit(1,str(e)+'\n')
