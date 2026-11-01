"""Register an inspected checkpoint or reference; never approves a user's work."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import os

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'style-library'))
import library
import project_index as index
from security import registered_file, MEDIA, NOTES

def atomic(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False,encoding='utf-8') as f:
        f.write(json.dumps(data,indent=2,ensure_ascii=False)+'\n'); name=f.name
    os.replace(name,path)

def register(kind, manifest, replace=False):
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
        data=index.registry();target=index.REGISTRY;key='projects'
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
        data=library.catalog();target=ROOT/'style-library/catalog.json';key='entries'
        source=library.source_key(item['source_url']) if item.get('source_url') else None
        if source and any(e['id']!=item['id'] and e.get('source_url') and library.source_key(e['source_url'])==source for e in data[key]):raise ValueError('That original source is already registered')
    existing=next((i for i,x in enumerate(data[key]) if x['id']==item['id']),None)
    if existing is not None:
        if not replace:raise ValueError('ID already exists. Read its decisions, then use --replace intentionally.')
        if data[key][existing].get('review_decision') or data[key][existing].get('approval'):
            raise ValueError('This record has saved approvals. Reconcile those explicitly before replacing its descriptor.')
        data[key][existing]=item
    # The Projects home lists projects.json in order, so a new project goes first.
    elif kind=='project':data[key].insert(0,item)
    else:data[key].append(item)
    if target.is_symlink():raise ValueError('Registry must not be a symlink')
    if target.exists():
        backup=ROOT/'style-library/runtime/registration-backups'/f'{target.stem}-{hashlib.sha256(target.read_bytes()).hexdigest()}.json'
        if not backup.exists():atomic(backup,json.loads(target.read_text()))
    atomic(target,data)
    return item['id']

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('kind',choices=['project','reference']);parser.add_argument('manifest',type=Path);parser.add_argument('--replace',action='store_true');args=parser.parse_args()
    try:print(register(args.kind,args.manifest,args.replace))
    except (ValueError,KeyError,OSError) as e:parser.exit(1,str(e)+'\n')
