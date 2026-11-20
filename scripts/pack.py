"""Install, check, list, remove or build creator packs. Read docs/PACKS.md first.

  python3 scripts/pack.py verify <pack.zip>       check a pack and show what it contains
  python3 scripts/pack.py install <pack.zip>      install it, or update an installed copy
  python3 scripts/pack.py list                    installed packs
  python3 scripts/pack.py remove <pack-id>        uninstall; installing the file again restores it
  python3 scripts/pack.py build --collection "<name>" --pack-id <id> --version 1.0.0 \\
      --license LICENSE.txt --out <file.zip>      pack author only: build from a collection

An unzipped pack folder works wherever a pack file does. Installing never changes your projects,
personal collections, notes, approvals or removed references.
"""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'style-library'))
import creator_packs as packs  # noqa: E402
import review_actions as storage  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    verify = commands.add_parser('verify', help='Check a pack file without installing it')
    verify.add_argument('pack', type=Path)
    install = commands.add_parser('install', help='Install or update a pack')
    install.add_argument('pack', type=Path)
    install.add_argument('--dry-run', action='store_true', help='Report what would change without changing anything')
    install.add_argument('--replace-local-edits', action='store_true',
                         help='Replace pack records that were edited in this studio (ask the owner first)')
    install.add_argument('--allow-downgrade', action='store_true', help='Install an older version over a newer one')
    commands.add_parser('list', help='List installed packs')
    remove = commands.add_parser('remove', help='Uninstall a pack')
    remove.add_argument('pack_id')
    remove.add_argument('--dry-run', action='store_true')
    remove.add_argument('--replace-local-edits', action='store_true')
    build = commands.add_parser('build', help='Pack author: build a pack file from a personal collection')
    build.add_argument('--collection', required=True, help='Exact name of the personal collection')
    build.add_argument('--pack-id', required=True, help='Stable ID kept across versions, such as creator-pack-1')
    build.add_argument('--version', required=True, help='Pack version such as 1.0.0')
    build.add_argument('--license', required=True, type=Path, help='The pack license text file')
    build.add_argument('--license-summary', help='One-sentence license summary shown before installing')
    build.add_argument('--out', type=Path, help='Pack file to write (outside the studio library)')
    build.add_argument('--name', help='Pack name shown to buyers (default: the collection name)')
    build.add_argument('--author-url', help='Public https link for the author or product')
    build.add_argument('--description', help='One paragraph shown before installing')
    build.add_argument('--overrides', type=Path, help='Buyer-facing wording for videos, techniques and examples')
    build.add_argument('--recipes', type=Path, help='Folder with one editable recipe folder per technique ID')
    build.add_argument('--studio', type=Path, default=ROOT, help='Studio to read (default: this one)')
    build.add_argument('--dry-run', action='store_true', help='Check the collection and list warnings only')
    build.add_argument('--strict', action='store_true', help='Stop when there are licensing warnings')
    build.add_argument('--overwrite', action='store_true', help='Replace an existing output file')
    args = parser.parse_args(argv)
    try:
        if args.command == 'verify':
            result = packs.verify(args.pack)
        elif args.command == 'install':
            result = packs.install(args.pack, dry_run=args.dry_run, replace_local_edits=args.replace_local_edits,
                                   allow_downgrade=args.allow_downgrade)
        elif args.command == 'list':
            result = packs.installed()
        elif args.command == 'remove':
            result = packs.remove(args.pack_id, dry_run=args.dry_run, replace_local_edits=args.replace_local_edits)
        else:
            if not args.dry_run and not args.out:
                parser.error('build needs --out unless you use --dry-run')
            result = packs.build(args.studio, args.collection, args.out, args.pack_id, args.version, args.license,
                                 name=args.name, author_url=args.author_url, description=args.description,
                                 license_summary=args.license_summary, overrides=args.overrides, recipes=args.recipes,
                                 dry_run=args.dry_run, strict=args.strict, overwrite=args.overwrite)
    except (packs.PackError, storage.ReviewError, OSError, ValueError, KeyError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
