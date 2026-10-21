"""Run only the project-local pinned HyperFrames CLI."""
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
cli=ROOT/'node_modules/hyperframes/bin/hyperframes.mjs'
if not cli.is_file():raise SystemExit('Run python3 scripts/setup.py first.')
result=subprocess.run(['node',str(cli),*sys.argv[1:]],env={**os.environ,'HYPERFRAMES_NO_UPDATE_CHECK':'1','HYPERFRAMES_NO_TELEMETRY':'1'})
raise SystemExit(result.returncode)
