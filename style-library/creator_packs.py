"""Creator packs: build a pack file from a collection, then verify, install, upgrade or remove it.

A pack holds one creator's own videos, their posters, technique families with exact examples,
optional editable recipe folders and the pack's own license. Installing adds those records under
IDs that start with the pack ID, puts the files in references/pack-<pack-id>/ and the library's
poster folders, and creates or updates the pack's collection. It never changes the owner's
projects, personal collections, reference notes, approvals, removed-reference markers or any
record the pack did not install. See docs/PACKS.md.
"""
import copy
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
from urllib.parse import urlparse
import uuid
import zipfile

import disk
import library
import project_index as index
import review_actions as storage
import saved_collections
from security import registered_file

FORMAT = 'ai-video-studio-pack'
FORMAT_VERSION = 1
MANIFEST = 'pack.json'
LIBRARY = 'library.json'
LICENSE = 'LICENSE.txt'
README = 'README.md'

VIDEO = {'.mp4', '.mov', '.webm', '.m4v'}
IMAGE = {'.jpg', '.jpeg', '.png', '.webp'}
AUDIO = {'.wav', '.mp3', '.m4a', '.aac'}
RECIPE = {'.html', '.css', '.js', '.mjs', '.json', '.md', '.txt', '.svg', '.gif',
          '.woff', '.woff2', '.ttf', '.otf'} | IMAGE | VIDEO | AUDIO

MAX_FILES = 5000
MAX_TOTAL = 16 * 10**9
MAX_MEMBERS = 500
LIMITS = {'library': 8 * 10**6, 'license': 10**6, 'readme': 10**6, 'media': 4 * 10**9,
          'video-poster': 20 * 10**6, 'example-poster': 20 * 10**6, 'recipe': 500 * 10**6}
# Small fixed-name files are replaced inside the recoverable JSON transaction.
SMALL_FILE = 2 * 10**6
LARGE_PACK_WARNING = 3 * 10**9

PART = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}')
RESERVED = {'con', 'prn', 'aux', 'nul', *(f'com{i}' for i in range(10)), *(f'lpt{i}' for i in range(10))}
VERSION = re.compile(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})')
SHA256 = re.compile(r'[0-9a-f]{64}')
HEX_COLOR = re.compile(r'#[0-9A-Fa-f]{3,8}')
FAMILY = re.compile(r'tech-[a-z0-9]+(?:-[a-z0-9]+)*')
OS_METADATA = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}


class PackError(ValueError):
    """A pack or request that cannot be used. Nothing was changed when this is raised."""


# ---------------------------------------------------------------------------------------------
# Small helpers


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def record_hash(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def pretty(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + '\n').encode()


def now():
    return datetime.now(timezone.utc).isoformat()


def version_key(value):
    match = VERSION.fullmatch(value)
    return tuple(int(n) for n in match.groups())


def strict_json(raw, label):
    def pairs(items):
        keys = [k for k, _ in items]
        if len(keys) != len(set(keys)):
            raise PackError(f'{label} repeats a field.')
        return dict(items)
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PackError(f'{label} is not valid JSON.') from error


def text(value, label, limit, required=True):
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        raise PackError(f'{label} needs text of up to {limit} characters.')
    if any(ord(c) < 32 and c not in '\n\t' for c in value) or '\x7f' in value:
        raise PackError(f'{label} contains control characters.')
    return value


def texts(value, label, items=60, limit=600):
    if not isinstance(value, list) or len(value) > items:
        raise PackError(f'{label} needs a list of up to {items} items.')
    return [text(v, label, limit) for v in value]


def number(value, label, low=0.0, high=86400.0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise PackError(f'{label} needs a number between {low:g} and {high:g}.')
    return value


def https_url(value, label):
    text(value, label, 500)
    parsed = urlparse(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise PackError(f'{label} needs a public https link.')
    return value


def hash_stream(stream, expected_bytes, out=None):
    """Hash exactly expected_bytes from a stream, refusing a longer or shorter file."""
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = stream.read(1 << 20)
        if not chunk:
            break
        total += len(chunk)
        if total > expected_bytes:
            raise PackError('A pack file is larger than its manifest says.')
        digest.update(chunk)
        if out is not None:
            out.write(chunk)
    if total != expected_bytes:
        raise PackError('A pack file is smaller than its manifest says.')
    return digest.hexdigest()


def file_sha256(path):
    with open(path, 'rb') as stream:
        return hash_stream(stream, os.fstat(stream.fileno()).st_size)


def archive_parts(name):
    """Split a pack-relative path, refusing anything unsafe on macOS, Linux or Windows."""
    if (not isinstance(name, str) or not 0 < len(name) <= 240 or '\\' in name
            or name.startswith('/') or ':' in name):
        raise PackError(f'Unsafe path in the pack: {name!r}')
    parts = name.split('/')
    for part in parts:
        if (not PART.fullmatch(part) or part.endswith('.')
                or part.split('.')[0].lower() in RESERVED):
            raise PackError(f'Unsafe path in the pack: {name!r}')
    return parts


def file_kind(name):
    parts = archive_parts(name)
    suffix = PurePosixPath(name).suffix.lower()
    if name == LIBRARY:
        return 'library'
    if name == LICENSE:
        return 'license'
    if name == README:
        return 'readme'
    if parts[0] == 'media' and len(parts) == 2 and suffix in VIDEO:
        return 'media'
    if parts[:2] == ['posters', 'videos'] and len(parts) == 3 and suffix in IMAGE:
        return 'video-poster'
    if parts[:2] == ['posters', 'examples'] and len(parts) == 3 and suffix in IMAGE:
        return 'example-poster'
    if parts[0] == 'recipes' and 3 <= len(parts) <= 8 and suffix in RECIPE:
        return 'recipe'
    raise PackError(f'Unexpected file in the pack: {name}')


def pack_folder(pack_id):
    return f'references/pack-{pack_id}'


def install_path(pack_id, name):
    """Studio-relative destination of a pack file."""
    parts = name.split('/')
    if parts[0] in {'media', 'recipes'} or name in {LICENSE, README}:
        return f'{pack_folder(pack_id)}/{name}'
    if parts[:2] == ['posters', 'videos']:
        return f'style-library/dist/assets/posters/packs/{pack_id}/{parts[2]}'
    if parts[:2] == ['posters', 'examples']:
        return f'style-library/dist/assets/techniques/packs/{pack_id}/{parts[2]}'
    raise PackError(f'{name} is not installed as a file.')


def dist_relative(path):
    return path.removeprefix('style-library/dist/')


def studio_target(relative):
    """A destination inside this studio with no symlinked folder on the way to it."""
    root = index.STUDIO.resolve()
    path = root.joinpath(*relative.split('/'))
    current = root
    for part in relative.split('/'):
        current = current / part
        if current.is_symlink():
            raise PackError(f'{relative} passes through a shortcut (symlink). Nothing was installed.')
        if not current.exists():
            break
    if not path.resolve().is_relative_to(root):
        raise PackError(f'{relative} would leave the studio.')
    return path


# ---------------------------------------------------------------------------------------------
# Reading a pack file or an unzipped pack folder


class ZipSource:
    def __init__(self, path):
        self.label = Path(path).name
        try:
            self.zip = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as error:
            raise PackError('This is not a readable pack file.') from error
        infos = self.zip.infolist()
        names = [info.filename for info in infos]
        if len(infos) > MAX_FILES + 1:
            raise PackError('The pack has too many files.')
        if len(set(names)) != len(names) or len({n.casefold() for n in names}) != len(names):
            raise PackError('The pack repeats a file name.')
        for info in infos:
            mode = info.external_attr >> 16
            if info.is_dir():
                raise PackError(f'Unexpected folder entry in the pack: {info.filename}. Use the original pack file.')
            if stat.S_IFMT(mode) and not stat.S_ISREG(mode):
                raise PackError(f'The pack contains a link or special file: {info.filename}')
            if info.flag_bits & 0x1:
                raise PackError('The pack is encrypted.')
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise PackError(f'Unsupported compression for {info.filename}.')
            archive_parts(info.filename)
        self.infos = {info.filename: info for info in infos}

    def names(self):
        return set(self.infos)

    def size(self, name):
        return self.infos[name].file_size

    def open(self, name):
        return self.zip.open(self.infos[name])

    def path(self, name):
        return None

    def close(self):
        self.zip.close()


class FolderSource:
    """An unzipped pack, for browsers that unpack downloads automatically."""

    def __init__(self, path):
        folder = Path(path)
        if folder.is_symlink():
            raise PackError('Use the pack folder itself, not a shortcut to it.')
        self.root = folder.resolve()
        self.label = self.root.name
        self.sizes = {}
        junction = getattr(os.path, 'isjunction', lambda _: False)
        for current, dirs, files in os.walk(self.root, followlinks=False):
            for name in dirs:
                if Path(current, name).is_symlink() or junction(os.path.join(current, name)):
                    raise PackError(f'The pack folder contains a shortcut: {name}')
            for name in files:
                full = Path(current, name)
                if name in OS_METADATA or name.startswith('._'):
                    continue
                info = os.lstat(full)
                if not stat.S_ISREG(info.st_mode):
                    raise PackError(f'The pack folder contains a link or special file: {name}')
                relative = full.relative_to(self.root).as_posix()
                archive_parts(relative)
                self.sizes[relative] = info.st_size
            if len(self.sizes) > MAX_FILES + 1:
                raise PackError('The pack folder has too many files.')
        if len({n.casefold() for n in self.sizes}) != len(self.sizes):
            raise PackError('The pack folder repeats a file name.')

    def names(self):
        return set(self.sizes)

    def size(self, name):
        return self.sizes[name]

    def path(self, name):
        full = self.root.joinpath(*name.split('/'))
        if full.is_symlink() or not full.resolve().is_relative_to(self.root):
            raise PackError(f'The pack folder changed: {name}')
        return full

    def open(self, name):
        return open(self.path(name), 'rb')

    def close(self):
        pass


class Pack:
    def __init__(self, source, manifest, manifest_raw, data, archive_sha256):
        self.source = source
        self.manifest = manifest
        self.data = data
        self.identity = hashlib.sha256(manifest_raw).hexdigest()
        self.archive_sha256 = archive_sha256
        self.files = {f['path']: f for f in manifest['files']}

    @property
    def pack_id(self):
        return self.manifest['pack_id']

    def close(self):
        self.source.close()


def open_pack(path):
    """Open and fully verify a pack: manifest, every hash, paths, sizes and library records."""
    path = Path(path).expanduser()
    if not path.exists():
        raise PackError(f'No pack file at {path}.')
    source = FolderSource(path) if path.is_dir() else ZipSource(path)
    try:
        names = source.names()
        if MANIFEST not in names:
            raise PackError('This file has no pack manifest (pack.json). Use the pack file from your download.')
        if source.size(MANIFEST) > 4 * 10**6:
            raise PackError('The pack manifest is too large.')
        with source.open(MANIFEST) as stream:
            manifest_raw = stream.read(4 * 10**6 + 1)
        manifest = check_manifest(strict_json(manifest_raw, 'The pack manifest'))
        files = {f['path']: f for f in manifest['files']}
        extra = sorted(names - set(files) - {MANIFEST})
        missing = sorted(set(files) - names)
        if extra:
            raise PackError('Unexpected file in the pack: ' + ', '.join(extra[:5]))
        if missing:
            raise PackError('The pack is missing files: ' + ', '.join(missing[:5]))
        library_raw = None
        for name, row in sorted(files.items()):
            if source.size(name) != row['bytes']:
                raise PackError(f'{name} does not match the pack manifest.')
            buffer = io.BytesIO() if name == LIBRARY else None
            try:
                with source.open(name) as stream:
                    digest = hash_stream(stream, row['bytes'], buffer)
            except (zipfile.BadZipFile, OSError) as error:
                raise PackError(f'{name} could not be read from the pack.') from error
            if digest != row['sha256']:
                raise PackError(f'{name} does not match its checksum. The pack may be damaged or changed.')
            if buffer is not None:
                library_raw = buffer.getvalue()
        data = check_library(strict_json(library_raw, 'The pack library'), manifest)
        archive = file_sha256(path) if path.is_file() else None
        return Pack(source, manifest, manifest_raw, data, archive)
    except Exception:
        source.close()
        raise


def check_manifest(m):
    required = {'format', 'format_version', 'pack_id', 'name', 'version', 'author', 'license', 'files'}
    if not isinstance(m, dict) or not required <= set(m) or set(m) - required - {'description'}:
        raise PackError('The pack manifest has missing or unknown fields.')
    if m['format'] != FORMAT:
        raise PackError('This is not an AI Video Studio pack.')
    if m['format_version'] != FORMAT_VERSION:
        raise PackError('This pack needs a newer version of AI Video Studio. Update the studio, then install it.')
    if not isinstance(m['pack_id'], str) or not index.TOKEN.fullmatch(m['pack_id']) or len(m['pack_id']) > 40 or m['pack_id'].startswith('tech-'):
        raise PackError('The pack ID is not valid.')
    try:
        saved_collections.name(m['name'])
    except storage.ReviewError as error:
        raise PackError('The pack name is not valid.') from error
    if not isinstance(m['version'], str) or not VERSION.fullmatch(m['version']):
        raise PackError('The pack version must look like 1.0.0.')
    author = m['author']
    if not isinstance(author, dict) or not {'name', 'creator_id'} <= set(author) or set(author) - {'name', 'creator_id', 'url'}:
        raise PackError('The pack author is not valid.')
    text(author['name'], 'The author name', 80)
    if not isinstance(author['creator_id'], str) or not index.TOKEN.fullmatch(author['creator_id']) or len(author['creator_id']) > 60:
        raise PackError('The author ID is not valid.')
    if 'url' in author:
        https_url(author['url'], 'The author link')
    lic = m['license']
    if not isinstance(lic, dict) or set(lic) != {'title', 'summary', 'file'} or lic['file'] != LICENSE:
        raise PackError('The pack license is not valid.')
    text(lic['title'], 'The license title', 120)
    text(lic['summary'], 'The license summary', 600)
    text(m.get('description'), 'The pack description', 1000, required=False)
    if not isinstance(m['files'], list) or not 2 <= len(m['files']) <= MAX_FILES:
        raise PackError('The pack file list is not valid.')
    seen, total = set(), 0
    for row in m['files']:
        if not isinstance(row, dict) or set(row) != {'path', 'bytes', 'sha256'}:
            raise PackError('The pack file list is not valid.')
        kind = file_kind(row['path'])
        if row['path'].casefold() in seen:
            raise PackError(f'The pack lists {row["path"]} twice.')
        seen.add(row['path'].casefold())
        if type(row['bytes']) is not int or not 0 < row['bytes'] <= LIMITS[kind]:
            raise PackError(f'{row["path"]} is empty or too large for a pack.')
        if not isinstance(row['sha256'], str) or not SHA256.fullmatch(row['sha256']):
            raise PackError(f'{row["path"]} needs a SHA-256 checksum.')
        total += row['bytes']
    if total > MAX_TOTAL:
        raise PackError('The pack is too large.')
    if LIBRARY not in seen or LICENSE.casefold() not in seen:
        raise PackError('The pack needs library.json and LICENSE.txt.')
    return m


ENTRY_REQUIRED = {'id', 'title', 'version', 'creator', 'creator_id', 'summary', 'duration', 'media', 'poster', 'source_sha256'}
ENTRY_OPTIONAL = {'subtitle', 'creator_handle', 'creator_aliases', 'tags', 'palette', 'traits', 'keep', 'avoid',
                  'moments', 'evidence', 'poster_at', 'source_url'}
FAMILY_FIELDS = {'id', 'title', 'category', 'summary', 'direction', 'aliases', 'keep', 'avoid', 'evidence', 'default_example', 'examples'}
EXAMPLE_FIELDS = {'id', 'style_id', 'label', 'start', 'end', 'poster_at', 'poster', 'evidence'}


def check_library(data, manifest):
    """Validate pack records. Every ID starts with the pack ID; every file is referenced."""
    pid = manifest['pack_id']
    files = {f['path']: f for f in manifest['files']}
    kinds = {name: file_kind(name) for name in files}
    if not isinstance(data, dict) or set(data) != {'entries', 'techniques', 'members'}:
        raise PackError('The pack library has missing or unknown fields.')
    entries, families, members = data['entries'], data['techniques'], data['members']
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_MEMBERS:
        raise PackError('The pack needs 1–500 videos.')
    if not isinstance(families, list) or len(families) > 2000 or not isinstance(members, list) or not 1 <= len(members) <= MAX_MEMBERS:
        raise PackError('The pack needs technique families and 1–500 collection items.')
    used = {LIBRARY, LICENSE, README}
    by_id = {}

    def pack_file(name, kind, label):
        if kinds.get(name) != kind:
            raise PackError(f'{label} needs a {kind.replace("-", " ")} listed in the pack.')
        used.add(name)
        return name

    def own_id(value, label, prefix):
        if not isinstance(value, str) or not value.startswith(prefix) or len(value) > 160:
            raise PackError(f'{label} must start with {prefix!r}.')
        return value

    for e in entries:
        if not isinstance(e, dict) or not ENTRY_REQUIRED <= set(e) or set(e) - ENTRY_REQUIRED - ENTRY_OPTIONAL:
            raise PackError('A pack video has missing or unknown fields.')
        eid = own_id(e['id'], 'Each video ID', pid + '-')
        if not index.TOKEN.fullmatch(eid) or eid in by_id:
            raise PackError(f'Video ID {eid} is not valid or repeated.')
        by_id[eid] = e
        for key, limit in [('title', 200), ('version', 60), ('summary', 3000)]:
            text(e[key], f'{eid} {key}', limit)
        text(e.get('subtitle'), f'{eid} subtitle', 300, required=False)
        text(e.get('evidence'), f'{eid} evidence', 6000, required=False)
        if e['creator_id'] != manifest['author']['creator_id'] or e['creator'] != manifest['author']['name']:
            raise PackError(f'{eid} must be the pack author’s own video.')
        if 'creator_handle' in e:
            text(e['creator_handle'], f'{eid} handle', 80)
        for key in ('creator_aliases', 'tags', 'keep', 'avoid'):
            if key in e:
                texts(e[key], f'{eid} {key}')
        if 'palette' in e and (not isinstance(e['palette'], list) or len(e['palette']) > 8
                               or not all(isinstance(c, str) and HEX_COLOR.fullmatch(c) for c in e['palette'])):
            raise PackError(f'{eid} palette needs hex colors.')
        if 'traits' in e and (not isinstance(e['traits'], dict) or len(e['traits']) > 30):
            raise PackError(f'{eid} traits need named text.')
        for key, value in e.get('traits', {}).items():
            text(key, f'{eid} trait name', 80)
            text(value, f'{eid} trait', 2000)
        duration = number(e['duration'], f'{eid} duration', 0.001)
        if 'poster_at' in e:
            number(e['poster_at'], f'{eid} poster time', 0, duration)
        moments = e.get('moments', [])
        if not isinstance(moments, list) or len(moments) > 300:
            raise PackError(f'{eid} moments are not valid.')
        for moment in moments:
            if not isinstance(moment, dict) or not {'time', 'label'} <= set(moment) or set(moment) - {'time', 'label', 'note'}:
                raise PackError(f'{eid} moments are not valid.')
            if number(moment['time'], f'{eid} moment', 0, duration) >= duration:
                raise PackError(f'{eid} has a moment past the end of the video.')
            text(moment['label'], f'{eid} moment label', 300)
            text(moment.get('note'), f'{eid} moment note', 1000, required=False)
        if 'source_url' in e:
            https_url(e['source_url'], f'{eid} original link')
        pack_file(e['media'], 'media', f'{eid} video')
        pack_file(e['poster'], 'video-poster', f'{eid} poster')
        if e['source_sha256'] != files[e['media']]['sha256']:
            raise PackError(f'{eid} checksum does not match its video.')

    family_ids, example_ids, recipes = set(), set(), set()
    for f in families:
        if not isinstance(f, dict) or not FAMILY_FIELDS <= set(f) or set(f) - FAMILY_FIELDS - {'recipe'}:
            raise PackError('A pack technique has missing or unknown fields.')
        fid = own_id(f['id'], 'Each technique ID', f'tech-{pid}-')
        if not FAMILY.fullmatch(fid) or fid in family_ids or fid in by_id:
            raise PackError(f'Technique ID {fid} is not valid or repeated.')
        family_ids.add(fid)
        for key, limit in [('title', 200), ('category', 120), ('summary', 2000), ('direction', 3000), ('evidence', 6000)]:
            text(f[key], f'{fid} {key}', limit)
        for key in ('aliases', 'keep', 'avoid'):
            texts(f[key], f'{fid} {key}')
        if not isinstance(f['examples'], list) or not 1 <= len(f['examples']) <= 500:
            raise PackError(f'{fid} needs 1–500 examples.')
        for x in f['examples']:
            if not isinstance(x, dict) or set(x) != EXAMPLE_FIELDS:
                raise PackError(f'An example in {fid} has missing or unknown fields.')
            xid = own_id(x['id'], 'Each example ID', pid + '-')
            if not index.TOKEN.fullmatch(xid) or xid in example_ids:
                raise PackError(f'Example ID {xid} is not valid or repeated.')
            example_ids.add(xid)
            entry = by_id.get(x['style_id'])
            if entry is None:
                raise PackError(f'{xid} uses a video that is not in the pack.')
            start = number(x['start'], f'{xid} start')
            at = number(x['poster_at'], f'{xid} poster time')
            end = number(x['end'], f'{xid} end')
            if not 0 <= start <= at < end <= entry['duration']:
                raise PackError(f'{xid} needs a window inside its video.')
            text(x['label'], f'{xid} label', 300)
            text(x['evidence'], f'{xid} evidence', 3000)
            pack_file(x['poster'], 'example-poster', f'{xid} poster')
        if f['default_example'] not in {x['id'] for x in f['examples']}:
            raise PackError(f'{fid} default example is not one of its examples.')
        if 'recipe' in f:
            parts = archive_parts(f['recipe']) if isinstance(f['recipe'], str) else []
            folder = [n for n in files if n.startswith(f'{f["recipe"]}/')]
            if len(parts) != 2 or parts[0] != 'recipes' or not folder or f['recipe'] in recipes:
                raise PackError(f'{fid} recipe needs its own folder of files in the pack.')
            recipes.add(f['recipe'])
            used.update(folder)

    seen_members = set()
    for m in members:
        kind = m.get('kind') if isinstance(m, dict) else None
        fields = {'example': {'kind', 'technique_id', 'example_id'}, 'reference': {'kind', 'reference_id'},
                  'moment': {'kind', 'reference_id', 'time'}}.get(kind)
        if fields is None or set(m) != fields:
            raise PackError('Pack collection items must be exact examples, videos or moments.')
        if kind == 'example':
            family = next((f for f in families if f['id'] == m['technique_id']), None)
            if family is None or m['example_id'] not in {x['id'] for x in family['examples']}:
                raise PackError('A pack collection item uses a missing example.')
        else:
            entry = by_id.get(m['reference_id'])
            if entry is None:
                raise PackError('A pack collection item uses a missing video.')
            if kind == 'moment':
                number(m['time'], 'A collection moment', 0, entry['duration'])
        key = canonical(m)
        if key in seen_members:
            raise PackError('A pack collection item is repeated.')
        seen_members.add(key)
    unused = sorted(set(files) - used)
    if unused:
        raise PackError('Unexpected file in the pack: ' + ', '.join(unused[:5]))
    return data


def describe(pack):
    m = pack.manifest
    total = sum(f['bytes'] for f in m['files'])
    return {'pack_id': m['pack_id'], 'name': m['name'], 'version': m['version'], 'author': m['author'],
            'license': m['license'], 'description': m.get('description'),
            'videos': len(pack.data['entries']), 'techniques': len(pack.data['techniques']),
            'examples': sum(len(f['examples']) for f in pack.data['techniques']),
            'recipes': sum('recipe' in f for f in pack.data['techniques']),
            'collection_items': len(pack.data['members']), 'files': len(m['files']), 'bytes': total,
            'size': disk.size_label(total), 'archive_sha256': pack.archive_sha256, 'verified': True}


def verify(path):
    pack = open_pack(path)
    try:
        return describe(pack)
    finally:
        pack.close()


# ---------------------------------------------------------------------------------------------
# Studio state


class State:
    """Snapshots of every owner file an install or removal may change."""

    def __init__(self):
        storage.check_storage()
        for journal in storage.JOURNALS.glob('*/transaction.json'):
            if json.loads(journal.read_text()).get('state') == 'prepared':
                raise PackError('An earlier save needs recovery first. Ask your assistant to recover it, then install the pack.')
        self.raw = {}
        self.catalog_path = self.owner_path(storage.CATALOG)
        self.catalog = self.load(self.catalog_path, {'schema_version': 4, 'entries': [], 'techniques': []})
        if not isinstance(self.catalog.get('entries'), list) or not isinstance(self.catalog.setdefault('techniques', []), list):
            raise PackError('The library catalog needs attention before installing packs.')
        try:
            self.collections_path, self.collections, _ = saved_collections.read()
        except storage.ReviewError as error:
            raise PackError(str(error)) from error
        self.raw[self.collections_path] = self.collections_path.read_bytes() if self.collections_path.exists() else None
        self.evidence_path = self.owner_path(storage.BASE / 'runtime' / 'source-evidence.json')
        self.evidence = self.load(self.evidence_path, [])
        if not isinstance(self.evidence, list):
            raise PackError('Source evidence needs attention before installing packs.')
        self.packs_path = self.owner_path(storage.BASE / 'packs.json')
        self.packs = self.load(self.packs_path, {'schema_version': 1, 'packs': {}})
        if self.packs.get('schema_version') != 1 or not isinstance(self.packs.get('packs'), dict):
            raise PackError('The installed-pack record needs attention. Existing records are preserved.')
        self.notes_path = storage.BASE / 'reference-notes.json'

    def owner_path(self, path):
        if path.is_symlink() or path.resolve() != path.absolute():
            raise PackError(f'{path.name} needs a safe local path.')
        return path

    def load(self, path, default):
        raw = path.read_bytes() if path.exists() else None
        self.raw[path] = raw
        if raw is None:
            return copy.deepcopy(default)
        if len(raw) > 64 * 10**6:
            raise PackError(f'{path.name} is too large to update safely.')
        return json.loads(raw)

    def expected(self):
        return {path.resolve() if path.exists() else path: hashlib.sha256(raw).hexdigest() if raw is not None else None
                for path, raw in self.raw.items()}


def owned_records(record):
    return record.get('records', {'entries': {}, 'techniques': {}, 'examples': {}}) if record else {'entries': {}, 'techniques': {}, 'examples': {}}


def family_definition(family):
    return {k: v for k, v in family.items() if k not in {'examples', 'default_example'}}


def local_edits(catalog, owned):
    """Records this pack installed that were changed afterwards in this studio."""
    entries = {e['id']: e for e in catalog['entries']}
    families = {t['id']: t for t in catalog['techniques']}
    edited = [eid for eid, digest in owned['entries'].items() if eid in entries and record_hash(entries[eid]) != digest]
    edited += [fid for fid, digest in owned['techniques'].items()
               if fid in families and record_hash(family_definition(families[fid])) != digest]
    for key, digest in owned['examples'].items():
        fid, _, xid = key.partition('@')
        x = next((x for x in families.get(fid, {}).get('examples', []) if x['id'] == xid), None)
        if x is not None and record_hash(x) != digest:
            edited.append(key)
    return edited


def references_to(state, entry_ids, example_keys):
    """Count saved owner items that point at records an install or removal takes away."""
    count = {'personal_collection_items': 0, 'reference_notes': 0}
    for c in state.collections.get('collections', []):
        if c.get('kind') == 'pack':
            continue
        for m in c.get('members', []):
            key = f"{m.get('technique_id')}@{m.get('example_id')}"
            if m.get('reference_id') in entry_ids or key in example_keys:
                count['personal_collection_items'] += 1
    try:
        notes = json.loads(state.notes_path.read_text()).get('notes', []) if state.notes_path.exists() else []
    except (OSError, ValueError, AttributeError):
        notes = []
    for n in notes if isinstance(notes, list) else []:
        if isinstance(n, dict) and (n.get('reference_id') in entry_ids or f"{n.get('reference_id')}@{n.get('example_id')}" in example_keys):
            count['reference_notes'] += 1
    return count


def pack_collection(collections, pack_id):
    return next((c for c in collections['collections'] if c.get('kind') == 'pack' and c.get('pack_id') == pack_id), None)


def remove_pack_records(catalog, evidence, owned, keep_entries=(), keep_families=(), keep_examples=()):
    """Take out records this pack owns, keeping owner examples and the families that hold them."""
    drop_entries = set(owned['entries']) - set(keep_entries)
    catalog['entries'] = [e for e in catalog['entries'] if e['id'] not in drop_entries]
    evidence[:] = [r for r in evidence if r.get('id') not in drop_entries]
    drop_examples = set(owned['examples']) - set(keep_examples)
    families = []
    for family in catalog['techniques']:
        if family['id'] in owned['techniques'] or any(f"{family['id']}@{x['id']}" in drop_examples for x in family['examples']):
            family['examples'] = [x for x in family['examples'] if f"{family['id']}@{x['id']}" not in drop_examples]
            if family['id'] in owned['techniques'] and family['id'] not in keep_families:
                if not family['examples']:
                    continue
                # Owner examples remain, so the family stays as the owner's own record.
                family.pop('pack', None)
                family.pop('recipe', None)
            if family['examples'] and family.get('default_example') not in {x['id'] for x in family['examples']}:
                family['default_example'] = family['examples'][0]['id']
            if not family['examples'] and family['id'] not in keep_families:
                continue
        families.append(family)
    catalog['techniques'] = families


# ---------------------------------------------------------------------------------------------
# Installing


def install(path, dry_run=False, replace_local_edits=False, allow_downgrade=False):
    pack = open_pack(path)
    try:
        with index.STATE_LOCK:
            state = State()
            plan = plan_install(pack, state, replace_local_edits, allow_downgrade)
            if dry_run or plan['unchanged']:
                plan['report']['dry_run'] = dry_run
                return plan['report']
            return apply(plan, state, pack)
    finally:
        pack.close()


def plan_install(pack, state, replace_local_edits=False, allow_downgrade=False):
    m, data, stamp = pack.manifest, pack.data, now()
    pid = m['pack_id']
    previous = state.packs['packs'].get(pid)
    owned = owned_records(previous)
    if previous is None:
        action = 'install'
    else:
        old, new = version_key(previous['version']), version_key(m['version'])
        action = 'upgrade' if new > old else 'reinstall' if new == old else 'downgrade'
        if action == 'downgrade' and not allow_downgrade:
            raise PackError(f'{m["name"]} {previous["version"]} is already installed; this file is the older {m["version"]}. Nothing was changed.')
    catalog = copy.deepcopy(state.catalog)
    evidence = copy.deepcopy(state.evidence)
    entries = {e['id']: e for e in catalog['entries']}
    families = {t['id']: t for t in catalog['techniques']}
    warnings = []

    # A family kept after uninstalling because it held the owner's own examples can be taken back.
    adoptable = {}
    for removed in state.packs.get('removed', []):
        if removed.get('pack_id') == pid:
            adoptable.update(removed.get('kept_families', {}))
    adopted = [fid for fid in adoptable if fid in families and fid not in owned['techniques']
               and any(f['id'] == fid for f in data['techniques'])]
    edited_adopted = [fid for fid in adopted if record_hash(family_definition(families[fid])) != adoptable[fid]]

    # Never take over a record this pack did not install.
    for e in data['entries']:
        if (e['id'] in entries and e['id'] not in owned['entries']) or e['id'] in families:
            raise PackError(f'Your library already has a record called {e["id"]}. Nothing was installed.')
    for f in data['techniques']:
        if (f['id'] in families and f['id'] not in owned['techniques'] and f['id'] not in adopted) or f['id'] in entries:
            raise PackError(f'Your library already has a technique called {f["id"]}. Nothing was installed.')
        existing = {x['id'] for x in families.get(f['id'], {}).get('examples', [])}
        for x in f['examples']:
            if x['id'] in existing and f"{f['id']}@{x['id']}" not in owned['examples']:
                raise PackError(f'Your library already has an example called {x["id"]}. Nothing was installed.')
    edited = local_edits(catalog, owned) + edited_adopted
    if edited and not replace_local_edits:
        raise PackError('These pack records were changed in this studio: ' + ', '.join(edited[:8]) +
                        '. Nothing was installed. Ask the owner before replacing them (--replace-local-edits).')

    # Media paths and files this version installs.
    desired, name_of = {}, {}
    for name, row in pack.files.items():
        if name != LIBRARY:
            desired[install_path(pid, name)] = row
            name_of[install_path(pid, name)] = name
    new_media = {e['id']: install_path(pid, e['media']) for e in data['entries']}
    # Owner examples on a pack video block changing or dropping that video.
    for family in catalog['techniques']:
        for x in family['examples']:
            key = f"{family['id']}@{x['id']}"
            if x['style_id'] in owned['entries'] and key not in owned['examples'] and new_media.get(x['style_id']) != x.get('source_path'):
                raise PackError(f'Your example {x["id"]} uses the pack video {x["style_id"]}, which this version changes or removes. Nothing was installed.')

    # Records that leave with this version.
    new_entry_ids = {e['id'] for e in data['entries']}
    new_example_keys = {f"{f['id']}@{x['id']}" for f in data['techniques'] for x in f['examples']}
    gone_entries = set(owned['entries']) - new_entry_ids
    gone_examples = set(owned['examples']) - new_example_keys
    changed_entries = {eid for eid in owned['entries'] if eid in entries and eid in new_media and entries[eid].get('media_path') != new_media[eid]}
    changed_examples = {f"{t['id']}@{x['id']}" for t in data['techniques'] for x in t['examples']
                        if x['style_id'] in changed_entries and f"{t['id']}@{x['id']}" in owned['examples']}
    affected = references_to(state, gone_entries | changed_entries, gone_examples | changed_examples)
    remove_pack_records(catalog, evidence, owned, keep_entries=new_entry_ids,
                        keep_families={f['id'] for f in data['techniques']}, keep_examples=new_example_keys)
    entries = {e['id']: e for e in catalog['entries']}
    families = {t['id']: t for t in catalog['techniques']}

    # Credit stays consistent with how this studio already names the creator.
    creator = m['author']['name']
    known = next((e['creator'] for e in catalog['entries'] if e.get('creator_id') == m['author']['creator_id']
                  and e['id'] not in new_entry_ids and e.get('creator')), None)
    if known and known != creator:
        warnings.append(f'Kept this studio’s existing creator name “{known}” for {m["author"]["creator_id"]}.')
        creator = known
    other_sources = {library.source_key(e['source_url']): e['id'] for e in catalog['entries']
                     if e.get('source_url') and e['id'] not in new_entry_ids}
    readme = f'{pack_folder(pid)}/{README}'
    notes = [n for n in (readme, f'{pack_folder(pid)}/{LICENSE}') if n.removeprefix(pack_folder(pid) + '/') in pack.files]
    records = {'entries': {}, 'techniques': {}, 'examples': {}}
    # The version lives in packs.json, so an upgrade leaves unchanged records byte-identical.
    marker = {'id': pid, 'name': m['name']}
    counts = {'added': {'videos': 0, 'techniques': 0, 'examples': 0}, 'updated': {'videos': 0, 'techniques': 0, 'examples': 0}}
    for e in data['entries']:
        prior = entries.get(e['id'])
        sha = e['source_sha256']
        record = {'id': e['id'], 'title': e['title'], 'subtitle': e.get('subtitle', ''), 'version': e['version'],
                  'collection': 'reference', 'creator': creator, 'creator_id': m['author']['creator_id']}
        for key in ('creator_handle', 'creator_aliases'):
            if key in e:
                record[key] = e[key]
        record.update({'created_at': prior.get('created_at', stamp) if prior else stamp, 'summary': e['summary'],
                       'media_path': new_media[e['id']], 'duration': e['duration'], 'source_sha256': sha,
                       'technique_review_sha256': sha, 'poster': dist_relative(install_path(pid, e['poster'])),
                       'review_status': 'reference', 'palette': e.get('palette', []), 'tags': e.get('tags', []),
                       'traits': e.get('traits', {}), 'keep': e.get('keep', []), 'avoid': e.get('avoid', []),
                       'moments': e.get('moments', []), 'notes': notes, 'evidence': e.get('evidence', ''),
                       'pack': marker})
        if 'poster_at' in e:
            record['poster_at'] = e['poster_at']
        if e.get('source_url'):
            duplicate = other_sources.get(library.source_key(e['source_url']))
            if duplicate:
                warnings.append(f'{duplicate} already links the original post of {e["title"]}; the pack copy is kept as its own entry without the link.')
            else:
                record['source_url'] = e['source_url']
        if prior is None:
            catalog['entries'].append(record)
            counts['added']['videos'] += 1
        else:
            if prior != record:
                counts['updated']['videos'] += 1
            catalog['entries'][catalog['entries'].index(prior)] = record
        records['entries'][e['id']] = record_hash(record)
        proof = {'id': e['id'], 'source': record['media_path'], 'version': e['version'], 'source_sha256': sha}
        position = next((i for i, r in enumerate(evidence) if r.get('id') == e['id']), None)
        if position is None:
            evidence.append(proof)
        else:
            evidence[position] = proof
    by_entry = {e['id']: e for e in catalog['entries']}
    for f in data['techniques']:
        prior = families.get(f['id'])
        definition = {k: f[k] for k in ('id', 'title', 'category', 'summary', 'direction', 'aliases', 'keep', 'avoid', 'evidence')}
        definition['pack'] = marker
        if 'recipe' in f:
            definition['recipe'] = install_path(pid, f['recipe'])
        examples = []
        for x in f['examples']:
            entry = by_entry[x['style_id']]
            example = {'id': x['id'], 'style_id': x['style_id'], 'start': x['start'], 'end': x['end'],
                       'poster_at': x['poster_at'], 'label': x['label'],
                       'poster': dist_relative(install_path(pid, x['poster'])), 'evidence': x['evidence'],
                       'source_version': entry['version'], 'source_path': entry['media_path'],
                       'source_sha256': entry['source_sha256']}
            old = next((o for o in prior['examples'] if o['id'] == x['id']), None) if prior else None
            if old is None:
                counts['added']['examples'] += 1
            elif old != example:
                counts['updated']['examples'] += 1
            records['examples'][f"{f['id']}@{x['id']}"] = record_hash(example)
            examples.append(example)
        if prior is None:
            catalog['techniques'].append(dict(definition, default_example=f['default_example'], examples=examples))
            counts['added']['techniques'] += 1
        else:
            keep = [x for x in prior['examples'] if f"{f['id']}@{x['id']}" not in records['examples']]
            if family_definition(prior) != definition:
                counts['updated']['techniques'] += 1
            catalog['techniques'][catalog['techniques'].index(prior)] = dict(
                definition, default_example=f['default_example'], examples=examples + keep)
        records['techniques'][f['id']] = record_hash(definition)

    # The pack collection mirrors this version's exact items.
    collections = copy.deepcopy(state.collections)
    view = dict(catalog, removed_references={}, removed_technique_examples={})
    try:
        members = [saved_collections.resolve(item, view, require_snapshot=False) for item in data['members']]
    except storage.ReviewError as error:
        raise PackError(f'A pack collection item could not be resolved: {error}') from error
    collection = pack_collection(collections, pid)
    if collection is None:
        collection = {'id': 'col-' + str(uuid.uuid4()), 'name': m['name'], 'kind': 'pack', 'pack_id': pid,
                      'pack_version': m['version'], 'members': members, 'created_at': stamp, 'updated_at': stamp, 'history': []}
        collections['collections'].append(collection)
    else:
        reopened = 'pack_removed_at' in collection
        if reopened or collection['members'] != members or collection['name'] != m['name'] or collection.get('pack_version') != m['version']:
            collection.setdefault('history', []).append({'at': stamp, 'action': 'pack-' + action,
                                                         'before': {k: copy.deepcopy(v) for k, v in collection.items() if k != 'history'}})
            collection.update(name=m['name'], pack_version=m['version'], members=members, updated_at=stamp)
        if reopened:
            # The collection was hidden by uninstalling, so installing again shows it again.
            collection.pop('pack_removed_at', None)
            collection.pop('deleted_at', None)

    # Files: copy new ones, refresh small fixed-name files, retire what this version no longer uses.
    previous_files = previous.get('files', {}) if previous else {}
    copies, small, kept = [], {}, 0
    for relative, row in sorted(desired.items()):
        target = studio_target(relative)
        if target.exists():
            if not target.is_file():
                raise PackError(f'{relative} is in the way of the pack. Nothing was installed.')
            current = file_sha256(target)
            if current == row['sha256']:
                kept += 1
                continue
            if previous_files.get(relative) != current and not replace_local_edits:
                raise PackError(f'A different file already exists at {relative}. Nothing was installed.')
            if row['bytes'] > SMALL_FILE:
                raise PackError(f'{relative} would replace an existing large file. Move it aside first. Nothing was installed.')
            small[target] = name_of[relative]
            continue
        copies.append((name_of[relative], relative, target, row))
    retire = {path: sha for path, sha in {**previous.get('retired_files', {}), **previous_files}.items()
              if path not in desired and os.path.lexists(index.STUDIO / path)} if previous else {}
    record = {'pack_id': pid, 'name': m['name'], 'version': m['version'], 'author': m['author'], 'license': m['license'],
              'identity': pack.identity, 'archive_sha256': pack.archive_sha256,
              'collection_id': collection['id'], 'records': records,
              'files': {relative: row['sha256'] for relative, row in sorted(desired.items())},
              'retired_files': dict(sorted(retire.items())),
              'installed_at': previous.get('installed_at', stamp) if previous else stamp, 'updated_at': stamp,
              'history': (previous.get('history', []) if previous else []) +
                         [{'at': stamp, 'action': action, 'version': m['version'], 'identity': pack.identity}]}
    packs = copy.deepcopy(state.packs)
    packs['packs'][pid] = record

    changes = {}
    if pretty_catalog(catalog) != state.raw[state.catalog_path]:
        changes[state.catalog_path] = pretty_catalog(catalog)
    collections_bytes = storage.json_bytes(collections)
    if collections_bytes != state.raw[state.collections_path]:
        changes[state.collections_path] = collections_bytes
    if storage.json_bytes(evidence) != state.raw[state.evidence_path]:
        changes[state.evidence_path] = storage.json_bytes(evidence)
    unchanged = (not changes and not copies and not small and not retire and previous is not None
                 and previous.get('identity') == pack.identity)
    if not unchanged:
        changes[state.packs_path] = storage.json_bytes(packs)
    if action == 'reinstall' and previous and previous.get('identity') != pack.identity:
        warnings.append('This file differs from the installed copy of the same version; the installed records now match this file.')
    if sum(row['bytes'] for *_, row in copies) > LARGE_PACK_WARNING:
        warnings.append('This pack is large; installing copies several gigabytes.')
    if edited:
        warnings.append('Replaced pack records changed in this studio: ' + ', '.join(edited[:8]))
    if any(affected.values()) and action != 'install':
        warnings.append('Some saved items point to pack examples this version replaced or dropped. They stay in your collections and notes and show as unavailable.')
    report = {'action': 'unchanged' if unchanged else action, **describe(pack),
              'previous_version': previous['version'] if previous else None,
              'collection': {'id': collection['id'], 'name': collection['name'], 'hidden': bool(collection.get('deleted_at'))},
              'location': pack_folder(pid), **counts,
              'removed': {'videos': len(gone_entries), 'examples': len(gone_examples)},
              'copy': {'files': len(copies), 'bytes': sum(row['bytes'] for *_, row in copies),
                       'already_present': kept, 'refreshed': len(small), 'retire': len(retire)},
              'saved_items_affected': affected, 'warnings': warnings}
    return {'changes': changes, 'copies': copies, 'small': small, 'retire': retire, 'unchanged': unchanged,
            'catalog': catalog, 'pack_id': pid, 'report': report}


def pretty_catalog(catalog):
    return storage.json_bytes(catalog)


def place(pack, name, relative, target, row):
    """Copy one verified file to a new path inside the studio without overwriting anything."""
    studio_target(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(f'.pack-{uuid.uuid4().hex}{target.suffix}')
    try:
        source_path = pack.source.path(name)
        if source_path is not None:
            # An unzipped pack on the same disk is cloned instead of duplicated where supported.
            disk.copy_file(source_path, temp)
            digest = file_sha256(temp)
        else:
            with pack.source.open(name) as stream, open(temp, 'xb') as out:
                digest = hash_stream(stream, row['bytes'], out)
                out.flush()
                os.fsync(out.fileno())
        if digest != row['sha256']:
            raise PackError(f'{relative} changed while installing. Nothing was installed.')
        os.chmod(temp, 0o644)
        if os.path.lexists(target):
            raise PackError(f'{relative} appeared while installing. Nothing was installed.')
        os.replace(temp, target)
    finally:
        if os.path.lexists(temp):
            os.unlink(temp)


def referenced_paths(catalog):
    paths = set()
    for e in catalog['entries']:
        paths.update(p for p in [e.get('media_path'), e.get('composition'), e.get('archive_path'), *e.get('notes', [])] if p)
        if e.get('poster'):
            paths.add('style-library/dist/' + e['poster'])
        for s in e.get('slides', []):
            paths.update(['style-library/dist/' + s.get('poster', ''), s.get('path')])
    for t in catalog.get('techniques', []):
        for x in t.get('examples', []):
            paths.add('style-library/dist/' + x.get('poster', ''))
    return paths


def recipe_folders(catalog):
    return {t['recipe'] for t in catalog.get('techniques', []) if t.get('recipe')}


def retire_files(retire, catalog):
    """Delete pack files that nothing references any more and that still have the bytes installed."""
    kept, removed = [], 0
    referenced, recipes = referenced_paths(catalog), recipe_folders(catalog)
    for relative, sha in sorted(retire.items()):
        try:
            target = studio_target(relative)
        except PackError:
            kept.append(relative)
            continue
        if not target.is_file():
            continue
        if relative in referenced or any(relative.startswith(r + '/') for r in recipes) or file_sha256(target) != sha:
            kept.append(relative)
            continue
        target.unlink()
        removed += 1
        prune_empty(target.parent)
    return removed, kept


def prune_empty(folder):
    stops = {(index.STUDIO / 'references').resolve(), (index.STUDIO / 'style-library/dist/assets/posters').resolve(),
             (index.STUDIO / 'style-library/dist/assets/techniques').resolve()}
    folder = folder.resolve()
    while folder not in stops and folder.is_relative_to(index.STUDIO.resolve()) and folder != index.STUDIO.resolve():
        try:
            folder.rmdir()
        except OSError:
            return
        folder = folder.parent


def apply(plan, state, pack):
    total = plan['report']['copy']['bytes']
    if total and disk.free_bytes(index.STUDIO) < total + 500 * 10**6:
        raise PackError(f'Not enough free disk space: the pack needs about {disk.size_label(total)}. Nothing was installed.')
    before_ok = validation()['ok']
    changes = dict(plan['changes'])
    originals = {path: state.raw[path] for path in changes}
    expected = state.expected()
    for target, name in plan['small'].items():
        changes[target] = pack_bytes(pack, name)
        originals[target] = target.read_bytes()
        expected[target.resolve()] = hashlib.sha256(originals[target]).hexdigest()
    created = []
    try:
        for name, relative, target, row in plan['copies']:
            place(pack, name, relative, target, row)
            created.append(target)
        storage.commit(changes, {'request_id': str(uuid.uuid4()), 'operation': 'pack-install', 'id': plan['pack_id']}, expected)
    except BaseException:
        discard(created)
        raise
    after = validation()
    if before_ok and not after['ok']:
        undo(changes, originals, created)
        raise PackError('The library did not validate after installing, so the install was undone: ' + after['error'])
    removed, kept = retire_files(plan['retire'], plan['catalog'])
    report = plan['report']
    report.update(dry_run=False, validation=after)
    report['copy'].update(retired=removed, retire_kept=kept)
    return report


def discard(created):
    for target in reversed(created):
        target.unlink(missing_ok=True)
        prune_empty(target.parent)


def pack_bytes(pack, name):
    row = pack.files[name]
    buffer = io.BytesIO()
    with pack.source.open(name) as stream:
        if hash_stream(stream, row['bytes'], buffer) != row['sha256']:
            raise PackError(f'{name} changed while installing. Nothing was installed.')
    return buffer.getvalue()


def undo(changes, originals, created):
    """Put back every file a committed install changed, then delete the files it copied."""
    after = {path.resolve(): hashlib.sha256(data).hexdigest() for path, data in changes.items()}
    restore = {path: before for path, before in originals.items() if before is not None}
    if restore:
        storage.commit(restore, {'request_id': str(uuid.uuid4()), 'operation': 'pack-install-undo'},
                       {path.resolve(): after[path.resolve()] for path in restore})
    for path, before in originals.items():
        if before is None:
            path.unlink(missing_ok=True)
    discard(created)


def validation():
    try:
        return {'ok': True, 'library': library.validate()}
    except (AssertionError, KeyError, OSError, ValueError, TypeError) as error:
        return {'ok': False, 'error': f'{type(error).__name__}: {error}'}


# ---------------------------------------------------------------------------------------------
# Listing and removing


def installed():
    with index.STATE_LOCK:
        state = State()
        rows = []
        for pid, record in sorted(state.packs['packs'].items()):
            collection = pack_collection(state.collections, pid)
            rows.append({'pack_id': pid, 'name': record['name'], 'version': record['version'],
                         'author': record['author']['name'], 'license': record['license']['title'],
                         'videos': len(record['records']['entries']), 'techniques': len(record['records']['techniques']),
                         'examples': len(record['records']['examples']), 'location': pack_folder(pid),
                         'collection_hidden': bool(collection and collection.get('deleted_at')),
                         'installed_at': record['installed_at'], 'updated_at': record['updated_at']})
        return {'packs': rows}


def remove(pack_id, dry_run=False, replace_local_edits=False):
    """Uninstall: take out the pack's records and files; installing the same file again restores them."""
    with index.STATE_LOCK:
        state = State()
        record = state.packs['packs'].get(pack_id)
        if record is None:
            raise PackError(f'No installed pack called {pack_id}. Run `python3 scripts/pack.py list`.')
        owned = owned_records(record)
        catalog = copy.deepcopy(state.catalog)
        evidence = copy.deepcopy(state.evidence)
        edited = local_edits(catalog, owned)
        if edited and not replace_local_edits:
            raise PackError('These pack records were changed in this studio: ' + ', '.join(edited[:8]) +
                            '. Nothing was removed. Ask the owner before removing them (--replace-local-edits).')
        for family in catalog['techniques']:
            for x in family['examples']:
                if x['style_id'] in owned['entries'] and f"{family['id']}@{x['id']}" not in owned['examples']:
                    raise PackError(f'Your example {x["id"]} uses the pack video {x["style_id"]}. Nothing was removed.')
        affected = references_to(state, set(owned['entries']), set(owned['examples']))
        kept_families = [t['id'] for t in catalog['techniques'] if t['id'] in owned['techniques']
                         and any(f"{t['id']}@{x['id']}" not in owned['examples'] for x in t['examples'])]
        remove_pack_records(catalog, evidence, owned)
        kept = {t['id']: record_hash(family_definition(t)) for t in catalog['techniques'] if t['id'] in kept_families}
        collections = copy.deepcopy(state.collections)
        collection = pack_collection(collections, pack_id)
        stamp = now()
        if collection is not None and not collection.get('pack_removed_at'):
            collection.setdefault('history', []).append({'at': stamp, 'action': 'pack-remove',
                                                         'before': {k: copy.deepcopy(v) for k, v in collection.items() if k != 'history'}})
            collection.setdefault('deleted_at', stamp)
            collection['pack_removed_at'] = stamp
            collection['updated_at'] = stamp
        packs = copy.deepcopy(state.packs)
        del packs['packs'][pack_id]
        packs.setdefault('removed', []).append({'pack_id': pack_id, 'name': record['name'], 'version': record['version'],
                                                'removed_at': stamp, 'kept_families': kept})
        retire = {path: sha for path, sha in {**record.get('retired_files', {}), **record.get('files', {})}.items()
                  if os.path.lexists(index.STUDIO / path)}
        report = {'action': 'remove', 'pack_id': pack_id, 'name': record['name'], 'version': record['version'],
                  'removed': {'videos': len(owned['entries']), 'techniques': len(owned['techniques']) - len(kept_families),
                              'examples': len(owned['examples']), 'files': len(retire)},
                  'kept_families_with_your_examples': kept_families, 'saved_items_affected': affected,
                  'collection_hidden': collection is not None, 'dry_run': dry_run,
                  'restore': 'Install the same pack file again to restore it with the same links.'}
        if dry_run:
            return report
        changes = {state.catalog_path: pretty_catalog(catalog), state.collections_path: storage.json_bytes(collections),
                   state.evidence_path: storage.json_bytes(evidence), state.packs_path: storage.json_bytes(packs)}
        changes = {p: b for p, b in changes.items() if b != state.raw.get(p)}
        storage.commit(changes, {'request_id': str(uuid.uuid4()), 'operation': 'pack-remove', 'id': pack_id}, state.expected())
        removed, kept = retire_files(retire, catalog)
        report['removed']['files'] = removed
        report['files_kept'] = kept
        report['validation'] = validation()
        return report


# ---------------------------------------------------------------------------------------------
# Building a pack in the author's studio (read-only)

RISK = re.compile(r'\b(music|song|soundtrack|licen[cs]ed?|royalty|stock|cc[ -]?by|creative commons|third[- ]party|'
                  r'other creators?|creator footage|reference footage|reference only|contextual|not cleared|'
                  r'unverified|unknown|permission|fair use|attribution|artlist|epidemic|envato|pond5|shutterstock|'
                  r'getty|storyblocks|incompetech)\b', re.I)
# "no third-party samples" and similar statements are not warnings.
NEGATED = re.compile(r'\b(?:no|without|not|zero)\s+(?:any\s+)?(?:third[- ]party|stock|licensed|music|other creators?)\b[^;,.]*', re.I)
PRIVATE_TEXT = re.compile(r'(?:/Users/|/home/|[A-Z]:\\|projects/[a-z0-9-]+/|style-library/|references/[a-z0-9-]+/)')
OVERRIDE_FIELDS = {
    'entries': {'title', 'subtitle', 'summary', 'tags', 'traits', 'keep', 'avoid', 'evidence', 'moments', 'source_url'},
    'techniques': {'title', 'category', 'summary', 'direction', 'aliases', 'keep', 'avoid', 'evidence'},
    'examples': {'label', 'evidence'},
}
ENTRY_EXPORT = ['title', 'subtitle', 'version', 'creator', 'creator_id', 'creator_handle', 'creator_aliases', 'summary',
                'tags', 'palette', 'traits', 'keep', 'avoid', 'moments', 'evidence', 'duration', 'poster_at', 'source_url']
ZIP_DATE = (1980, 1, 1, 0, 0, 0)


def slug(value, limit=40):
    out = re.sub(r'[^a-z0-9]+', '-', str(value).lower()).strip('-')[:limit].strip('-')
    return out or 'v'


def rights_warnings(root, entry):
    """Advisory only: music and third-party material the author should confirm before selling."""
    label = f'{entry["title"]} ({entry["version"]})'
    found = []
    fields = [entry.get('summary', ''), entry.get('evidence', ''), *entry.get('keep', []), *entry.get('avoid', []),
              *entry.get('tags', []), *entry.get('traits', {}).values()]
    hits = sorted({m.group(0).lower() for value in fields if isinstance(value, str) for m in RISK.finditer(NEGATED.sub('', value))})
    if hits:
        found.append(f'{label}: its library notes mention {", ".join(hits)}. Confirm every sound and clip is yours or licensed for resale.')
    project = entry.get('project_id')
    if not project or not index.TOKEN.fullmatch(project):
        found.append(f'{label}: not linked to a project, so music and footage licensing could not be checked.')
        return found
    folder = root / 'projects' / project
    media = root / entry['media_path']
    credit = media.with_name(media.name.rsplit('.', 1)[0] + '.music-credit.txt')
    if credit.is_file():
        first = ' '.join(credit.read_text(errors='replace').split())[:200]
        found.append(f'{label}: has music ({first}). Check the music license allows a paid download, or export a version without it.')
    workdir = (root / entry['composition']).parent if entry.get('composition') else None
    ledgers = [p for p in ([workdir / 'asset-ledger.csv', workdir / 'sound-plan.json'] if workdir else []) if p.is_file()]
    if not ledgers and (folder / 'asset-ledger.csv').is_file():
        ledgers.append(folder / 'asset-ledger.csv')
    for path in ledgers:
        if path.suffix == '.json':
            try:
                plan = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            music = plan.get('music') if isinstance(plan, dict) else None
            if isinstance(music, str) and re.match(r'\s*(none|no music|no )', music, re.I):
                music = None
            if music and not credit.is_file():
                about = (f'{music.get("title", "untitled")}, {music.get("rights", "rights not recorded")}'
                         if isinstance(music, dict) else str(music)[:160])
                found.append(f'{label}: the sound plan uses music ({about}).')
            continue
        try:
            rows = list(csv.DictReader(io.StringIO(path.read_text(errors='replace'))))
        except (OSError, csv.Error):
            continue
        flagged, borrowed = {}, 0
        for row in rows:
            kind = ' '.join(str(row.get(k) or '') for k in ('type', 'role')).lower()
            if any(word in kind for word in ('font', 'code', 'script', 'composition', 'library')):
                continue  # Fonts and code shape the render; they are not media clips in the pack.
            values = NEGATED.sub('', ' '.join(str(v) for v in row.values() if v))
            if re.search(r'(?:^|[\s/])(?:style-library/)?references/', values):
                borrowed += 1  # Media taken from the reference library is usually another creator's.
            elif RISK.search(values) or not values.strip():
                key = next((row.get(k) for k in ('rights', 'license_or_permission', 'provenance', 'source') if row.get(k)), 'no rights recorded')
                flagged[key] = flagged.get(key, 0) + 1
        if borrowed:
            found.append(f'{label}: {borrowed} asset-ledger row(s) use media from the reference library, which is usually '
                         'another creator’s footage. Leave this video out unless you have the rights.')
        for note, count in sorted(flagged.items())[:5]:
            found.append(f'{label}: {count} asset-ledger row(s) say “{note[:160]}”. Confirm before selling.')
    if not ledgers:
        found.append(f'{label}: no asset ledger or sound plan found, so licensing is unverified.')
    return found


def load_overrides(path):
    if path is None:
        return {'entries': {}, 'techniques': {}, 'examples': {}}
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or set(data) - set(OVERRIDE_FIELDS):
        raise PackError('Overrides use entries, techniques and examples.')
    for group, fields in OVERRIDE_FIELDS.items():
        rows = data.setdefault(group, {})
        if not isinstance(rows, dict) or any(not isinstance(v, dict) or set(v) - fields for v in rows.values()):
            raise PackError(f'Overrides for {group} may change only: {", ".join(sorted(fields))}.')
    return data


def find_collection(path, collection_name):
    if not path.is_file():
        raise PackError('This studio has no saved collections yet. Save the pack’s examples to a collection first.')
    saved = json.loads(path.read_text())
    matches = [c for c in saved.get('collections', []) if not c.get('deleted_at') and c.get('kind') == 'personal'
               and c['name'].casefold() == collection_name.strip().casefold()]
    if len(matches) != 1:
        raise PackError(f'Found {len(matches)} personal collections named “{collection_name}”. Use the exact name of one.')
    return matches[0]


def build(root, collection_name, out, pack_id, version, license_file, name=None, author_url=None,
          description=None, license_summary=None, overrides=None, recipes=None, dry_run=False, strict=False,
          overwrite=False):
    """Build a deterministic pack file from one collection. Reads the studio; writes only `out`."""
    root = Path(root).resolve()
    if not isinstance(pack_id, str) or not index.TOKEN.fullmatch(pack_id) or len(pack_id) > 40 or pack_id.startswith('tech-'):
        raise PackError('Use a short lowercase pack ID such as creator-pack-1.')
    if not VERSION.fullmatch(version or ''):
        raise PackError('Use a pack version such as 1.0.0.')
    catalog_path = root / 'style-library' / 'catalog.json'
    collections_path = root / 'style-library' / 'collections.json'
    if not catalog_path.is_file():
        raise PackError('This studio has no library catalog to build from.')
    catalog = json.loads(catalog_path.read_text())
    chosen = find_collection(collections_path, collection_name)
    name = name or chosen['name']
    license_text = Path(license_file).read_text(encoding='utf-8')
    text(license_text, 'The license', 200_000)
    edits = load_overrides(overrides)
    warnings, problems = [], []
    entries = {e['id']: e for e in catalog.get('entries', [])}
    families = {t['id']: t for t in catalog.get('techniques', [])}
    chosen_entries, chosen_examples, members = {}, {}, []
    for member in chosen['members']:
        if member.get('kind') == 'slide':
            problems.append('Carousel slides cannot go in a pack yet; remove them from the collection.')
            continue
        try:
            saved_collections.resolve(member, catalog, require_snapshot=True)
        except storage.ReviewError as error:
            problems.append(f'{member.get("example_id") or member.get("reference_id")}: {error} Save it to the collection again.')
            continue
        if member['kind'] == 'example':
            family = families[member['technique_id']]
            example = next(x for x in family['examples'] if x['id'] == member['example_id'])
            chosen_examples[(family['id'], example['id'])] = example
            chosen_entries[example['style_id']] = entries[example['style_id']]
        else:
            chosen_entries[member['reference_id']] = entries[member['reference_id']]
        members.append(member)
    author = None
    for entry in chosen_entries.values():
        if entry.get('collection') != 'mine':
            problems.append(f'{entry["title"]} is another creator’s video ({entry.get("creator")}). Packs hold only your own work.')
            continue
        if author is None:
            author = (entry['creator'], entry['creator_id'])
        if (entry['creator'], entry['creator_id']) != author:
            problems.append(f'{entry["title"]} is credited to {entry["creator"]}; a pack has one author.')
        if entry.get('asset_type', 'video') != 'video' or not entry.get('media_path'):
            problems.append(f'{entry["title"]} is not a playable video.')
    if problems:
        raise PackError('Cannot build the pack:\n- ' + '\n- '.join(dict.fromkeys(problems)))
    if not chosen_entries:
        raise PackError('The collection is empty.')
    author_name, author_id = author
    for key, row in [*(('entries', k) for k in edits['entries']), *(('techniques', k) for k in edits['techniques']),
                     *(('examples', k) for k in edits['examples'])]:
        known = {'entries': chosen_entries, 'techniques': {f for f, _ in chosen_examples},
                 'examples': {f'{f}@{x}' for f, x in chosen_examples}}[key]
        if row not in known:
            raise PackError(f'Override for {row} does not match anything in the collection.')

    files = {}  # pack path -> (source path, bytes, sha256)

    def add(prefix, stem, source, digest=None):
        """Content-addressed names: a changed file always gets a new path in the buyer's studio."""
        digest = digest or file_sha256(source)
        pack_path = f'{prefix}/{stem}-{digest[:12]}{source.suffix.lower()}'
        files[pack_path] = (source, source.stat().st_size, digest)
        return pack_path

    entry_ids, out_entries = {}, []
    for source_id, entry in chosen_entries.items():
        media = registered_file(root, entry['media_path'], VIDEO)
        sha = file_sha256(media)
        if entry.get('source_sha256') not in (None, sha):
            raise PackError(f'{entry["title"]} changed on disk since it was cataloged. Recheck it first.')
        lineage = entry.get('archived_from') or source_id
        new_id = f'{pack_id}-{lineage}-{slug(entry["version"], 24)}'
        if new_id in entry_ids.values():
            new_id = f'{new_id}-{sha[:8]}'
        if not index.TOKEN.fullmatch(new_id):
            raise PackError(f'Could not make a pack ID for {entry["title"]}.')
        entry_ids[source_id] = new_id
        poster = (root / 'style-library' / 'dist' / entry['poster']).resolve()
        if not poster.is_relative_to((root / 'style-library' / 'dist' / 'assets').resolve()) or not poster.is_file() or poster.suffix.lower() not in IMAGE:
            raise PackError(f'{entry["title"]} needs a poster image.')
        record = {k: copy.deepcopy(entry[k]) for k in ENTRY_EXPORT if entry.get(k) not in (None, '')}
        record.update(edits['entries'].get(source_id, {}))
        if record.get('source_url') is None:
            record.pop('source_url', None)
        record.update(id=new_id, creator=author_name, creator_id=author_id, source_sha256=sha,
                      media=add('media', new_id, media, sha), poster=add('posters/videos', new_id, poster))
        record.setdefault('summary', entry['title'])
        if media.stat().st_size > LIMITS['media']:
            raise PackError(f'{entry["title"]} is larger than a pack allows (4 GB).')
        out_entries.append(record)
        warnings.extend(rights_warnings(root, entry))
    family_out = {}
    for (fid, xid), example in chosen_examples.items():
        family = families[fid]
        new_fid = f'tech-{pack_id}-{fid.removeprefix("tech-")}'
        if new_fid not in family_out:
            definition = {k: copy.deepcopy(family[k]) for k in ('title', 'category', 'summary', 'direction', 'aliases', 'keep', 'avoid', 'evidence')}
            definition.update(edits['techniques'].get(fid, {}))
            family_out[new_fid] = dict(definition, id=new_fid, examples=[], source=fid)
        poster = (root / 'style-library' / 'dist' / example['poster']).resolve()
        if not poster.is_relative_to((root / 'style-library' / 'dist' / 'assets' / 'techniques').resolve()) or not poster.is_file():
            raise PackError(f'Example {xid} needs its poster image.')
        new_xid = f'{pack_id}-{xid}'
        row = {'id': new_xid, 'style_id': entry_ids[example['style_id']], 'label': example['label'],
               'start': example['start'], 'end': example['end'], 'poster_at': example['poster_at'],
               'evidence': example.get('evidence') or 'Source-backed example from the author’s own video.',
               'poster': add('posters/examples', new_xid, poster)}
        row.update(edits['examples'].get(f'{fid}@{xid}', {}))
        family_out[new_fid]['examples'].append(row)
    out_families = []
    recipe_root = Path(recipes).resolve() if recipes else None
    recipe_names = set()
    if recipe_root:
        for folder in sorted(p for p in recipe_root.iterdir() if p.name not in OS_METADATA and not p.name.startswith('.')):
            if not folder.is_dir() or folder.is_symlink():
                raise PackError(f'Recipes go in one folder per technique; {folder.name} is not a folder.')
            recipe_names.add(folder.name)
    for new_fid, family in sorted(family_out.items()):
        source_fid = family.pop('source')
        source_default = families[source_fid].get('default_example')
        ids = [x['id'] for x in family['examples']]
        family['default_example'] = f'{pack_id}-{source_default}' if f'{pack_id}-{source_default}' in ids else ids[0]
        for folder_name in (source_fid, new_fid):
            if folder_name in recipe_names:
                recipe_names.discard(folder_name)
                family['recipe'] = add_recipe(recipe_root / folder_name, new_fid, files, warnings)
        out_families.append(family)
    if recipe_names:
        raise PackError('These recipe folders do not match a technique in the pack: ' + ', '.join(sorted(recipe_names)))
    out_members = []
    for member in members:
        if member['kind'] == 'example':
            out_members.append({'kind': 'example', 'technique_id': f'tech-{pack_id}-{member["technique_id"].removeprefix("tech-")}',
                                'example_id': f'{pack_id}-{member["example_id"]}'})
        else:
            row = {'kind': member['kind'], 'reference_id': entry_ids[member['reference_id']]}
            if member['kind'] == 'moment':
                row['time'] = member['time']
            out_members.append(row)
    out_entries.sort(key=lambda e: e['id'])
    for family in out_families:
        family['examples'].sort(key=lambda x: (x['style_id'], x['start'], x['id']))
    for record in [*out_entries, *out_families, *(x for f in out_families for x in f['examples'])]:
        for value in record.values():
            for item in (value if isinstance(value, list) else value.values() if isinstance(value, dict) else [value]):
                if isinstance(item, str) and PRIVATE_TEXT.search(item):
                    warnings.append(f'{record["id"]} mentions a private file path; add an override with buyer-facing text.')
                    break
    lic_summary = license_summary or next((line.strip() for line in license_text.splitlines()
                                           if line.strip() and not line.lstrip().startswith('#')
                                           and not re.match(r'\s*(copyright|\(c\)|©)', line, re.I)), 'See LICENSE.txt')[:600]
    manifest = {'format': FORMAT, 'format_version': FORMAT_VERSION, 'pack_id': pack_id, 'name': name, 'version': version,
                'author': {'name': author_name, 'creator_id': author_id, **({'url': author_url} if author_url else {})},
                'license': {'title': f'{name} license', 'summary': lic_summary, 'file': LICENSE}}
    if description:
        manifest['description'] = description
    data = {'entries': out_entries, 'techniques': out_families, 'members': out_members}
    blobs = {LIBRARY: pretty(data), LICENSE: license_text.encode('utf-8') if license_text.endswith('\n') else (license_text + '\n').encode('utf-8')}
    blobs[README] = readme_text(manifest, data).encode('utf-8')
    rows = [{'path': p, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for p, b in blobs.items()]
    rows += [{'path': p, 'bytes': size, 'sha256': sha} for p, (_, size, sha) in files.items()]
    manifest['files'] = sorted(rows, key=lambda r: r['path'])
    check_manifest(manifest)
    check_library(json.loads(blobs[LIBRARY]), manifest)
    total = sum(r['bytes'] for r in rows)
    if total > LARGE_PACK_WARNING:
        warnings.append(f'The pack is {disk.size_label(total)}; buyers download and install all of it.')
    warnings = list(dict.fromkeys(warnings))
    report = {'pack_id': pack_id, 'name': name, 'version': version, 'collection': chosen['name'],
              'author': manifest['author'], 'videos': len(out_entries), 'techniques': len(out_families),
              'examples': sum(len(f['examples']) for f in out_families), 'recipes': sum('recipe' in f for f in out_families),
              'collection_items': len(out_members),
              # The Techniques tab shows one card per family; these families show several examples on one card.
              'families_with_several_examples': {f['title']: len(f['examples']) for f in out_families if len(f['examples']) > 1},
              'files': len(rows), 'bytes': total, 'size': disk.size_label(total),
              'warnings': warnings, 'dry_run': dry_run}
    if strict and warnings:
        raise PackError('Stopped because of warnings (--strict):\n- ' + '\n- '.join(warnings))
    if dry_run:
        return report
    out = Path(out).expanduser().resolve()
    if out.is_relative_to(root / 'style-library') or out.is_relative_to(root / 'projects') or out.is_relative_to(root / 'references'):
        raise PackError('Write the pack outside the studio’s library, projects and references folders.')
    if out.exists() and not overwrite:
        raise PackError(f'{out} already exists. Choose a new name or use --overwrite.')
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = out.with_name(f'.{out.name}.{uuid.uuid4().hex}.partial')
    try:
        with zipfile.ZipFile(temp, 'x', zipfile.ZIP_STORED, allowZip64=True) as archive:
            write_entry(archive, MANIFEST, pretty(manifest))
            for row in manifest['files']:
                if row['path'] in blobs:
                    write_entry(archive, row['path'], blobs[row['path']])
                else:
                    source, size, sha = files[row['path']]
                    write_file(archive, row['path'], source, size, sha)
        os.replace(temp, out)
    finally:
        if temp.exists():
            temp.unlink()
    report.update(out=str(out), sha256=file_sha256(out))
    return report


def zip_info(name, size):
    info = zipfile.ZipInfo(name, date_time=ZIP_DATE)
    info.compress_type = zipfile.ZIP_STORED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    info.file_size = size
    return info


def write_entry(archive, name, data):
    archive.writestr(zip_info(name, len(data)), data)


def write_file(archive, name, source, size, sha):
    with open(source, 'rb') as stream, archive.open(zip_info(name, size), 'w', force_zip64=size > zipfile.ZIP64_LIMIT) as out:
        if hash_stream(stream, size, out) != sha:
            raise PackError(f'{source.name} changed while building. Build again.')


def add_recipe(folder, family_id, files, warnings):
    """Include one technique's editable recipe folder under a content-addressed name."""
    found = []
    for current, dirs, names in os.walk(folder, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in {'node_modules', '__pycache__'})
        for d in dirs:
            if Path(current, d).is_symlink():
                raise PackError(f'Recipe {folder.name} contains a shortcut: {d}')
        for name in sorted(names):
            path = Path(current, name)
            if name in OS_METADATA or name.startswith('.'):
                continue
            if path.is_symlink() or not path.is_file():
                raise PackError(f'Recipe {folder.name} contains a link or special file: {name}')
            relative = path.relative_to(folder).as_posix()
            if path.suffix.lower() not in RECIPE:
                raise PackError(f'Recipe {folder.name} has an unsupported file: {relative}')
            if path.suffix.lower() in AUDIO | VIDEO:
                warnings.append(f'Recipe {folder.name} includes {"audio" if path.suffix.lower() in AUDIO else "video"} ({relative}). '
                                'Buyers edit recipes into their own videos, so leave out your footage, voice and music you may not resell.')
            found.append((relative, path))
    if not found:
        raise PackError(f'Recipe {folder.name} is empty.')
    listing = hashlib.sha256(canonical([[r, file_sha256(p)] for r, p in found]).encode()).hexdigest()[:12]
    base = f'recipes/{family_id}-{listing}'
    for relative, path in found:
        pack_path = f'{base}/{relative}'
        archive_parts(pack_path)
        if path.stat().st_size > LIMITS['recipe']:
            raise PackError(f'Recipe file {relative} is too large.')
        files[pack_path] = (path, path.stat().st_size, file_sha256(path))
    return base


def readme_text(manifest, data):
    examples = sum(len(f['examples']) for f in data['techniques'])
    lines = [f'# {manifest["name"]} {manifest["version"]}', '',
             f'By {manifest["author"]["name"]}. {len(data["techniques"])} techniques, {examples} examples from '
             f'{len(data["entries"])} of the author’s own videos.', '']
    if manifest.get('description'):
        lines += [manifest['description'], '']
    lines += ['## Install', '',
              'You need AI Video Studio (https://github.com/mattp68/ai-video-studio) and its editing chat (Claude Code or Codex).', '',
              '1. Keep this file where you downloaded it. You do not need to unzip it.',
              '2. Open your editing chat in your studio folder and send:', '',
              f'   Install my {manifest["name"]} from <path to this file>', '',
              f'3. Open the Reference Library and choose “{manifest["name"]}” under Collections.', '',
              'Your projects, personal library, collections and notes stay as they are. Installing a newer version '
              'of this pack updates it in place.', '',
              '## License', '', manifest['license']['summary'], '',
              'Read LICENSE.txt for the full terms. These are creative references to learn from and adapt, '
              'not one-click templates.', '']
    return '\n'.join(lines)
