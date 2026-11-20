"""Studio code reads and writes text as UTF-8 on every platform.

Windows uses a locale code page (often cp1252) when no encoding is given, so a
bare read_text() that works on macOS can garble or reject the studio's JSON
there. This check runs on every CI platform, so a missed encoding fails on
macOS and Linux too, not only on a Windows machine.
"""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_METHODS = {'read_text', 'write_text'}


def production_files():
    for folder in (ROOT / 'scripts', ROOT / 'style-library'):
        for path in sorted(folder.glob('*.py')):
            if not path.name.startswith('test_'):
                yield path


def open_mode(node):
    if len(node.args) > 1:
        return node.args[1]
    return next((k.value for k in node.keywords if k.arg == 'mode'), None)


def calls_without_encoding(source):
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        keywords = {k.arg for k in node.keywords}
        if 'encoding' in keywords or None in keywords:
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr in TEXT_METHODS:
            yield node.lineno, func.attr
        elif isinstance(func, ast.Name) and func.id == 'open':
            mode = open_mode(node)
            binary = isinstance(mode, ast.Constant) and isinstance(mode.value, str) and 'b' in mode.value
            if not binary:
                yield node.lineno, 'open'


class TextEncodingTest(unittest.TestCase):
    def test_detector_flags_missing_encodings(self):
        found = list(calls_without_encoding(
            "p.read_text()\np.write_text('x')\nopen('f')\nopen('f', 'rb')\n"
            "p.read_text(encoding='utf-8')\nopen('f', mode='wb')\n"))
        self.assertEqual(found, [(1, 'read_text'), (2, 'write_text'), (3, 'open')])

    def test_studio_code_names_an_encoding_for_text_files(self):
        problems = []
        for path in production_files():
            for line, call in calls_without_encoding(path.read_text(encoding='utf-8')):
                problems.append(f'{path.relative_to(ROOT).as_posix()}:{line} {call}() has no encoding')
        self.assertEqual(problems, [], 'Pass encoding="utf-8" so Windows reads the same text as macOS.')


if __name__ == '__main__':
    unittest.main()
