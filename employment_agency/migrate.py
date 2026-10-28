"""Explicit migration from earlier workspaces and review queues. No source deletion."""
from pathlib import Path
import json
import shutil
import re
import os
from contextlib import contextmanager, ExitStack
from .store import atomic, encode, digest, now, EXPORT_DIRS, excluded
from .workspaces import inside, configure, settings
from . import packages


def read_files(folder):
    files = {}
    for p in Path(folder).iterdir():
        if not p.is_file() or p.is_symlink():
            continue
        name = p.name
        if name.endswith('-Resume.pdf'):
            name = 'resume.pdf'
        elif name.endswith('-Cover-Letter.pdf'):
            name = 'cover-letter.pdf'
        elif name == 'main.tex':
            name = 'resume.tex'
        if name in {'resume.pdf', 'cover-letter.pdf', 'resume.docx', 'cover-letter.docx',
                    'resume.tex', 'cover-letter.tex', 'resume.txt', 'cover-letter.txt',
                    'application.eml', 'evidence.json', 'checksums.json', 'job.json',
                    'review.md', 'source-summary.md', 'coverage.json', 'manifest.json',
                    'build-manifest.json', 'master-source.tex', 'application-email.txt',
                    'resume-1.png', 'resume-2.png', 'letter-1.png'}:
            files[name] = p.read_bytes()
    return files


def mapping(record):
    return packages.document_map(record)

@contextmanager
def locked(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        try:
            if os.name == 'nt':
                import msvcrt
                handle.write(b'0'); handle.flush(); handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise ValueError('Stop the application before migrating its workspace') from exc
        yield


def migrate(source, destination, config=None):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    runtime = source / '.local/general-system/workspace'
    if not (runtime / 'state.json').exists(): runtime = source
    project = destination / 'pyproject.toml'
    if project.is_file() and 'name = "employment-agency-local"' in project.read_text():
        raise ValueError('Migrate into workspace/, not the public source folder')
    with ExitStack() as stack:
        for path in sorted({runtime / '.lock', destination / '.lock'}):
            if path.is_symlink(): raise ValueError('Workspace lock cannot be a symlink')
            stack.enter_context(locked(path))
        return _migrate(source, destination, config)


def _migrate(source, destination, config=None):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    runtime = source / '.local/general-system/workspace'
    if not (runtime / 'state.json').is_file():
        runtime = source
    original = (runtime / 'state.json').read_bytes()
    marker = destination / 'records/migration.json'
    if marker.is_file():
        report = json.loads(marker.read_text())
        if report['source_sha256'] != digest(original):
            raise ValueError('Source state changed since migration; reconcile before retrying')
        return report
    if (destination / 'state.json').exists() and destination != runtime:
        raise ValueError('Destination already has application state')
    state = json.loads(original)
    if state.get('schema') not in (1, 2):
        raise ValueError('Unsupported source state')
    destination.mkdir(parents=True, exist_ok=True)
    if source != destination:
        for name in EXPORT_DIRS:
            if name in ('packages', '.recovery'):
                continue
            src = source / name
            if src.exists():
                for p in src.rglob('*'):
                    rel = p.relative_to(source).as_posix()
                    inside(source, rel)
                    if p.is_file():
                        dest = inside(destination, rel)
                        if dest.exists() and dest.read_bytes() != p.read_bytes():
                            raise ValueError('Destination file conflict: ' + rel)
                        if not dest.exists():
                            atomic(dest, p.read_bytes())
    configure(destination, {**(config or {}), 'setup_complete': True})
    state['schema'] = 2
    state['consents'] = {}
    state.pop('_workspace', None)
    state.pop('_master', None)
    atomic(inside(destination, 'records/legacy/runtime-state.json'), encode({**json.loads(original), 'consents': {}}))
    history = packages.catalogue(destination)
    warnings, migrated = [], []

    def locate(files, job, origin, created):
        fingerprints = {k: digest(v) for k, v in sorted(files.items())}
        fingerprint = digest(json.dumps({'files': fingerprints, 'job': job.get('id', job.get('url', ''))}, sort_keys=True).encode())
        matches = [(rel, data) for rel, data in history.values() if data.get('source_fingerprint') == fingerprint]
        if not matches:
            # Compare both documents and job provenance, never just a similar title.
            matches = [(rel, data) for rel, data in history.values()
                       if data.get('job', {}).get('url') == job.get('url') and job.get('url')
                       and data.get('source_files', {}).get('resume.pdf') == fingerprints.get('resume.pdf')
                       and data.get('source_files', {}).get('cover-letter.pdf') == fingerprints.get('cover-letter.pdf')
                       and all(data.get('source_files', {}).get(k) == v for k, v in fingerprints.items() if k != 'checksums.json')]
        if matches:
            rel, record = sorted(matches, key=lambda x: (x[1].get('generated_at', ''), x[0]))[-1]
            return {'folder': rel, 'documents': mapping(record), 'manifest_hash': packages.seal(destination, destination / rel)}
        version = packages.publish(destination, files, job, state['identity'], generated_at=created or now(),
                                   source=origin, uncertain=True)
        warnings.append('Generation date needs confirmation: ' + version['folder'])
        return version

    for app in state['applications']:
        app.pop('file_changes', None)
        job = next(j for j in state['jobs'] if j['id'] == app['job_id'])
        if not app.get('folder'):
            folder = inside(runtime, 'packages/' + app['id'])
            app.update(locate(read_files(folder), job, 'Legacy runtime package ' + app['id'], app.get('created_at')))
        if app['status'] == 'submitted':
            job['prior_application'] = 'submitted'
        migrated.append(app['id'])

    # Retain both the source queue record and a browsable application record.
    batches = source / 'jobs/batches'
    for batch_path in sorted(batches.glob('*.json')) if batches.exists() else []:
        batch = json.loads(batch_path.read_text())
        for entry in batch.get('entries', []):
            folder = inside(source, entry['path'])
            if not (folder / 'job.json').is_file():
                warnings.append('Missing legacy job metadata: ' + entry['path'])
                continue
            raw = json.loads((folder / 'job.json').read_text())
            job = next((j for j in state['jobs'] if j.get('url') and j['url'] == raw.get('url')), None)
            if job is None:
                job = {**raw, 'id': digest(('legacy-job:' + entry['id']).encode())[:24],
                       'requirements': raw.get('requirements', []), 'availability': 'unknown',
                       'eligibility': 'unknown', 'description': raw.get('summary', ''),
                       'location': raw.get('location', raw.get('city', ''))}
                state['jobs'].append(job)
            feedback_path = source / '.local/application-feedback' / (entry['id'] + '.json')
            feedback = json.loads(feedback_path.read_text()) if feedback_path.exists() else {}
            atomic(inside(destination, 'records/legacy/feedback/' + entry['id'] + '.json'), encode(feedback))
            app_id = digest(('legacy-application:' + entry['id']).encode())[:32]
            if any(a['id'] == app_id for a in state['applications']):
                continue
            status = 'rejected' if feedback.get('status') == 'rejected' else 'draft'
            app = {'id': app_id, 'job_id': job['id'], 'title': job['title'], 'employer': job['employer'],
                   'created_at': batch.get('createdAt') or now(), 'status': status, 'archived': True,
                   'fact_ids': [], 'legacy_id': entry['id'],
                   'comments': [{'at': e.get('at', ''), 'text': e.get('comment', ''), 'status': e.get('action', '')} for e in feedback.get('events', [])]}
            app.update(locate(read_files(folder), raw, entry['path'], app['created_at']))
            if feedback.get('availabilityNote'):
                app['migration_warning'] = feedback['availabilityNote']
            state['applications'].append(app)
        if batch.get('priorApplications'):
            state.setdefault('historical_decisions', []).extend(batch['priorApplications'])
            atomic(inside(destination, 'records/legacy/prior-applications-' + batch_path.stem + '.json'), encode(batch['priorApplications']))
            warnings.append('Earlier submission evidence retained in records/legacy; exact submitted-file association needs review where not recorded.')

    # Preserve the original master provenance. A changed master remains pending review.
    if not state.get('master'):
        master_path = settings(destination)['master']
        hashes = {f.get('source', {}).get('sha256') for f in state['facts'] if f.get('source', {}).get('name') == master_path}
        hashes.discard(None)
        for f in state['facts']:
            if f.get('source', {}).get('name') == master_path:
                f['source']['master'] = master_path
        if len(hashes) == 1:
            state['master'] = {'path': master_path, 'sha256': next(iter(hashes)), 'note': 'Retained original fact-source hash; review any subsequent master changes.'}
        current = inside(destination, master_path)
        if current.is_file():
            atomic(inside(destination, '.recovery/masters/' + digest(current.read_bytes())), current.read_bytes())
    for rel, data in packages.catalogue(destination).values():
        packages.seal(destination, destination / rel)
    # Retain unique research, receipts and career notes previously hidden in runtime folders.
    known = {}
    for base in ('applications', 'resumes', 'master', 'jobs', 'docs'):
        for p in (destination / base).rglob('*') if (destination / base).exists() else []:
            if p.is_file() and not p.is_symlink(): known.setdefault(digest(p.read_bytes()), p.relative_to(destination).as_posix())
    inventory = []
    legacy = source / '.local'
    for p in sorted(legacy.rglob('*')) if legacy.exists() else []:
        rel = p.relative_to(legacy)
        if p.is_symlink() or not p.is_file() or any(part in ('public-system-venv', 'audit', '.git', '__pycache__', 'node_modules') for part in rel.parts): continue
        if p == runtime / 'state.json' or excluded(rel): continue
        if p.suffix.lower() not in ('.md', '.txt', '.json', '.html', '.csv', '.eml', '.tex', '.pdf', '.docx', '.png', '.jpg', '.svg'): continue
        body = p.read_bytes(); sha = digest(body)
        target = known.get(sha)
        if target is None:
            target = 'records/legacy/materials/' + rel.as_posix()
            atomic(inside(destination, target), body)
            known[sha] = target
        inventory.append({'source': '.local/' + rel.as_posix(), 'sha256': sha, 'retained_at': target})
    atomic(inside(destination, 'records/legacy/materials-index.json'), encode(inventory))
    state['events'].append({'at': now(), 'type': 'workspace_migrated', 'source_state_sha256': digest(original)})
    report = {'source_sha256': digest(original), 'at': now(), 'original_application_ids': migrated,
              'applications': len(state['applications']), 'retained_legacy_materials': len(inventory), 'historical_versions': len(packages.catalogue(destination)),
              'warnings': warnings, 'retired_source_code': False}
    atomic(inside(destination, 'state.json'), encode(state))
    atomic(marker, encode(report))
    return report
