"""Read-only version, empty-seed and exact-source-tree release checks."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def verify(files):
    def data(name):
        return json.loads(files[name])
    version = data('package.json')['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version):
        raise ValueError('Use a numbered release version without local build metadata.')
    lock = data('package-lock.json')
    if lock['version'] != version or lock['packages']['']['version'] != version:
        raise ValueError('Package/lock versions disagree.')
    html = files['style-library/dist/index.html'].decode()
    if re.findall(r'<meta name="studio-version" content="([^"]+)"', html) != [version]:
        raise ValueError('Installed interface version disagrees with package.json.')
    if 'Local preview' in html:
        raise ValueError('Published interface still says Local preview.')
    for name in ['README.md', 'INSTALL_PROMPT.md', 'docs/PILOT.md']:
        tags = re.findall(r'v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?', files[name].decode())
        if not tags or any(tag != 'v' + version for tag in tags):
            raise ValueError('Wrong installation/pilot tag in ' + name)
    catalog = data('style-library/catalog.example.json')
    projects = data('style-library/projects.example.json')
    if catalog.get('entries') != [] or catalog.get('techniques') != [] or catalog.get('removed_references'):
        raise ValueError('Starter reference/technique seeds contain owner data.')
    if projects.get('projects') != []:
        raise ValueError('Starter project seed contains owner data.')
    return version


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--git-ref', help='Also require this committed tree to equal the reviewed source.')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('release_export', ROOT / 'scripts/export_release.py')
    export = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(export)
    files = dict(export.sources())
    version = verify(files)
    if args.git_ref:
        commit = subprocess.check_output(['git', 'rev-parse', '--verify', args.git_ref + '^{commit}'], cwd=ROOT, text=True).strip()
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', commit], cwd=ROOT, text=True).splitlines()
        if set(names) != set(files):
            raise ValueError('Git tree differs from source allowlist: ' + repr(sorted(set(names) ^ set(files))))
        for name, expected in files.items():
            actual = subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT)
            if actual != expected:
                raise ValueError('Committed content differs: ' + name)
    print(json.dumps({'version': version, 'source_files': len(files), 'empty_seeds': True,
                      'git_ref_checked': args.git_ref, 'read_only': True}))


if __name__ == '__main__':
    main()
