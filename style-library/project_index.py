"""Read-only navigation over explicit project checkpoints; production notes stay authoritative."""
from pathlib import Path
import copy
import hashlib
import json
import re
import sys
import threading
from library import BASE, STUDIO

REGISTRY = BASE / 'projects.json'
STATE_LOCK = threading.RLock()
TOKEN = re.compile(r'^[a-z0-9][a-z0-9-]*$')
MIME = {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8', '.json': 'text/plain; charset=utf-8',
    '.csv': 'text/plain; charset=utf-8', '.zip': 'application/zip',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}


def registry():
    # An empty installation has no projects until its assistant registers one.
    if not REGISTRY.exists():
        return {'schema_version': 1, 'projects': []}
    data = json.loads(REGISTRY.read_text())
    if not isinstance(data, dict) or not isinstance(data.get('projects'), list):
        raise ValueError('Invalid project navigation index')
    return data


def resolve(project, relative):
    """Require an existing, supported file inside this exact project, even through symlinks."""
    if not TOKEN.fullmatch(project['id']) or not isinstance(relative, str):
        raise ValueError('Invalid project or path')
    root = (STUDIO / 'projects' / project['id']).resolve()
    projects_root = (STUDIO / 'projects').resolve()
    if projects_root.parent != STUDIO.resolve() or root.parent != projects_root:
        raise ValueError('Project root leaves projects folder')
    raw = Path(relative)
    if raw.is_absolute() or '..' in raw.parts or any(p.startswith('.') for p in raw.parts):
        raise ValueError('Use project-relative paths')
    target = (root / raw).resolve()
    if not target.is_relative_to(root) or target.suffix.lower() not in MIME or not target.is_file():
        raise ValueError('Missing or unsupported project file')
    return target


def files(project):
    """The sole allowlist for /project-files/: no arbitrary path or directory route."""
    paths = [n['path'] for n in project.get('source_notes', [])]
    if project.get('cover_path'):
        paths.append(project['cover_path'])
    for artifact in project.get('artifacts', []):
        if artifact.get('path'):
            paths.append(artifact['path'])
        for frame in artifact.get('frames', []):
            paths.append(frame['path'])
        for download in artifact.get('downloads', []):
            paths.append(download['path'])
    return list(dict.fromkeys(paths))


def get_file(project_id, slot):
    if not TOKEN.fullmatch(project_id) or not re.fullmatch(r'0|[1-9][0-9]*', slot):
        raise ValueError('Unknown project file')
    project = next(p for p in registry()['projects'] if p['id'] == project_id)
    target = resolve(project, files(project)[int(slot)])
    return target, MIME[target.suffix.lower()]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def primary_files(artifact):
    return list(dict.fromkeys(([artifact['path']] if artifact.get('path') else []) +
                             [f['path'] for f in artifact.get('frames', [])] +
                             [d['path'] for d in artifact.get('downloads', [])]))


def revision(project):
    """Optimistic guard over navigation, current decisions and exact checkpoint file stats."""
    parts = [json.dumps(project, sort_keys=True)]
    for note in project.get('source_notes', []):
        try:
            parts.append(digest(resolve(project, note['path'])))
        except (OSError, ValueError):
            parts.append('missing:' + note['path'])
    artifact = next(a for a in project['artifacts'] if a['id'] == project['primary_artifact'])
    for path in primary_files(artifact):
        try:
            info = resolve(project, path).stat()
            parts.append(f'{path}:{info.st_size}:{info.st_mtime_ns}')
        except (OSError, ValueError):
            parts.append('missing:' + path)
    return hashlib.sha256('\n'.join(parts).encode()).hexdigest()


def review_options(project):
    artifact = next(a for a in project['artifacts'] if a['id'] == project['primary_artifact'])
    kind = artifact.get('approval_kind') or ('spoken_cut' if artifact.get('role') == 'assembly' else
            'storyboard' if artifact['type'] == 'board' and project.get('format') != 'presentation' else 'final')
    previous = project.get('review_decision', {})
    approved = (previous.get('action') == 'approve' and previous.get('artifact_id') == artifact['id'] and
                previous.get('version') == artifact.get('version'))
    action = 'reopen' if project.get('state') == 'final' or approved else 'approve'
    label = 'Reopen for changes' if action == 'reopen' else {
        'spoken_cut': 'Approve spoken cut', 'storyboard': 'Approve storyboard',
        'final': 'Approve section & mark final' if project.get('format') == 'presentation' else 'Approve & mark final',
    }.get(kind, 'Approve checkpoint')
    return {'action': action, 'kind': kind, 'label': label, 'artifact_id': artifact['id'],
            'version': artifact.get('version', ''), 'checkpoint': artifact.get('label', 'Review'),
            'revision': revision(project), 'decided_at': previous.get('at'),
            'enabled': not project.get('stale') and artifact.get('available', True) and
                       artifact['type'] in ['video', 'board', 'carousel'] and artifact.get('role') != 'history' and
                       kind in ['spoken_cut', 'storyboard', 'final']}


def public_index():
    with STATE_LOCK:
        return _public_index()


def _public_index():
    data = copy.deepcopy(registry())
    for project in data['projects']:
        registered = files(project)
        def expose(record):
            try:
                resolve(project, record['path'])
                record['url'] = f"/project-files/{project['id']}/{registered.index(record['path'])}"
                record['available'] = True
            except (OSError, ValueError):
                record['available'] = False
                record.pop('url', None)
        project['stale'] = False
        for note in project.get('source_notes', []):
            expose(note)
            try:
                if digest(resolve(project, note['path'])) != note.get('sha256'):
                    project['stale'] = True
            except (OSError, ValueError):
                project['stale'] = True
        if project.get('cover_path'):
            cover = {'path': project['cover_path']}
            expose(cover)
            project['cover'] = cover.get('url', '')
        for artifact in project.get('artifacts', []):
            if artifact.get('path'):
                expose(artifact)
            for frame in artifact.get('frames', []):
                expose(frame)
            for download in artifact.get('downloads', []):
                expose(download)
            if artifact.get('frames'):
                artifact['available'] = all(f['available'] for f in artifact['frames'])
        # Compute the revision from the raw entry, never from response-only URLs/availability.
        raw = next(p for p in registry()['projects'] if p['id'] == project['id'])
        project['review'] = review_options(raw)
        project['review']['enabled'] = project['review']['enabled'] and not project['stale']
        primary = next(a for a in project['artifacts'] if a['id'] == project['primary_artifact'])
        project['review']['enabled'] = project['review']['enabled'] and primary.get('available', False)
        if any(not d['available'] for d in primary.get('downloads', [])):
            project['review']['enabled'] = False
    return data


def validate():
    projects = registry()['projects']
    ids = [p['id'] for p in projects]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate project ID')
    for project in projects:
        artifact_ids = [a['id'] for a in project['artifacts']]
        if len(artifact_ids) != len(set(artifact_ids)):
            raise ValueError('Duplicate artifact ID')
        if project['primary_artifact'] not in artifact_ids:
            raise ValueError('Unknown primary artifact')
        for relative in files(project):
            resolve(project, relative)
        for note in project['source_notes']:
            if note['sha256'] != digest(resolve(project, note['path'])):
                raise ValueError(f"Stale navigation: {project['id']} / {note['path']}")
    return {'projects': len(projects), 'artifacts': sum(len(p['artifacts']) for p in projects),
            'files': sum(len(files(p)) for p in projects)}


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] != 'validate':
        raise SystemExit('Usage: python style-library/project_index.py validate')
    print(json.dumps(validate()))
