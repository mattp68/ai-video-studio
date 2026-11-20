"""Find library techniques that fit a storyboard beat or brief. Read-only, no AI calls.

The editing chat judges the fit; this only retrieves and ranks. It reads the catalog,
the project index, technique plans and registered project notes, and never writes.

  python3 style-library/technique_recall.py --query "I list three tools" [--project <slug>] [--limit 5]
  python3 style-library/technique_recall.py --beat "Hook: ..." --beat "Demo: ..." --project <slug>

Output is JSON (schema_version 1). See docs/TECHNIQUE-PICKS.md.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import urlencode, urlparse

STUDIO = Path(__file__).resolve().parent.parent
SCHEMA = 1
TOKEN = re.compile(r'^[a-z0-9][a-z0-9-]*$')
FAMILY_ID = re.compile(r'tech-[a-z0-9]+(?:-[a-z0-9]+)*')
LINKED = re.compile(r'technique=(tech-[a-z0-9]+(?:-[a-z0-9]+)*)')
SOURCES = ('all', 'mine', 'others', 'packs')
STOP = set('''a an and are as at be been but by can could did do does for from had has have here how i if in into is it its
just let like me more most my no not of on onto or our out over so some than that the their them then there these they this
those to up us very was we were what when where which while who will with would you your yours also about each every any
all should really want wants need needs make makes making made show shows showing shown use uses using used get gets thing
things something video videos clip clips shot shots scene scenes beat beats moment moments part bit say says saying said
talk talks talking explain explains explaining tell tells telling go goes going way see first then next one
dont doesnt isnt arent cant wont im ive id youre youve thats lets theres heres whats'''.split())
# Plain editing words a creator might use for the same move. Expansions count less than the words typed.
GROUPS = [
    'zoom punch push magnify closeup close-up',
    'caption captions subtitle subtitles karaoke',
    'text type typography headline headlines title kinetic lettering',
    'list lists checklist steps step numbered counter countdown top tips ranking three four five ten',
    'compare comparison before after versus vs slider difference side',
    'screen screens ui interface app apps demo recording desktop screenshot product software tool tools dashboard browser website',
    'highlight spotlight focus circle underline callout annotate annotation outline arrow point pointing emphasis',
    'click button cursor tap press control menu field',
    'transition transitions wipe whip dive portal morph',
    'reveal unveil appear appears pop pops entrance',
    'stat stats number numbers chart graph data metric percent growth',
    'quote quotes testimonial review',
    'cta comment follow subscribe link resource download keyword dm',
    'face speaker head headshot person talking-head presenter selfie',
    'cutout matte popout pop-out escape',
    'glitch error uninstall delete bug broken',
    'texture grain paper collage halftone riso print printed engraving',
    'color colour grade look relight lighting light dark theme mood',
    'grid wall mosaic montage bento layout tiles',
    'card cards tile panel panels',
    'logo logos icon icons app apps brand brands',
    'several many multiple lots different variety',
    'split beside side alongside half',
    'news article articles press headline headlines',
    'vanish disappear ghost fade',
    'glass frosted refraction',
    'map roadmap agenda chapter chapters section sections progress',
    'hook opening intro open',
    'privacy blur redact hide sensitive email password personal',
    'prompt chat typing chatbot chatgpt claude assistant',
    'voice audio waveform sound signal',
    'code ascii matrix terminal',
    'badge achievement unlock award',
    'game pixel retro arcade',
    'magazine cover editorial',
    'timeline editing edit',
    'photo photos picture pictures image images polaroid',
    'depth layer layers stack stacked parallax 3d',
    'scroll scrolling feed',
    'physics gravity fall falling drop bounce sticker stickers',
]


def stem(word):
    """A small, predictable stemmer: plural, -ing, -ed and a final e, so wipe/wiped/wiping meet."""
    def undouble(w):
        return w[:-1] if len(w) > 3 and w[-1] == w[-2] and w[-1] not in 'lsz' else w
    if len(word) > 4 and word.endswith('ies'):
        word = word[:-3] + 'y'
    elif len(word) > 5 and word.endswith('ing'):
        word = undouble(word[:-3])
    elif len(word) > 4 and word.endswith('ed') and not word.endswith('eed'):
        word = undouble(word[:-2])
    elif len(word) > 4 and word.endswith(('ches', 'shes', 'xes', 'sses')):
        word = word[:-2]
    elif len(word) > 3 and word.endswith('s') and not word.endswith(('ss', 'us', 'is')):
        word = word[:-1]
    return word[:-1] if len(word) > 3 and word.endswith('e') else word


def tokens(value):
    """(stem, the word as written) for every meaningful word."""
    out = []
    value = re.sub(r"[’']", '', value.casefold()).replace('&', ' and ')
    for raw in re.findall(r'[a-z0-9]+(?:-[a-z0-9]+)*', value):
        for w in [raw] + (raw.split('-') if '-' in raw else []):
            if w not in STOP and not w.isdigit():
                out.append((stem(w), w))
    return out


def words(value):
    return [s for s, _ in tokens(value)]


def pairs(value):
    """Neighbouring word pairs, stopwords included unless both are, so “pop out” and “before and after” count."""
    raw = re.findall(r'[a-z0-9]+', re.sub(r"[’']", '', value.casefold()).replace('&', ' and '))
    return {(stem(a), stem(b)) for a, b in zip(raw, raw[1:]) if not (a in STOP and b in STOP) and not (a.isdigit() or b.isdigit())}


SYNONYMS = {}
for group in GROUPS:
    members = {stem(w) for w in group.split()}
    for member in members:
        SYNONYMS.setdefault(member, set()).update(members - {member})


def phrase(value):
    return ' '.join(words(value))


def read_json(path, default):
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 64_000_000:
            return default
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def project_file(project_id, relative, suffixes):
    """A file inside this exact project folder, or None. No path may leave the project."""
    if not TOKEN.fullmatch(project_id) or not isinstance(relative, str):
        return None
    root = (STUDIO / 'projects' / project_id).resolve()
    raw = Path(relative)
    if raw.is_absolute() or '..' in raw.parts or any(p.startswith('.') for p in raw.parts) or raw.suffix.lower() not in suffixes:
        return None
    target = (root / raw).resolve()
    if not target.is_relative_to(root) or not target.is_file() or target.stat().st_size > 4_000_000:
        return None
    return target


def server_url():
    state = read_json(STUDIO / 'style-library/runtime/server.json', {})
    url = state.get('url') if isinstance(state, dict) else None
    if isinstance(url, str) and re.fullmatch(r'http://(127\.0\.0\.1|localhost):[0-9]{2,5}', url):
        return url
    return None


def source_kind(entry):
    if entry.get('pack'):
        return 'pack'
    return 'mine' if entry.get('collection') == 'mine' else 'other_creator'


def families_in_project(project, catalog, known):
    """Technique families a project already uses: storyboard picks, prepared and published examples, linked notes."""
    used = set()
    for artifact in project.get('artifacts', []):
        for frame in artifact.get('frames', []):
            pick = frame.get('technique') if isinstance(frame, dict) else None
            if isinstance(pick, dict) and isinstance(pick.get('technique_id'), str):
                used.add(pick['technique_id'])
    entry_ids = {e['id'] for e in catalog.get('entries', []) if e.get('project_id') == project['id']}
    for family in catalog.get('techniques', []):
        if any(x.get('style_id') in entry_ids for x in family.get('examples', [])):
            used.add(family['id'])
    plan = project_file(project['id'], 'technique-plan.json', {'.json'})
    for saved in (read_json(plan, {}).get('plans', []) if plan else []):
        for row in saved.get('examples', []) if isinstance(saved, dict) else []:
            family = row.get('family') if isinstance(row, dict) else None
            if isinstance(family, dict) and isinstance(family.get('id'), str):
                used.add(family['id'])
    for note in project.get('source_notes', []):
        path = project_file(project['id'], note.get('path') if isinstance(note, dict) else None, {'.md', '.txt'})
        if path:
            try:
                used.update(LINKED.findall(path.read_text(errors='replace')))
            except OSError:
                pass
    return used & known


def recent_projects(projects, current, count):
    """Most recently synced projects first; the registry order breaks ties."""
    ordered = sorted(enumerate(projects), key=lambda row: (str(row[1].get('synced_on') or ''), -row[0]), reverse=True)
    return [p for _, p in ordered if p.get('id') != current and p.get('state') != 'canceled'][:count]


class Library:
    def __init__(self, source='all'):
        catalog = read_json(STUDIO / 'style-library/catalog.json', {})
        self.catalog = catalog if isinstance(catalog, dict) else {}
        registry = read_json(STUDIO / 'style-library/projects.json', {})
        projects = registry.get('projects') if isinstance(registry, dict) else None
        self.projects = [p for p in projects if isinstance(p, dict) and isinstance(p.get('id'), str)] if isinstance(projects, list) else []
        packs = read_json(STUDIO / 'style-library/packs.json', {})
        packs = packs.get('packs') if isinstance(packs, dict) else None
        self.packs = packs if isinstance(packs, dict) else {}
        entries = {e['id']: e for e in self.catalog.get('entries', []) if isinstance(e, dict) and 'id' in e}
        removed = self.catalog.get('removed_references', {})
        hidden = self.catalog.get('removed_technique_examples', {})
        self.families, documents = [], []
        self.total_examples = 0
        for family in self.catalog.get('techniques', []):
            examples = []
            for x in family.get('examples', []):
                self.total_examples += 1
                entry = entries.get(x.get('style_id'))
                # Same visibility as normal browsing: no removed, hidden, archived or changed sources.
                if (not entry or entry['id'] in removed or entry.get('archived_from') or
                        family['id'] + '@' + x['id'] in hidden or x.get('source_path') != entry.get('media_path') or
                        x.get('source_version') != entry.get('version')):
                    continue
                kind = source_kind(entry)
                if source != 'all' and {'mine': 'mine', 'others': 'other_creator', 'packs': 'pack'}[source] != kind:
                    continue
                window = [m.get('label', '') for m in entry.get('moments', [])
                          if isinstance(m, dict) and isinstance(m.get('time'), (int, float))
                          and x.get('start', 0) - 1 <= m['time'] <= x.get('end', 0) + 1]
                # What the example shows; its source video's own notes count least (they describe the topic too).
                fields = [(x.get('label', ''), 1.5), (x.get('evidence', ''), 1), (' '.join(window), .75),
                          (' '.join(entry.get('tags', [])), .5), (entry.get('title', ''), .3), (entry.get('subtitle', ''), .3),
                          (entry.get('summary', ''), .3), (' '.join(str(v) for v in entry.get('traits', {}).values()), .2)]
                examples.append({'example': x, 'entry': entry, 'kind': kind, 'fields': [(set(words(t)), w) for t, w in fields]})
            if not examples:
                continue
            # The technique's name and aliases say what the move is; the summary also describes its setting.
            fields = [(family.get('title', ''), 5), (' '.join(family.get('aliases', [])), 4), (family.get('summary', ''), 1.5),
                      (family.get('category', ''), 2), (family.get('direction', ''), 1), (' '.join(family.get('keep', [])), .5),
                      (family.get('evidence', ''), .3)]
            record = {'family': family, 'examples': examples, 'fields': [(set(words(t)), w) for t, w in fields],
                      'phrases': [p for p in [phrase(family.get('title', ''))] + [phrase(a) for a in family.get('aliases', [])] if p],
                      'pairs': set().union(*(pairs(name) for name in [family.get('title', '')] + list(family.get('aliases', []))))}
            vocabulary = set().union(*(f for f, _ in record['fields']), *(f for x in examples for f, _ in x['fields']))
            record['vocabulary'] = vocabulary
            self.families.append(record)
            documents.append((set().union(*(f for f, _ in record['fields'])), vocabulary))
        # Rarity among technique descriptions weighs technique words; rarity overall weighs example notes.
        self.idf_family = self.rarity([d[0] for d in documents])
        self.idf = self.rarity([d[1] for d in documents])
        self.known = {f['family']['id'] for f in self.families}
        own = {}
        for record in self.families:
            projects = {x['entry'].get('project_id') or x['entry']['id'] for x in record['examples'] if x['kind'] == 'mine'}
            own[record['family']['id']] = len(projects)
        self.own_videos = own

    @staticmethod
    def rarity(documents):
        frequency = {}
        for vocabulary in documents:
            for term in vocabulary:
                frequency[term] = frequency.get(term, 0) + 1
        return {term: math.log(1 + len(documents) / df) for term, df in frequency.items()}

    def recency(self, project_id, count):
        recent = recent_projects(self.projects, project_id, count)
        used = {}
        for rank, project in enumerate(recent):
            for family_id in families_in_project(project, self.catalog, self.known):
                used.setdefault(family_id, []).append({'project_id': project['id'], 'title': project.get('title', project['id']), 'rank': rank})
        return recent, used

    def here(self, project_id):
        project = next((p for p in self.projects if p.get('id') == project_id), None)
        return families_in_project(project, self.catalog, self.known) if project else set()


def score_fields(concepts, fields, idf):
    """Each typed word counts once: its own best match, or a synonym's at a discount."""
    def hit(term):
        weights = sorted((w for vocabulary, w in fields if term in vocabulary), reverse=True)
        return idf.get(term, 0) * (weights[0] + .2 * sum(weights[1:])) if weights else 0.0
    total, matched = 0.0, set()
    for term, expansions in concepts:
        best = max([hit(term)] + [.6 * hit(other) for other in expansions])
        if best:
            total += best
            matched.add(term)
    return total, matched


def query_terms(query):
    written = {}
    for term, surface in tokens(query):
        written.setdefault(term, surface)
    direct = list(written)
    concepts = [(t, sorted(SYNONYMS.get(t, set()) - set(direct))) for t in direct]
    return direct, concepts, written


def link(technique_id, example_id, base):
    fragment = '#' + urlencode({'technique': technique_id, 'example': example_id})
    return fragment, (base.rstrip('/') + '/' + fragment if base else None)


def reason_for(matched, own, recent, here, pack):
    parts = ['matches ' + ', '.join(f'“{m}”' for m in matched[:4])] if matched else []
    if own:
        parts.append(f'used in {own} of your own videos' if own > 1 else 'used in one of your own videos')
    if recent:
        latest = recent[0]
        parts.append('used in your recent project “' + latest['title'] + '”' + (f' and {len(recent) - 1} more' if len(recent) > 1 else ''))
    if here:
        parts.append('already picked in this project')
    if pack:
        parts.append('from the installed pack ' + pack['name'] + ' (recreate it; read its license)')
    text = '; '.join(parts)
    return text[:1].upper() + text[1:] + '.' if text else ''


def rank(library, query, limit=5, examples=2, used=None, here=frozenset(), exclude=frozenset(), earlier=None, base=None):
    direct, terms, written = query_terms(query)
    norm = ' ' + ' '.join(direct) + ' '
    neighbours = pairs(query)
    results = []
    if not direct:
        return results
    for record in library.families:
        family = record['family']
        if family['id'] in exclude:
            continue
        family_score, matched = score_fields(terms, record['fields'], library.idf_family)
        # A technique's whole name in the beat counts most, then a two-word piece of it.
        if any(' ' + p + ' ' in norm for p in record['phrases'] if len(p) >= 3):
            family_score += 6
        elif neighbours & record['pairs']:
            family_score += 4
        rows = []
        for x in record['examples']:
            token = family['id'] + '@' + x['example']['id']
            if token in exclude:
                continue
            example_score, example_matched = score_fields(terms, x['fields'], library.idf)
            rows.append((example_score, x['example']['id'] == family.get('default_example'), x, example_matched))
        if not rows:
            continue
        rows.sort(key=lambda row: (row[0], row[1]), reverse=True)
        matched |= rows[0][3]
        score = family_score + .35 * rows[0][0]
        if score < 1.5 or not matched:
            continue
        own = library.own_videos.get(family['id'], 0)
        score *= 1 + .05 * min(own, 3)
        recently = (used or {}).get(family['id'], [])
        if recently:
            # Lower, not hidden: a recent move should lose ties, never a fit to a weaker match.
            score *= .65 + .05 * min(r['rank'] for r in recently)
        repeated = list((earlier or {}).get(family['id'], []))
        if repeated:
            score *= .6
        markers = [family.get('pack')] + [x['entry'].get('pack') for _, _, x, _ in rows]
        pack = next((m for m in markers if isinstance(m, dict) and isinstance(m.get('id'), str)), None)
        pack_info = None
        if pack:
            record_pack = library.packs.get(pack.get('id'), {})
            license_info = record_pack.get('license', {}) if isinstance(record_pack, dict) else {}
            pack_info = {'id': pack.get('id'), 'name': pack.get('name'),
                         'license_file': f"references/pack-{pack.get('id')}/LICENSE.txt",
                         'license_summary': license_info.get('summary') if isinstance(license_info, dict) else None}
        listed = []
        for example_score, _, x, example_matched in rows[:examples]:
            entry, example = x['entry'], x['example']
            fragment, url = link(family['id'], example['id'], base)
            listed.append({'example_id': example['id'], 'token': family['id'] + '@' + example['id'], 'label': example.get('label', ''),
                           'start': example.get('start'), 'end': example.get('end'), 'link': fragment, 'url': url,
                           'media_path': entry.get('media_path'), 'poster_path': 'style-library/dist/' + example.get('poster', ''),
                           'source': {'reference_id': entry['id'], 'title': entry.get('title', ''), 'creator': entry.get('creator', ''),
                                      'creator_id': entry.get('creator_id', ''), 'kind': x['kind'], 'project_id': entry.get('project_id'),
                                      'pack_id': entry['pack'].get('id') if isinstance(entry.get('pack'), dict) else None},
                           'matched': sorted(written[t] for t in example_matched)})
        ordered = [written[t] for t in sorted(matched, key=lambda t: (-library.idf_family.get(t, 0), -library.idf.get(t, 0), t))]
        results.append({'technique_id': family['id'], 'title': family.get('title', ''), 'category': family.get('category', ''),
                        'summary': family.get('summary', ''), 'direction': family.get('direction', ''),
                        'keep': family.get('keep', []), 'avoid': family.get('avoid', []), 'recipe': family.get('recipe'),
                        'pack': pack_info, 'score': round(score, 2), 'matched': ordered,
                        'unmatched': [written[t] for t in direct if t not in matched],
                        'used_in_my_videos': own, 'recently_used_in': [{k: r[k] for k in ('project_id', 'title')} for r in recently],
                        'in_this_project': family['id'] in here, 'also_top_for_beats': repeated,
                        'reason': reason_for(ordered, own, recently, family['id'] in here, pack_info), 'examples': listed})
    results.sort(key=lambda r: (-r['score'], r['technique_id']))
    return results[:limit]


def check(text, name, limit):
    if not isinstance(text, str) or not text.strip() or len(text) > limit or any(ord(c) < 32 and c not in '\n\t' for c in text):
        raise ValueError(f'Describe the {name} in at most {limit} characters.')
    return text.strip()


def recall(query=None, project_id=None, limit=5, examples=2, recent=5, exclude=(), source='all', beats=None, base_url=None):
    """Rank families and exact examples for one query, or for each beat with variety across beats."""
    if (query is None) == (beats is None):
        raise ValueError('Give one query or a list of beats.')
    for value, name, low, high in [(limit, 'limit', 1, 20), (examples, 'examples', 1, 5), (recent, 'recent', 0, 20)]:
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'Use a {name} from {low} to {high}.')
    if source not in SOURCES:
        raise ValueError('Choose source all, mine, others or packs.')
    if project_id is not None and (not isinstance(project_id, str) or not TOKEN.fullmatch(project_id)):
        raise ValueError('Use a project ID such as my-video.')
    exclude = set(exclude or ())
    if any(not isinstance(e, str) or not re.fullmatch(FAMILY_ID.pattern + r'(?:@[a-z0-9][a-z0-9-]*)?', e) for e in exclude):
        raise ValueError('Exclude techniques by ID, such as tech-orbit or tech-orbit@example-id.')
    if base_url is not None:
        parsed = urlparse(base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment or parsed.username:
            raise ValueError('Use a valid library address.')
    library = Library(source)
    if project_id is not None and not any(p.get('id') == project_id for p in library.projects):
        raise ValueError(f'No project {project_id} in this studio.')
    recent_list, used = library.recency(project_id, recent)
    here = library.here(project_id) if project_id else set()
    base = base_url or server_url()
    out = {'schema_version': SCHEMA, 'project_id': project_id, 'source': source,
           'recent_projects': [p['id'] for p in recent_list],
           'library': {'techniques': len(library.families), 'examples': sum(len(f['examples']) for f in library.families),
                       'all_examples': library.total_examples},
           'note': ('Retrieval only: inspect each example before borrowing it. Borrow only when it fits the beat; '
                    'otherwise design something new and label it new. The creator’s explicit picks and borrowing notes win. '
                    'Pack techniques: recreate with the creator’s footage and copy any recipe into the project first.')}
    if beats is None:
        out['query'] = check(query, 'query', 2000)
        out['results'] = rank(library, out['query'], limit, examples, used, here, exclude, None, base)
        return out
    if not isinstance(beats, list) or not 1 <= len(beats) <= 40:
        raise ValueError('Give between 1 and 40 beats.')
    earlier, rows = {}, []
    for number, beat in enumerate(beats, 1):
        text = check(beat, 'beat', 2000)
        results = rank(library, text, limit, examples, used, here, exclude, earlier, base)
        if results:
            earlier.setdefault(results[0]['technique_id'], []).append(number)
        rows.append({'beat': number, 'text': text, 'results': results})
    out['beats'] = rows
    return out


def main(argv=None):
    global STUDIO
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    what = parser.add_mutually_exclusive_group(required=True)
    what.add_argument('--query', help='One beat or brief, in plain words.')
    what.add_argument('--beat', action='append', help='One storyboard beat; repeat for each beat, in order.')
    parser.add_argument('--project', help='Project ID, so its own picks and recent projects are known.')
    parser.add_argument('--limit', type=int, default=5, help='Techniques per query or beat (1-20, default 5).')
    parser.add_argument('--examples', type=int, default=2, help='Exact examples per technique (1-5, default 2).')
    parser.add_argument('--recent', type=int, default=5, help='Recent projects whose techniques rank lower (0-20, default 5; 0 turns this off).')
    parser.add_argument('--exclude', action='append', default=[], help='Technique or technique@example to leave out; repeatable.')
    parser.add_argument('--source', choices=SOURCES, default='all', help='Whose examples to search (default all).')
    parser.add_argument('--base-url', help='Studio address for full library links (default: the running studio, if known).')
    parser.add_argument('--studio', help='Read another studio folder instead of this one (read-only).')
    args = parser.parse_args(argv)
    if args.studio:
        STUDIO = Path(args.studio).expanduser().resolve()
    try:
        result = recall(args.query, args.project, args.limit, args.examples, args.recent, args.exclude, args.source,
                        args.beat, args.base_url)
    except ValueError as error:
        print(json.dumps({'schema_version': SCHEMA, 'error': str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
