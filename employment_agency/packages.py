"""Canonical application versions, immutable recovery objects and named documents."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from email import policy
from email.parser import BytesParser
import io
import json
import re
import tempfile
import shutil
from .store import atomic, encode, digest, now
from .workspaces import inside, city_for, settings, time_zone


def segment(value):
    value = str(value).strip()
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', value).strip(' .') or 'Unknown'
    if clean.split('.')[0].upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        clean = '_' + clean
    return clean if len(clean) <= 100 else clean[:80] + '-' + digest(value.encode())[:10]


def compact(value):
    return ''.join(c for c in str(value) if c.isalnum()) or 'Document'


def filename(original, name, city):
    stem, dot, ext = original.rpartition('.')
    label = {'resume': 'CV', 'cover-letter': 'CoverLetter', 'application': 'Application'}.get(stem)
    return f'{compact(name)}-{label}-{compact(city)}.{ext}' if label else original


def record(root, app):
    return json.loads(inside(root, app['folder'] + '/version.json').read_text())


def changed(root, app):
    try:
        folder = inside(root, app['folder'])
        baseline = json.loads(inside(root, '.recovery/versions/' + app['manifest_hash'] + '.json').read_text())
        result = [name for name, sha in baseline['files'].items()
                  if not inside(folder, name).is_file() or digest(inside(folder, name).read_bytes()) != sha]
        if digest(inside(folder, 'version.json').read_bytes()) != app['manifest_hash']:
            result.append('version.json')
        return result
    except (OSError, ValueError, KeyError):
        return ['Missing or invalid application version']


def seal(root, folder):
    """Preserve originals before they can be edited outside the app."""
    folder = inside(root, Path(folder).relative_to(root).as_posix())
    raw = inside(folder, 'version.json').read_bytes()
    data = json.loads(raw)
    for name, sha in data['files'].items():
        if not isinstance(sha, str) or not re.fullmatch('[a-f0-9]{64}', sha):
            raise ValueError('Invalid document checksum')
        body = inside(folder, name).read_bytes()
        if digest(body) != sha:
            raise ValueError('Cannot preserve an altered version: ' + name)
        dest = inside(root, '.recovery/objects/' + sha)
        if dest.exists():
            if digest(dest.read_bytes()) != sha:
                raise ValueError('Recovery object checksum mismatch')
        else:
            atomic(dest, body)
    key = digest(raw)
    atomic(inside(root, '.recovery/versions/' + key + '.json'), raw)
    index_path = inside(root, '.recovery/index.json')
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    index[folder.relative_to(root).as_posix()] = key
    atomic(index_path, encode(index))
    return key


def catalogue(root):
    items = {}
    base = inside(root, 'applications')
    for p in base.rglob('version.json') if base.exists() else []:
        try:
            rel = p.parent.relative_to(root).as_posix()
            inside(root, rel + '/version.json')
            data = json.loads(p.read_text())
            if isinstance(data.get('files'), dict):
                items[digest(rel.encode())[:24]] = (rel, data)
        except (ValueError, OSError):
            continue
    return items


def rewrite_email(files, mapping=None):
    if 'application.eml' not in files:
        return
    msg = BytesParser(policy=policy.SMTP).parsebytes(files['application.eml'])
    attachments = list(msg.iter_attachments())
    if len(attachments) != 2:
        raise ValueError('Email draft must have exactly two PDF attachments')
    for part, role in zip(attachments, ('resume.pdf', 'cover-letter.pdf')):
        part.clear_content()
        part.set_content(files[role], maintype='application', subtype='pdf')
        part.add_header('Content-Disposition', 'attachment', filename=(mapping or {}).get(role, role))
    files['application.eml'] = msg.as_bytes()


def validate(files, config):
    from pypdf import PdfReader
    from docx import Document
    for role, limit in [('resume', config['resume_pages']), ('cover-letter', config['cover_letter_pages'])]:
        pdf = files.get(role + '.pdf')
        if not pdf:
            raise ValueError('Both CV and cover letter PDFs are required')
        reader = PdfReader(io.BytesIO(pdf), strict=True)
        if not 1 <= len(reader.pages) <= limit or not any(p.extract_text() for p in reader.pages):
            raise ValueError('PDF has no extractable text or exceeds page limit: ' + role)
        if role + '.docx' in files:
            Document(io.BytesIO(files[role + '.docx']))
    rewrite_email(files)


def publish(root, files, job, identity, *, generated_at=None, source='Generated application', uncertain=False):
    config = settings(root)
    city = city_for(job, config)
    generated_at = generated_at or now()
    stamp = datetime.fromisoformat(generated_at)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=time_zone(config['timezone']))
    stamp = stamp.astimezone(time_zone(config['timezone']))
    base = 'applications/' + '/'.join(segment(v) for v in (city, job['employer'], job['title']))
    day = base + '/' + stamp.strftime('%d-%m-%Y')
    path = day if not inside(root, day).exists() else day + '/' + stamp.strftime('%H-%M-%S')
    mapping = {name: filename(name, identity.get('name', 'Applicant'), city) for name in files if name != 'checksums.json'}
    if len(set(mapping.values())) != len(mapping):
        raise ValueError('Document naming collision')
    files = dict(files)
    rewrite_email(files, mapping)
    mapped = {mapping[k]: v for k, v in files.items() if k in mapping}
    if inside(root, path).exists():
        path += '-' + digest(encode({n: digest(b) for n, b in mapped.items()}))[:10]
    dest = inside(root, path)
    if dest.exists():
        raise ValueError('Generation timestamp collision; try again')
    data = {'schema': 2, 'source': source, 'generated_at': generated_at, 'date_uncertain': uncertain,
            'timezone': config['timezone'], 'job': job, 'documents': mapping,
            'files': {n: digest(b) for n, b in mapped.items()}, 'notice': 'Preserved version; presence does not imply submission.'}
    parent = inside(root, base)
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.pending-', dir=parent) as temp:
        staging = Path(temp) / 'version'
        staging.mkdir()
        for name, body in mapped.items():
            inside(staging, name).write_bytes(body)
        (staging / 'version.json').write_bytes(encode(data))
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging.rename(dest)
    manifest_hash = seal(root, dest)
    return {'folder': path, 'documents': mapping, 'manifest_hash': manifest_hash}


def path_for(root, app, role):
    if changed(root, app):
        raise ValueError('Documents changed on disk; validate the edits before opening this version')
    mapping = app.get('documents', {})
    name = mapping.get(role)
    if not name:
        raise ValueError('Document is not available in this version')
    return inside(root, app['folder'] + '/' + name)


def adopt_edits(root, app, job, identity):
    """Validate edits first, publish a new version, then restore verified originals."""
    if not changed(root, app):
        raise ValueError('No external changes found')
    baseline_raw = inside(root, '.recovery/versions/' + app['manifest_hash'] + '.json').read_bytes()
    if digest(baseline_raw) != app['manifest_hash']:
        raise ValueError('Recovery manifest damaged')
    baseline = json.loads(baseline_raw)
    mapping = app['documents']
    folder = inside(root, app['folder'])
    files = {role: inside(folder, name).read_bytes() for role, name in mapping.items() if inside(folder, name).is_file()}
    config = settings(root)
    external_changes = {role for role, name in mapping.items() if digest(files.get(role, b'')) != baseline['files'].get(name)}
    for role in ('resume', 'cover-letter'):
        for ext in ('tex', 'docx'):
            name = mapping.get(role + '.' + ext)
            if name and role + '.' + ext in external_changes:
                if ext == 'docx':
                    pdf_name = mapping.get(role + '.pdf')
                    if not pdf_name or digest(files.get(role + '.pdf', b'')) == baseline['files'].get(pdf_name):
                        raise ValueError('Word source changed. Export its matching PDF into the same folder, then validate again. Automatic Word-to-PDF conversion is unavailable.')
                    files.pop(role + '.tex', None)
                    continue
                from .master import compile_tex
                pdf, plain = compile_tex(files[role + '.tex'].decode(), config[role.replace('-', '_') + '_pages'])
                files[role + '.pdf'], files[role + '.txt'] = pdf, plain.encode()
                if role == 'resume':
                    from .master import word_copy
                    with tempfile.TemporaryDirectory() as tmp:
                        target = Path(tmp) / 'resume.docx'
                        word_copy(files[role + '.tex'].decode(), target)
                        files[role + '.docx'] = target.read_bytes()
                else:
                    files.pop(role + '.docx', None)
    from pypdf import PdfReader
    for role in ('resume', 'cover-letter'):
        pdf_name = mapping.get(role + '.pdf')
        if pdf_name and digest(files[role + '.pdf']) != baseline['files'].get(pdf_name):
            files[role + '.txt'] = '\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(files[role + '.pdf'])).pages).encode()
            for ext in ('tex', 'docx'):
                name = mapping.get(role + '.' + ext)
                if name and role + '.' + ext in files and digest(files[role + '.' + ext]) == baseline['files'].get(name):
                    files.pop(role + '.' + ext)
    validate(files, config)
    # Verify recovery BEFORE writing any result or restoring anything.
    originals = {}
    for name, sha in baseline['files'].items():
        body = inside(root, '.recovery/objects/' + sha).read_bytes()
        if digest(body) != sha:
            raise ValueError('Recovery object damaged')
        originals[name] = body
    result = publish(root, files, job, identity, source='User-edited draft derived from ' + app['folder'])
    for name, body in originals.items():
        atomic(inside(folder, name), body)
    atomic(inside(folder, 'version.json'), baseline_raw)
    return result


def document_map(record):
    if record.get('documents'):
        return record['documents']
    result = {}
    for original, sha in record.get('source_files', {}).items():
        matches = [name for name, value in record['files'].items() if value == sha]
        if len(matches) == 1:
            result[original] = matches[0]
        elif original == 'application.eml':
            names = [name for name in record['files'] if name.endswith('.eml')]
            if len(names) == 1: result[original] = names[0]
    for name in record['files']:
        if name not in result.values(): result[name] = name
    return result
