#!/usr/bin/env python3
"""Package tracked source, audited Git history and the built runtime, without caches."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT.parent / 'deliverables' / 'projectgraph-p0.zip'))
    args = parser.parse_args()
    if git('status', '--porcelain').strip():
        raise RuntimeError('Commit all source/document changes before packaging')
    if not (ROOT / 'frontend/dist/index.html').is_file():
        raise RuntimeError('Build frontend first')
    commit = git('rev-parse', 'HEAD').decode().strip()
    bundle = ROOT / 'projectgraph-history.bundle'
    subprocess.run(['git', 'bundle', 'create', str(bundle), '--all'], cwd=ROOT, check=True)
    subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=ROOT, check=True)
    log = git('log', '--date=iso-strict', '--format=%H %ad %s').decode()
    (ROOT / 'docs/git-log.txt').write_text(log)
    paths = [ROOT / p for p in git('ls-files', '-z').decode().split('\0') if p]
    paths += [bundle, ROOT / 'docs/git-log.txt']
    paths += sorted(p for p in (ROOT / 'frontend/dist').rglob('*') if p.is_file())
    banned = {'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'artifacts', 'test-results', 'playwright-report'}
    for path in paths:
        relative = path.relative_to(ROOT)
        if banned.intersection(relative.parts) or path.name.endswith(('.pyc', '.db', '.sqlite', '.tsbuildinfo')) or '.db-' in path.name:
            raise RuntimeError(f'Forbidden cache/database file: {relative}')
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'version': '0.1.0', 'commit': commit, 'created_at': datetime.now(timezone.utc).isoformat(),
                'source': 'Git tracked files', 'git_history': 'projectgraph-history.bundle',
                'built_frontend': True, 'database_included': False, 'dependencies_included': False,
                'file_count': len(paths) + 1}
    with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
        for path in paths:
            archive.write(path, 'projectgraph/' + path.relative_to(ROOT).as_posix())
        archive.writestr('projectgraph/RELEASE_MANIFEST.json', json.dumps(manifest, indent=2)+'\n')
    with ZipFile(output) as archive:
        assert archive.testzip() is None, 'ZIP CRC check failed'
        assert len(set(archive.namelist())) == len(archive.namelist()), 'Duplicate ZIP paths'
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.sha256').write_text(f'{digest}  {output.name}\n')
    print(json.dumps({'file':str(output), 'bytes':output.stat().st_size, 'sha256':digest, 'commit':commit,
                     'entries':len(paths)+1}, indent=2))

if __name__ == '__main__':
    main()
