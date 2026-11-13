"""SQLite workspace records and their readable, recoverable Git snapshots."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import sqlite3

from .store import atomic, digest
from .workspaces import inside

DATABASE = 'workspace.sqlite3'
SNAPSHOT_SCHEMA = 3
STORAGE = 'sqlite'
DATABASE_VERSION = 3
MANIFEST = 'state.json'
SNAPSHOT_FOLDER = 'state'
IGNORE = '/workspace.sqlite3*'


def ensure_git_rules(root):
    rules = {
        '.gitignore': [IGNORE],
        '.gitattributes': ['state.json text eol=lf', 'state/**/*.json text eol=lf'],
    }
    for name, lines in rules.items():
        path = inside(root, name)
        original = path.read_bytes() if path.exists() else b''
        missing = [line.encode() for line in lines if line.encode() not in original.splitlines()]
        if missing:
            separator = b'\n' if original and not original.endswith(b'\n') else b''
            atomic(path, original + separator + b'\n'.join(missing) + b'\n')


METADATA = 'state/workspace.json'
COMMENTS = 'application-comments'
EVIDENCE = 'requirement-evidence'
INTERNAL_SECTIONS = (COMMENTS, EVIDENCE)


def serialized(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode('utf-8')


def is_sqlite(value):
    return isinstance(value, dict) and value.get('schema') == SNAPSHOT_SCHEMA and value.get('storage') == STORAGE


def segment(value):
    if re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,89}', value) and not re.fullmatch(
        r'con|prn|aux|nul|com[1-9]|lpt[1-9]', value
    ):
        return value
    return '_' + digest(value.encode('utf-8'))


def section_folder(name):
    return 'application-versions' if name == 'applications' else segment(name)


def related_records(files, name, item, parent_path):
    if not isinstance(item, dict) or not isinstance(item.get('id'), str):
        return item
    key = Path(parent_path).stem
    if name == 'applications' and isinstance(item.get('comments'), list):
        for index, comment in enumerate(item['comments']):
            path = f'state/{COMMENTS}/{key}.{index}.json'
            files[path] = (COMMENTS, index, serialized({
                'order': index, 'record': comment, 'application_id': item['id'],
            }))
        return {**item, 'comments': []}
    if name == 'jobs' and isinstance(item.get('requirement_evidence'), dict):
        for requirement, evidence in item['requirement_evidence'].items():
            path = f'state/{EVIDENCE}/{key}.{digest(requirement.encode("utf-8"))}.json'
            files[path] = (EVIDENCE, 0, serialized({
                'job_id': item['id'], 'requirement': requirement, 'record': evidence,
            }))
        return {**item, 'requirement_evidence': {}}
    return item


def records(state, existing):
    metadata = {}
    files = {}
    sections = []
    for name, value in state.items():
        if name == 'consents':
            continue
        if not isinstance(value, list):
            metadata[name] = value
            continue
        sections.append(name)
        seen = set()
        entries = []
        for item in value:
            identifier = item.get('id') if isinstance(item, dict) else None
            if not isinstance(identifier, str) or not identifier:
                identifier = '_' + digest(serialized(item))
            base = 'state/' + section_folder(name) + '/' + segment(identifier)
            path = base + '.json'
            occurrence = 0
            while path in seen:
                occurrence += 1
                path = f'{base}.{occurrence}.json'
            seen.add(path)
            entries.append((path, item))
        ordered = [existing.get(path, -1) for path, _ in entries]
        retained = [position for position in ordered if position >= 0]
        appended = all(position >= 0 for position in ordered[:len(retained)])
        preserve_order = appended and retained == sorted(retained)
        last = max(retained, default=-1)
        for index, (path, item) in enumerate(entries):
            position = ordered[index] if preserve_order and index < len(retained) else index
            if preserve_order and index >= len(retained):
                position = last + index - len(retained) + 1
            item = related_records(files, name, item, path)
            files[path] = (name, position, serialized({'order': position, 'record': item}))
    files[METADATA] = ('', 0, serialized({'fields': metadata, 'sections': sorted(sections)}))
    return files


def assemble(rows):
    values = {}
    groups = {}
    comments = {}
    evidence = {}
    for name, body in rows:
        record = json.loads(body)
        if name == '':
            values.update(record['fields'])
            for section in record['sections']:
                groups.setdefault(section, [])
        elif name == COMMENTS:
            comments.setdefault(record['application_id'], []).append((record['order'], record['record']))
        elif name == EVIDENCE:
            evidence.setdefault(record['job_id'], {})[record['requirement']] = record['record']
        else:
            groups.setdefault(name, []).append((record['order'], record['record']))
    for name, items in groups.items():
        values[name] = [value for _, value in sorted(items, key=lambda pair: pair[0])]
    for app in values.get('applications', []):
        if app['id'] in comments:
            app['comments'] = [value for _, value in sorted(comments[app['id']], key=lambda pair: pair[0])]
    for job in values.get('jobs', []):
        if job['id'] in evidence:
            job['requirement_evidence'] = evidence[job['id']]
    values['consents'] = {}
    return values


def snapshot_digest(hashes):
    return digest(serialized(sorted(hashes.items())))


def record_paths(root):
    directory = inside(root, SNAPSHOT_FOLDER)
    if not directory.exists():
        return []
    if not directory.is_dir():
        raise ValueError('The Git snapshot directory is invalid')
    paths = []
    for candidate in directory.rglob('*'):
        relative = candidate.relative_to(root).as_posix()
        path = inside(root, relative)
        if path.is_dir():
            continue
        if not path.is_file() or path.suffix != '.json':
            raise ValueError('Unexpected file in the Git snapshot directory')
        paths.append(relative)
    return paths


def read_snapshot(root):
    """Restore a verified snapshot without trusting the live database or host permissions."""
    root = Path(root).resolve()
    manifest = json.loads(inside(root, MANIFEST).read_bytes())
    if not is_sqlite(manifest):
        raise ValueError('Unsupported Git snapshot format')
    hashes = {}
    rows = []
    for name in record_paths(root):
        data = inside(root, name).read_bytes()
        hashes[name] = digest(data)
        if name == METADATA:
            rows.append(('', data))
        else:
            parts = Path(name).parts
            if len(parts) != 3:
                raise ValueError('Invalid Git snapshot record path')
            rows.append((parts[1], data))
    if METADATA not in hashes or snapshot_digest(hashes) != manifest.get('sha256'):
        raise ValueError('Git snapshot is incomplete or has changed')
    metadata = json.loads(next(body for name, body in rows if not name))
    sections = {section_folder(name): name for name in metadata['sections']}
    sections.update({name: name for name in INTERNAL_SECTIONS})
    if 'applications' in metadata['sections']:
        sections['applications'] = 'applications'
    if any(name and name not in sections for name, _ in rows):
        raise ValueError('Unknown Git snapshot record section')
    state = assemble((sections.get(name, ''), body) for name, body in rows)
    if state.get('workspace_id') != manifest.get('workspace_id') or state.get('schema') != 2:
        raise ValueError('Git snapshot identity is invalid')
    return state


class SQLiteState:
    def __init__(self, root, *, create=False):
        self.root = root
        self.path = inside(root, DATABASE)
        if create:
            # Reserve the database with the same permissions as saved workspace files.
            os.close(os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
        try:
            self.connection = sqlite3.connect(
                f'{self.path.as_uri()}?mode=rw', uri=True,
                isolation_level=None, timeout=5, check_same_thread=False,
            )
        except sqlite3.Error as exc:
            raise ValueError('Workspace database is unavailable. Restore a verified backup or Git snapshot.') from exc
        self.status = 'pending'
        try:
            self.connection.execute('PRAGMA foreign_keys = ON')
            version = self.connection.execute('PRAGMA user_version').fetchone()[0]
            if create and version == 0:
                self.connection.executescript("""
                    BEGIN IMMEDIATE;
                    CREATE TABLE records (
                        path TEXT PRIMARY KEY, section TEXT NOT NULL,
                        position INTEGER NOT NULL, body BLOB NOT NULL
                    );
                    CREATE INDEX records_section ON records(section, position);
                    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                    CREATE TABLE snapshot_files (
                        path TEXT PRIMARY KEY, before_hash TEXT, after_hash TEXT
                    );
                    INSERT INTO metadata VALUES ('revision', '0'), ('published', '-1');
                    PRAGMA user_version = 1;
                    COMMIT;
                """)
                version = 1
            if version == 1:
                self.migrate_queue()
                version = 2
            if version == 2:
                with self.transaction():
                    if self.connection.execute('SELECT 1 FROM records LIMIT 1').fetchone():
                        self.save(self.read())
                    self.connection.execute('PRAGMA user_version = 3')
                version = 3
            if version != DATABASE_VERSION:
                raise ValueError('Unsupported workspace database version. Open a compatible build.')
            if self.connection.execute('PRAGMA quick_check').fetchone() != ('ok',):
                raise ValueError('Workspace database failed its integrity check. Restore a verified backup.')
        except (sqlite3.Error, ValueError) as exc:
            self.close()
            if isinstance(exc, ValueError):
                raise
            raise ValueError('Workspace database could not be read. Restore a verified backup.') from exc

    def migrate_queue(self):
        with self.transaction():
            self.connection.execute("""
                CREATE TABLE application_queue (
                    role_id TEXT PRIMARY KEY, application_id TEXT, stage TEXT NOT NULL,
                    archived INTEGER NOT NULL, decided_at REAL, saved INTEGER NOT NULL
                )
            """)
            self.connection.execute(
                'CREATE INDEX application_queue_stage ON application_queue(stage, decided_at DESC, role_id)'
            )
            self.connection.execute(
                'CREATE INDEX application_queue_saved ON application_queue(saved, decided_at DESC, role_id)'
            )
            if self.connection.execute('SELECT 1 FROM records LIMIT 1').fetchone():
                self.save_queue(self.read())
            self.connection.execute('PRAGMA user_version = 2')

    def save_queue(self, state):
        from .application_queue import project
        previous = {
            row[0]: row for row in self.connection.execute(
                'SELECT role_id, application_id, stage, archived, decided_at, saved FROM application_queue'
            )
        }
        current = {row[0]: row for row in project(state)}
        self.connection.executemany(
            'DELETE FROM application_queue WHERE role_id = ?',
            [(key,) for key in previous.keys() - current.keys()],
        )
        self.connection.executemany(
            'INSERT OR REPLACE INTO application_queue VALUES (?, ?, ?, ?, ?, ?)',
            [row for key, row in current.items() if previous.get(key) != row],
        )

    def queue_page(self, *, stage=None, historical=False, limit=None, offset=0):
        query = 'SELECT role_id, application_id, stage, archived FROM application_queue'
        filters, params = [], []
        if stage == 'saved':
            filters.append('saved = 1')
        elif stage:
            filters.append('stage = ?')
            params.append(stage)
        if not historical and stage not in ('saved', 'removed'):
            filters.append("(NOT archived OR stage IN ('removed', 'saved'))")
        if filters:
            query += ' WHERE ' + ' AND '.join(filters)
        query += ' ORDER BY decided_at DESC, role_id'
        if limit is not None:
            query += ' LIMIT ? OFFSET ?'
            params.extend((limit + 1, offset))
        rows = [{'job_id': row[0], 'application_id': row[1],
                 'stage': 'saved' if stage == 'saved' else row[2], 'archived': bool(row[3])}
                for row in self.connection.execute(query, params)]
        more = limit is not None and len(rows) > limit
        return {'rows': rows[:limit] if more else rows, 'next_offset': offset + limit if more else None}

    def close(self):
        self.connection.close()

    @contextmanager
    def transaction(self):
        try:
            self.connection.execute('BEGIN IMMEDIATE')
            try:
                yield
                self.connection.commit()
            except BaseException:
                self.connection.rollback()
                raise
        except sqlite3.Error as exc:
            raise ValueError('Workspace database change could not be saved. Check available space and retry.') from exc

    def meta(self, key):
        row = self.connection.execute('SELECT value FROM metadata WHERE key = ?', (key,)).fetchone()
        return row[0] if row else None

    def set_meta(self, key, value):
        self.connection.execute(
            'INSERT INTO metadata VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            (key, str(value)),
        )

    def read(self):
        return assemble(self.connection.execute('SELECT section, body FROM records ORDER BY section, position'))

    def collection(self, name):
        return [
            json.loads(row[0])['record'] for row in self.connection.execute(
                'SELECT body FROM records WHERE section = ? ORDER BY position', (name,)
            )
        ]

    def save(self, state):
        previous = {
            path: (section, position, body)
            for path, section, position, body in self.connection.execute(
                'SELECT path, section, position, body FROM records'
            )
        }
        updated = records(state, {path: value[1] for path, value in previous.items()})
        deleted = previous.keys() - updated.keys()
        changed = [(path, *value) for path, value in updated.items() if previous.get(path) != value]
        if not deleted and not changed:
            return
        self.connection.executemany('DELETE FROM records WHERE path = ?', [(path,) for path in deleted])
        self.connection.executemany(
            'INSERT OR REPLACE INTO records(path, section, position, body) VALUES (?, ?, ?, ?)', changed
        )
        relevant = {'jobs', 'applications', COMMENTS, 'submission_attempts', ''}
        if any(section in relevant for _, section, _, _ in changed) or any(
            previous[path][0] in relevant for path in deleted
        ):
            self.save_queue(state)
        self.set_meta('revision', int(self.meta('revision')) + 1)

    def initialize(self, state):
        with self.transaction():
            self.save(state)
        self.publish(verify=True)
        if self.status != 'current':
            raise ValueError('Could not publish the initial Git snapshot. Check the workspace files.')

    def publish(self, *, verify=False):
        revision = self.meta('revision')
        if not verify and revision == self.meta('published') and self.status == 'current':
            return
        bodies = dict(self.connection.execute('SELECT path, body FROM records'))
        desired = {path: digest(body) for path, body in bodies.items()}
        state = json.loads(bodies[METADATA])['fields']
        bodies[MANIFEST] = serialized({
            'schema': SNAPSHOT_SCHEMA, 'storage': STORAGE, 'workspace_id': state['workspace_id'],
            'revision': int(revision), 'sha256': snapshot_digest(desired),
        })
        desired[MANIFEST] = digest(bodies[MANIFEST])
        expected = {
            path: (before, after)
            for path, before, after in self.connection.execute(
                'SELECT path, before_hash, after_hash FROM snapshot_files'
            )
        }
        try:
            actual = {}
            for path in [*record_paths(self.root), MANIFEST]:
                filename = inside(self.root, path)
                if filename.exists():
                    actual[path] = digest(filename.read_bytes())
            for path in set(actual) | set(expected):
                if actual.get(path) not in expected.get(path, (None, None)):
                    self.status = 'conflict'
                    return
            changed = [path for path in set(actual) | set(desired) if actual.get(path) != desired.get(path)]
            changed.sort(key=lambda path: (path == MANIFEST, path))
            with self.transaction():
                self.connection.executemany(
                    'INSERT OR REPLACE INTO snapshot_files VALUES (?, ?, ?)',
                    [(path, actual.get(path), desired.get(path))
                     for path in set(actual) | set(desired)
                     if expected.get(path) != (actual.get(path), desired.get(path))],
                )
            for path in changed:
                filename = inside(self.root, path)
                if path in bodies:
                    atomic(filename, bodies[path], staging=inside(self.root, '.runtime/snapshot'))
                else:
                    filename.unlink()
            with self.transaction():
                self.connection.execute('DELETE FROM snapshot_files WHERE after_hash IS NULL')
                self.connection.execute('UPDATE snapshot_files SET before_hash = after_hash WHERE before_hash IS NOT after_hash')
                self.set_meta('published', revision)
            self.status = 'current'
        except (OSError, ValueError):
            self.status = 'pending'

    def summary(self):
        return {'status': self.status, 'revision': int(self.meta('revision')),
                'published_revision': int(self.meta('published'))}
