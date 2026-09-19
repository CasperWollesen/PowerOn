"""Check the code against the specification and regenerate the traceability matrix.

    python dev/spec-check.py           # report and rewrite docs/spec/traceability.md
    python dev/spec-check.py --check   # CI mode: fail instead of rewriting

Reads requirement IDs from docs/spec/*.md, `@req` tags from the source and the IDs
in dev/tests/*.test.js, then reports what is missing. Also checks that the service
worker precache list, the manifest icons and the files index.html references are
all in step with what is on disk.

Exit code 0 = everything consistent.
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_DIR = os.path.join(ROOT, 'docs', 'spec')
TRACE_FILE = os.path.join(SPEC_DIR, 'traceability.md')
SKIP_SPEC_FILES = {'README.md', 'product.md', 'traceability.md'}

ID_PATTERN = re.compile(r'^###\s+([A-Z]{3,6}-\d{2})\s+·\s+(.+?)\s*$', re.M)
META_PATTERN = re.compile(
    r'\*\*Status:\*\*\s*(\w+).*?\*\*Priority:\*\*\s*(\w+).*?\*\*Verify:\*\*\s*(\w+)', re.S
)
REQ_TAG = re.compile(r'@req\s+((?:[A-Z]{3,6}-\d{2}[ ,]*)+)')
TEST_CALL = re.compile(r"\btest\(\s*'((?:[A-Z]{3,6}-\d{2}[ ,]*)+)'")

CODE_DIRS = ['js', 'worker']
CODE_FILES = ['index.html', 'service-worker.js', 'css/styles.css']
TEST_DIR = os.path.join('dev', 'tests')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def ids_from(text):
    return [i for i in re.split(r'[ ,]+', text.strip()) if i]


def load_requirements():
    """{id: {title, status, priority, verify, file}} plus a list of problems."""
    requirements = {}
    problems = []
    for name in sorted(os.listdir(SPEC_DIR)):
        if not name.endswith('.md') or name in SKIP_SPEC_FILES:
            continue
        text = read(os.path.join(SPEC_DIR, name))
        matches = list(ID_PATTERN.finditer(text))
        for i, match in enumerate(matches):
            req_id, title = match.group(1), match.group(2)
            block = text[match.end(): matches[i + 1].start() if i + 1 < len(matches) else len(text)]
            meta = META_PATTERN.search(block)
            if not meta:
                problems.append(f'{name}: {req_id} has no Status/Priority/Verify line')
                status, priority, verify = '?', '?', '?'
            else:
                status, priority, verify = meta.groups()
            if req_id in requirements:
                problems.append(f'{name}: {req_id} is defined twice')
            requirements[req_id] = {
                'title': title,
                'status': status,
                'priority': priority,
                'verify': verify,
                'file': name,
            }
    return requirements, problems


def walk_files():
    for directory in CODE_DIRS:
        base = os.path.join(ROOT, directory)
        for name in sorted(os.listdir(base)):
            if name.endswith(('.js', '.css')):
                yield os.path.join(directory, name).replace('\\', '/')
    for name in CODE_FILES:
        if os.path.exists(os.path.join(ROOT, name)):
            yield name


def collect_references():
    """{id: [files]} for code tags and {id: [test names]} for tests."""
    code = {}
    tests = {}
    for rel in walk_files():
        text = read(os.path.join(ROOT, rel))
        for match in REQ_TAG.finditer(text):
            for req_id in ids_from(match.group(1)):
                code.setdefault(req_id, [])
                if rel not in code[req_id]:
                    code[req_id].append(rel)

    test_dir = os.path.join(ROOT, TEST_DIR)
    for name in sorted(os.listdir(test_dir)):
        if not name.endswith('.test.js'):
            continue
        rel = f'{TEST_DIR}/{name}'.replace('\\', '/')
        text = read(os.path.join(test_dir, name))
        for match in TEST_CALL.finditer(text):
            for req_id in ids_from(match.group(1)):
                tests.setdefault(req_id, [])
                if rel not in tests[req_id]:
                    tests[req_id].append(rel)
    return code, tests


def consistency_checks():
    """Checks that do not depend on the spec text: precache list, icons, includes."""
    problems = []

    sw = read(os.path.join(ROOT, 'service-worker.js'))
    shell = set(re.findall(r"'\./([^']+)'", sw))
    on_disk = {f'js/{n}' for n in os.listdir(os.path.join(ROOT, 'js')) if n.endswith('.js')}
    for missing in sorted(on_disk - shell):
        problems.append(f'service-worker.js: {missing} is not in APP_SHELL (PWA-03)')
    for extra in sorted(shell - on_disk):
        if extra and not os.path.exists(os.path.join(ROOT, extra)):
            problems.append(f'service-worker.js: APP_SHELL lists missing file {extra}')

    manifest = json.loads(read(os.path.join(ROOT, 'manifest.json')))
    for icon in manifest.get('icons', []):
        path = icon['src'].lstrip('./')
        if not os.path.exists(os.path.join(ROOT, path)):
            problems.append(f'manifest.json: missing icon {path} (PWA-01)')

    index = read(os.path.join(ROOT, 'index.html'))
    for ref in re.findall(r'(?:href|src)="\./([^"]+)"', index):
        if not os.path.exists(os.path.join(ROOT, ref)):
            problems.append(f'index.html: references missing file {ref} (NFR-01)')

    return problems


def build_traceability(requirements, code, tests):
    lines = [
        '# Traceability',
        '',
        '<!-- Generated by dev/spec-check.py – do not edit by hand. -->',
        '',
        'Requirement → the code that implements it → the tests that verify it.',
        '',
        '| ID | Requirement | Status | Verify | Code | Tests |',
        '|---|---|---|---|---|---|',
    ]
    for req_id in sorted(requirements, key=lambda r: (r.split('-')[0], int(r.split('-')[1]))):
        r = requirements[req_id]
        code_refs = ', '.join(f'`{c}`' for c in code.get(req_id, [])) or '–'
        test_refs = ', '.join(f'`{os.path.basename(t)}`' for t in tests.get(req_id, [])) or '–'
        lines.append(
            f"| [{req_id}]({r['file']}#{req_id.lower()}--{slug(r['title'])}) | {r['title']} "
            f"| {r['status']} | {r['verify']} | {code_refs} | {test_refs} |"
        )
    covered = sum(1 for r in requirements if r in tests)
    lines += [
        '',
        f'{len(requirements)} requirements · {len(code)} with code tags · {covered} with tests.',
        '',
    ]
    return '\n'.join(lines)


def slug(title):
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail instead of writing traceability.md')
    args = parser.parse_args()

    requirements, problems = load_requirements()
    code, tests = collect_references()
    problems += consistency_checks()

    known = set(requirements)
    for req_id, files in sorted(code.items()):
        if req_id not in known:
            problems.append(f'unknown requirement {req_id} referenced in {", ".join(files)}')
    for req_id, files in sorted(tests.items()):
        if req_id not in known:
            problems.append(f'unknown requirement {req_id} referenced in {", ".join(files)}')

    warnings = []
    for req_id, r in sorted(requirements.items()):
        if r['status'] == 'Implemented' and req_id not in code and r['verify'] not in ('review', 'check'):
            problems.append(f'{req_id} is Implemented but no code is tagged with it')
        if r['verify'] == 'test' and req_id not in tests:
            problems.append(f'{req_id} says Verify: test but no test references it')
        if r['status'] == 'Partial':
            warnings.append(f'{req_id} is only partially implemented')
        if r['status'] == 'Planned' and req_id in code:
            warnings.append(f'{req_id} is Planned but code already references it')

    table = build_traceability(requirements, code, tests)
    if args.check:
        current = read(TRACE_FILE) if os.path.exists(TRACE_FILE) else ''
        if current.strip() != table.strip():
            problems.append('docs/spec/traceability.md is out of date – run python dev/spec-check.py')
    else:
        with open(TRACE_FILE, 'w', encoding='utf-8', newline='\n') as f:
            f.write(table)

    for w in warnings:
        print(f'note: {w}')
    for p in problems:
        print(f'error: {p}', file=sys.stderr)

    covered = sum(1 for r in requirements if r in tests)
    print(
        f'{len(requirements)} requirements · {len(code)} implemented and tagged · '
        f'{covered} covered by tests · {len(problems)} problems'
    )
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
