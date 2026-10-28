"""Build a reviewed, exact allowlist export. Never uses git add, pushes or publishes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT=Path(__file__).resolve().parents[1]
PRIVATE={'projects','references','runtime','releases','node_modules','.venv','.git'}
SECRETS=[re.compile(r'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{24,}'),re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}')]

def sources():
    rows=[]
    for name in (ROOT/'release-files.txt').read_text().splitlines():
        if not name or name.startswith('#'):continue
        p=Path(name)
        if (p.is_absolute() or '..' in p.parts or any(part.startswith('.env') for part in p.parts) or p.suffix in {'.pem','.key','.p12','.pfx'} or name.startswith('style-library/dist/assets/reference-previews/') or name in {'style-library/catalog.json','style-library/projects.json','style-library/settings.json','style-library/reference-notes.json'} or
            (p.parts[0] in PRIVATE and name not in {'projects/README.md','references/README.md'}) or
            (len(p.parts)>1 and p.parts[:2] in {('style-library','runtime'),('style-library','references')})):raise ValueError('Private or unsafe release path: '+name)
        root=ROOT.resolve()
        target=root/p
        if (not target.is_file() or not target.resolve().is_relative_to(root) or
                any((root/Path(*p.parts[:i])).is_symlink() for i in range(1,len(p.parts)+1))):raise ValueError('Missing or symlinked release file: '+name)
        data=target.read_bytes()
        if target.suffix!='.woff2':
            text=data.decode('utf-8')
            if any(pattern.search(text) for pattern in SECRETS):raise ValueError('Credential candidate; inspect '+name)
            if re.search(r'(?:/Users|/home)/[A-Za-z0-9_.-]+/',text) or re.search(r'[A-Z]:\\Users\\[^\\]+\\',text):raise ValueError('Personal absolute path; inspect '+name)
        if target.suffix in {'.mp4','.mov','.wav','.mp3','.zip','.jpg','.png','.webp'}:raise ValueError('Uncleared binary in source export: '+name)
        rows.append((name,data))
    if len(rows)!=len({name for name,_ in rows}):raise ValueError('Duplicate allowlist path')
    return rows

def main():
    version=json.loads((ROOT/'package.json').read_text())['version']
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--name',default='ai-video-studio-'+version);args=parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*',args.name):raise SystemExit('Use a safe lowercase release name')
    rows=sources();out=ROOT/'releases';out.mkdir(exist_ok=True);archive=out/(args.name+'.zip')
    if archive.exists():raise SystemExit('Export already exists. Use a new --name to preserve it.')
    manifest={'candidate':args.name,'files':[{'path':n,'bytes':len(d),'sha256':hashlib.sha256(d).hexdigest()} for n,d in rows],
              'scan':{'credential_candidates':0,'personal_absolute_paths':0,'method':'Heuristic text patterns plus explicit source allowlist; not a full security guarantee'},
              'publication':'Source archive only; exporter does not publish. Public pilot and validation scope are documented in docs/RELEASE.md.'}
    with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED) as z:
        for name,data in rows:z.writestr(args.name+'/'+name,data)
        z.writestr(args.name+'/RELEASE-MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
    archive.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'archive':str(archive),'files':len(rows),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'published':False}))

if __name__=='__main__':main()
