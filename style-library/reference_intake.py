"""Save explicit reference links and user notes. Never fetch, download or analyze a URL."""
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import re
import uuid
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
import project_index as index
import review_actions as storage
from library import BASE, source_key

CATALOG = BASE / 'catalog.json'

class IntakeError(Exception):
    def __init__(self,message,status=400):self.status=status;super().__init__(message)

def text(value,label,limit,multiline=False):
    if not isinstance(value,str) or len(value)>limit or any(ord(c)<32 and not(multiline and c in '\n\t') for c in value):
        raise IntakeError(f'{label} must be text of at most {limit} characters.')
    return value.strip()

def source_url(value):
    value=text(value,'Link',2048)
    if any(c.isspace() for c in value):raise IntakeError('Use a complete link without spaces.')
    try:
        p=urlparse(value);host=(p.hostname or '').lower().rstrip('.');port=p.port
        if p.scheme not in {'http','https'} or not host or p.username is not None or p.password is not None:
            raise ValueError()
        host=host.encode('idna').decode('ascii')
        if '.' not in host or host.endswith(('.local','.localhost','.internal','.lan','.test')) or host=='localhost':raise ValueError()
        try:
            ip=ipaddress.ip_address(host)
        except ValueError:ip=None
        if ip is not None and not ip.is_global:raise ValueError()
        if not re.fullmatch(r'[a-z0-9.-]+',host) or any(not part or part.startswith('-') or part.endswith('-') for part in host.split('.')):raise ValueError()
        if port not in (None,80 if p.scheme=='http' else 443):raise ValueError()
    except (ValueError,UnicodeError):raise IntakeError('Use a public http:// or https:// source link, without an embedded username/password or custom port.')
    # Strip common share tracking; the original public source identity is retained.
    query=urlencode([(k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in {'srtk','cplk','xtok','mdxt','rpxt','psln','fbclid','igsh','igshid','_r','_t'}])
    return urlunparse((p.scheme,host,p.path or '/',p.params,query,p.fragment))

def key(url):
    p=urlparse(url);host=(p.hostname or '').removeprefix('www.')
    if host in {'tiktok.com','m.tiktok.com'}:
        match=re.search(r'/video/(\d+)',p.path)
        if match:return 'tiktok:'+match[1]
    if host in {'youtube.com','m.youtube.com'}:
        match=re.match(r'/(?:shorts|embed)/([^/]+)',p.path)
        if match:return 'youtube:'+match[1]
    return source_key(url)

def revision(entry):return hashlib.sha256(json.dumps(entry,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def read_catalog():
    before=CATALOG.read_bytes() if CATALOG.exists() else None
    try:data=json.loads(before) if before is not None else {'schema_version':4,'entries':[],'techniques':[]}
    except ValueError:raise IntakeError('The library needs repair before a reference can be saved.',503)
    if not isinstance(data,dict) or not isinstance(data.get('entries'),list):raise IntakeError('The library needs repair before saving.',503)
    return before,data

def editable(entry):
    return entry.get('collection')=='reference' and bool(entry.get('source_url'))

def current(reference_id):
    if not isinstance(reference_id,str) or not index.TOKEN.fullmatch(reference_id):raise IntakeError('Unknown reference.',404)
    with index.STATE_LOCK:
        _,data=read_catalog();entry=next((e for e in data['entries'] if e.get('id')==reference_id),None)
        if not entry or not editable(entry):raise IntakeError('Open a creator reference to edit its details.',404)
        return {'id':entry['id'],'url':entry['source_url'],'title':entry['title'],'creator':entry.get('creator',''),
                'note':entry.get('reference_note',''),'revision':revision(entry)}

def creator(name,entries):
    if not name:name='Creator not added'
    norm=lambda v:v.strip().lstrip('@').casefold()
    for e in entries:
        if any(norm(name)==norm(v) for v in [e.get('creator',''),e.get('creator_handle',''),*e.get('creator_aliases',[])] if v):
            return e['creator'],e['creator_id']
    return name,'creator-'+hashlib.sha256(norm(name).encode()).hexdigest()[:16]

def save(body):
    if not isinstance(body,dict):raise IntakeError('Use the Add reference form.')
    action=body.get('action');fields={'action','url','title','creator','note'} if action=='create' else {'action','id','revision','title','creator','note'}
    if action not in {'create','edit'} or set(body)!=fields:raise IntakeError('Use a valid reference save request.')
    title=text(body['title'],'Title',120);name=text(body['creator'],'Creator',80);note=text(body['note'],'What caught your eye',1000,True)
    url=source_url(body['url']) if action=='create' else None
    with index.STATE_LOCK:
        storage.check_storage()
        if CATALOG.resolve()!=storage.CATALOG.resolve():raise IntakeError('The library path needs repair before saving.',503)
        for path in storage.JOURNALS.glob('*/transaction.json'):
            if json.loads(path.read_text()).get('state')=='prepared':raise IntakeError('An earlier library save needs recovery before continuing.',503)
        before,data=read_catalog();entries=data['entries']
        if action=='create':
            existing=next((e for e in entries if e.get('source_url') and key(e['source_url'])==key(url)),None)
            if existing:return {'id':existing['id'],'duplicate':True,'saved':False}
            reference_id='link-'+hashlib.sha256(key(url).encode()).hexdigest()[:24]
            if any(e['id']==reference_id for e in entries):raise IntakeError('That reference ID is already in use.',409)
            host=urlparse(url).hostname.removeprefix('www.');label={'instagram.com':'Instagram','tiktok.com':'TikTok','youtube.com':'YouTube','youtu.be':'YouTube'}.get(host,host)
            title=title or label+' reference'
            entry={'id':reference_id,'asset_type':'link','collection':'reference','version':'LINK','title':title,'subtitle':label+' · saved source link',
                   'source_url':url,'summary':'Saved for your next edit. Add visual context with Analyze in chat.',
                   'tags':[],'palette':['#eeefe5','#252820','#ce593b'],'poster':'assets/link-reference.svg',
                   'traits':{},'keep':[],'avoid':[],'moments':[],'notes':[],
                   'analysis_status':'not_analyzed','evidence':'Link and user notes only. The video, style, sound and creator have not been independently verified.',
                   'added_via':'studio_ui','created_at':datetime.now(timezone.utc).isoformat()}
            entries.insert(0,entry)
        else:
            reference_id=body['id']
            if not isinstance(reference_id,str) or not index.TOKEN.fullmatch(reference_id):raise IntakeError('Unknown reference.',404)
            entry=next((e for e in entries if e.get('id')==reference_id),None)
            if not entry or not editable(entry):raise IntakeError('Only creator-reference details can be edited here.',404)
            if body['revision']!=revision(entry):raise IntakeError('This reference changed while the form was open. Close and reopen it to review the latest details before saving.',409)
            title=title or entry['title']
        previous_creator_id=entry.get('creator_id')
        display,creator_id=creator(name,entries)
        entry.update(title=title,creator=display,creator_id=creator_id,reference_note=note,updated_at=datetime.now(timezone.utc).isoformat())
        if previous_creator_id!=creator_id:
            identity=next((e for e in entries if e is not entry and e.get('creator_id')==creator_id),{})
            entry['creator_handle']=identity.get('creator_handle',name if name.startswith('@') else '')
            entry['creator_aliases']=list(identity.get('creator_aliases',[]))
        expected={CATALOG.resolve():hashlib.sha256(before).hexdigest() if before is not None else None}
        try:
            storage.commit({CATALOG.resolve():storage.json_bytes(data)},
                           {'request_id':str(uuid.uuid4()),'operation':action+'-reference','reference_id':reference_id},expected)
        except storage.ReviewError as e:raise IntakeError(str(e),e.status)
        return {'id':reference_id,'duplicate':False,'saved':True}
