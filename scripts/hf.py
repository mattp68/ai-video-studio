"""Run only the project-local pinned HyperFrames CLI."""
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'style-library'))
import disk  # noqa: E402

cli=ROOT/'node_modules/hyperframes/bin/hyperframes.mjs'
if not cli.is_file():raise SystemExit('Run python3 scripts/setup.py first.')
# A render that fills the disk can fail part-way and leave large partial files behind.
warning=disk.render_space_warning(sys.argv[1:])
if warning:print(warning,file=sys.stderr)
result=subprocess.run(['node',str(cli),*sys.argv[1:]],env={**os.environ,'HYPERFRAMES_NO_UPDATE_CHECK':'1','HYPERFRAMES_NO_TELEMETRY':'1'})
raise SystemExit(result.returncode)
