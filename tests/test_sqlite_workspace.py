"""Exercise the live database and both portable recovery paths with fictional records."""

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import unittest
from unittest.mock import patch

from employment_agency import packages, store
from employment_agency.service import Service
from employment_agency.sqlite_workspace import DATABASE, read_snapshot
import test_workflow


class SQLiteWorkspace(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def convert(self):
        source = self.w.path
        before = self.w.read()
        original = (source / 'state.json').read_bytes()
        self.w.close()
        destination = self.root / 'sqlite'
        store.migrate_sqlite(source, destination)
        self.assertEqual((source / 'state.json').read_bytes(), original)
        self.w = store.Workspace(destination, create=False)
        self.s = Service(self.w)
        expected = {**before, 'workspace_id': self.w.workspace_id, 'submission_attempts': [], 'consents': {}}
        self.assertEqual(self.w.read(), expected)
        self.assertEqual(read_snapshot(destination), expected)

    def test_migration_preserves_document_hash_and_effective_history(self):
        _, profile, job = self.seed()
        app = self.s.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
        digest = store.digest(packages.path_for(self.w.path, app, 'resume.pdf').read_bytes())
        self.convert()
        self.assertEqual(self.s.state()['jobs'][0]['prior_application'], 'submitted')
        self.assertEqual(store.digest(packages.path_for(self.w.path, app, 'resume.pdf').read_bytes()), digest)

    def test_archive_and_git_snapshot_restore_into_isolated_folders(self):
        self.seed()
        self.convert()
        self.s.action('save-job', {'id': self.w.read()['jobs'][0]['id'], 'saved': True})
        with self.w.edit() as state:
            state['consents']['agent'] = {'purpose': 'select_application_facts'}
        backup = self.w.export(self.root / 'sqlite.zip')
        if os.name != 'nt':
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((self.w.path / DATABASE).stat().st_mode), 0o600)
        git = self.root / 'clone'
        shutil.copytree(self.w.path / 'state', git / 'state')
        shutil.copyfile(self.w.path / 'state.json', git / 'state.json')
        for kind, restore, source in (
            ('archive', store.restore, backup), ('snapshot', store.restore_snapshot, git)
        ):
            with self.subTest(kind=kind):
                path = self.root / kind
                restore(source, path)
                copy = store.Workspace(path, create=False)
                try:
                    self.assertTrue(copy.read()['jobs'][0]['saved'])
                    self.assertNotEqual(copy.workspace_id, self.w.workspace_id)
                    self.assertEqual(copy.read()['consents'], {})
                finally:
                    copy.close()
        with self.assertRaisesRegex(ValueError, 'database is missing'):
            store.Workspace(git, create=False)

    def test_small_snapshot_update_and_repair_after_interruption(self):
        self.seed()
        self.s.action('job', {'title': 'Second role', 'description': 'Fictional vacancy', 'employer': 'Example'})
        self.convert()
        path = self.w.path
        files = lambda: {f.relative_to(path): f.read_bytes() for f in path.glob('state/**/*.json')}
        original = files()
        id = self.w.read()['jobs'][0]['id']
        with patch('employment_agency.sqlite_workspace.atomic', side_effect=OSError('disk full')):
            self.s.action('save-job', {'id': id, 'saved': True})
        self.assertTrue(self.w.read()['jobs'][0]['saved'])
        self.assertEqual(self.w.database.summary()['status'], 'pending')
        self.w.close()
        self.w = store.Workspace(path, create=False)
        self.assertEqual(self.w.database.summary()['status'], 'current')
        self.assertEqual([f.as_posix() for f, body in files().items() if original[f] != body],
                         [f'state/jobs/{id}.json'])
        self.assertTrue(read_snapshot(path)['jobs'][0]['saved'])

    def test_external_git_edit_is_preserved_and_cannot_restore(self):
        self.seed()
        self.convert()
        job = self.w.read()['jobs'][0]
        path = self.w.path / 'state' / 'jobs' / (job['id'] + '.json')
        path.write_bytes(path.read_bytes() + b' ')
        changed = path.read_bytes()
        self.s.action('save-job', {'id': job['id'], 'saved': True})
        self.assertEqual(path.read_bytes(), changed)
        self.assertEqual(self.w.database.summary()['status'], 'conflict')
        with self.assertRaisesRegex(ValueError, 'incomplete or has changed'):
            store.restore_snapshot(self.w.path, self.root / 'failed')

    @unittest.skipUnless(shutil.which('git'), 'Git clone recovery')
    def test_git_clone_with_line_ending_conversion_restores_and_excludes_database(self):
        self.seed()
        self.convert()
        path = self.w.path
        subprocess.run(['git', 'init', '-q', str(path)], check=True)
        git = ['git', '-C', str(path)]
        subprocess.run([*git, 'add', '.gitignore', '.gitattributes', 'state.json', 'state'], check=True)
        subprocess.run([*git, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                        'commit', '-qm', 'Fictional workspace snapshot'], check=True)
        clone = self.root / 'git-clone'
        subprocess.run(['git', '-c', 'core.autocrlf=true', 'clone', '-q', str(path), str(clone)], check=True)
        self.assertFalse((clone / DATABASE).exists())
        destination = self.root / 'clone-restored'
        store.restore_snapshot(clone, destination)
        with self.assertRaisesRegex(ValueError, 'already open'):
            store.Workspace(path, create=False)
        restored = store.Workspace(destination)
        try:
            self.assertEqual(restored.read()['jobs'], self.w.read()['jobs'])
        finally:
            restored.close()

    def test_interrupted_conversion_leaves_original_usable_and_no_destination(self):
        self.seed()
        source = self.w.path
        expected = self.w.read()
        self.w.close()
        destination = self.root / 'incomplete'
        with patch('employment_agency.sqlite_workspace.atomic', side_effect=OSError('disk full')):
            with self.assertRaisesRegex(ValueError, 'initial Git snapshot'):
                store.migrate_sqlite(source, destination)
        self.assertFalse(destination.exists())
        self.w = store.Workspace(source, create=False)
        self.assertEqual(self.w.read(), expected)

    def test_cli_initializes_sqlite_and_detects_missing_database(self):
        path = self.root / 'fresh'
        cmd = [sys.executable, '-m', 'employment_agency', '--workspace', str(path)]
        subprocess.run([*cmd, 'init'], check=True, capture_output=True)
        state = json.loads(subprocess.check_output([*cmd, 'state']))
        self.assertEqual(state['jobs'], [])
        self.assertTrue((path / DATABASE).is_file())
        self.assertIn('/workspace.sqlite3*', (path / '.gitignore').read_text())
        (path / DATABASE).unlink()
        result = subprocess.run([*cmd, 'state'], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn(b'database is missing', result.stderr)
