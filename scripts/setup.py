"""Repeatable local setup; never changes global tools or overwrites owner data."""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
PY = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
ENV = {**os.environ, 'HYPERFRAMES_NO_UPDATE_CHECK': '1', 'HYPERFRAMES_NO_TELEMETRY': '1', 'HYPERFRAMES_SKIP_SKILLS': '1'}

def run(args):
    cmd = [str(a) for a in args]
    if os.name == 'nt':
        # npm and local .bin shims are .cmd files that CreateProcess cannot resolve without a shell.
        resolved = shutil.which(cmd[0])
        if resolved: cmd[0] = resolved
    subprocess.run(cmd, cwd=ROOT, env=ENV, check=True)

def local_package_present(name):
    if not PY.is_file(): return False
    try:
        result = subprocess.run([str(PY), '-I', '-c',
                                 'import importlib.util,sys;sys.exit(0 if importlib.util.find_spec(sys.argv[1]) else 1)', name],
                                capture_output=True, timeout=10)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired): return False

def node_supported():
    if not shutil.which('node'): return False
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True, timeout=10, check=True)
        version = tuple(int(part) for part in result.stdout.strip().lstrip('v').split('.'))
        return len(version) == 3 and version >= (22, 12, 0)
    except (OSError, ValueError, subprocess.SubprocessError): return False

def guard_renderer_update():
    """Never replace dependencies underneath this installation's live editors."""
    cli = ROOT/'node_modules/hyperframes/bin/hyperframes.mjs'
    if not cli.is_file(): return
    try:
        result = subprocess.run(['node', str(cli), 'preview', '--list', '--json'],
                                cwd=ROOT, env=ENV, capture_output=True, text=True,
                                timeout=20, check=True)
        data = json.loads(result.stdout)
        sessions = data['result']['sessions']
        if data.get('ok') is not True or not isinstance(sessions, list): raise ValueError()
        for session in sessions:
            directory = session['projectDir']
            if not isinstance(directory, str) or not Path(directory).is_absolute(): raise ValueError()
            if Path(directory).resolve().is_relative_to(ROOT.resolve()):
                raise SystemExit('This studio has running HyperFrames previews. Media setup stopped before changing dependencies or projects. Save your work and close those previews, then rerun setup. See docs/UPDATING.md.')
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Could not verify running HyperFrames previews. Media setup stopped before changing dependencies or projects. Ask your assistant to inspect this installation before retrying. See docs/UPDATING.md.')

def capability_report():
    tools = {t: bool(shutil.which(t)) for t in ['node', 'npm', 'ffmpeg', 'ffprobe']}
    supported_node = node_supported()
    apple_silicon = (platform.system(), platform.machine()) == ('Darwin', 'arm64')
    renderer = (ROOT/'node_modules/hyperframes/bin/hyperframes.mjs').is_file()
    pillow = local_package_present('PIL')
    speech = local_package_present('mlx_whisper') if apple_silicon else False
    registries = all((ROOT/f'style-library/{name}.json').is_file() for name in ['catalog', 'projects', 'settings'])
    ready = all(tools.values()) and supported_node and renderer and pillow
    return {'python': platform.python_version(), 'platform': platform.system(), 'machine': platform.machine(),
            'tools': tools, 'node_supported': supported_node, 'media_venv': PY.is_file(), 'renderer': renderer,
            'ready_for_studio': registries, 'ready_for_media': ready,
            'capabilities': {
                'studio': {'status': 'ready' if registries else 'run_setup', 'detail': 'Use --studio-only for the home base without media packages.'},
                'rendering': {'status': 'ready_for_smoke' if ready else 'missing_dependencies', 'detail': 'Dependency check only. Run scripts/smoke.py to verify an actual render and browser.'},
                'transcription': {'status': 'available' if speech else 'not_installed' if apple_silicon else 'unsupported_platform', 'detail': 'Optional --transcription on Apple Silicon macOS; model downloads on first use. Else provide a word-timed transcript.'},
                'reference_browser': {'status': 'check_in_chat', 'detail': 'Your assistant must verify its browser connection and source access. Sign in in that browser if needed; provide a file if access fails.'},
                'basic_sound_effects': {'status': 'available' if tools['ffmpeg'] else 'needs_ffmpeg', 'detail': 'The assistant can synthesize simple sounds locally with code/FFmpeg. Audition the result; no paid library is required.'},
                'image_generation': {'status': 'optional_check_in_chat', 'detail': 'Use an available assistant feature, your own service, or supplied images. No image-generation account is bundled.'},
                'external_services': {'status': 'optional_user_accounts', 'detail': 'No site credentials, reference downloader or paid sound/media subscription is configured by setup.'}},
            'validation_scope': 'Full media workflow validated locally on Apple Silicon macOS. Other platforms and fresh assistant/team use remain pilot coverage.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--studio-only', action='store_true', help='Website and data tools only; no media packages')
    parser.add_argument('--transcription', action='store_true', help='Install the optional Apple Silicon speech lock')
    args = parser.parse_args()
    if sys.version_info < (3, 11): raise SystemExit('Use Python 3.11 or newer.')
    if args.transcription and (platform.system(), platform.machine()) != ('Darwin', 'arm64'):
        raise SystemExit('On-device transcription currently supports Apple Silicon macOS. Supply a transcript on other platforms.')
    if args.check:
        report = capability_report()
        print(json.dumps(report, indent=2))
        raise SystemExit(0 if (report['ready_for_studio'] if args.studio_only else report['ready_for_media']) else 1)
    if not args.studio_only:
        missing = [t for t in ['node', 'npm', 'ffmpeg', 'ffprobe'] if not shutil.which(t)]
        if missing: raise SystemExit('Install these prerequisites first: '+', '.join(missing)+'. See SETUP.md; no global installs were attempted.')
        if not node_supported():
            raise SystemExit('Node 22.12.0 or newer is required by the pinned renderer. See SETUP.md.')
        guard_renderer_update()
        if not PY.exists(): venv.EnvBuilder(with_pip=True).create(ROOT/'.venv')
        run([PY,'-m','pip','install','--require-hashes','-r','requirements.lock.txt'])
        if args.transcription:
            run([PY,'-m','pip','install','--require-hashes','-r','requirements-transcription-macos.lock.txt'])
        run(['npm','ci','--ignore-scripts'])
        run(['node_modules/.bin/hyperframes','browser','ensure'])
        assets = ROOT/'examples/studio-check/assets'; assets.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT/'node_modules/gsap/dist/gsap.min.js', assets/'gsap.min.js')
    for name in ['catalog','projects','settings']:
        target = ROOT/f'style-library/{name}.json'
        if not target.exists(): shutil.copy2(ROOT/f'style-library/{name}.example.json',target)
    print(json.dumps(capability_report(), indent=2))
    print('Setup complete. Existing projects/settings were preserved. Start with: python3 style-library/start.py')

if __name__ == '__main__': main()
