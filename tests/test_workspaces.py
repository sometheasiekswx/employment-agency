import base64
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
import threading
import urllib.request
import urllib.error
from employment_agency.store import Workspace, restore, digest, encode
from employment_agency.service import Service
from employment_agency.workspaces import configure, inside, selected_workspace, default_workspace
from employment_agency import history, packages, master
from employment_agency.server import server
import test_workflow


class WorkspaceContracts(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def test_named_timezone_works_without_system_timezone_database(self):
        # Windows and minimal containers rely on the packaged IANA database.
        import zoneinfo
        from datetime import datetime
        from employment_agency.workspaces import time_zone
        original = zoneinfo.TZPATH
        try:
            zoneinfo.reset_tzpath(())
            zoneinfo.ZoneInfo.clear_cache()
            city = time_zone('America/New_York')
            self.assertEqual(datetime(2026, 1, 1, tzinfo=city).utcoffset().total_seconds(), -18000)
            self.assertEqual(datetime(2026, 7, 1, tzinfo=city).utcoffset().total_seconds(), -14400)
        finally:
            zoneinfo.reset_tzpath(original)
            zoneinfo.ZoneInfo.clear_cache()

    def test_master_reconciliation_is_local_and_preserves_supplemental(self):
        f, profile, job = self.seed()
        config = configure(self.w.path, {'master': 'master/resume.txt'})
        p = self.w.path / config['master']
        p.parent.mkdir()
        p.write_text('Managed a platform\nImproved delivery')
        self.assertTrue(self.s.state()['_master']['changed'])
        with self.assertRaisesRegex(ValueError, 'Master changed'):
            self.s.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})
        proposal = self.s.action('master-propose', {})
        self.s.action('master-accept', {'sha256': proposal['sha256'], 'confirmed': True})
        self.assertFalse(self.s.state()['_master']['changed'])
        self.assertTrue(next(x for x in self.s.state()['facts'] if x['id'] == f['id'])['confirmed'])
        p.write_text('Managed a larger platform')
        with self.assertRaisesRegex(ValueError, 'changed again'):
            self.s.action('master-accept', {'sha256': proposal['sha256'], 'confirmed': True})
        proposal = self.s.action('master-propose', {})
        self.s.action('master-accept', {'sha256': proposal['sha256'], 'confirmed': True})
        self.assertTrue(any(x['retired'] for x in self.s.state()['facts']))

    def test_master_accept_confirms_only_selected_candidates(self):
        supplemental, profile, job = self.seed()
        app = self.s.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
        submitted = self.w.read()['applications'][0]
        cv = packages.path_for(self.w.path, app, 'resume.pdf')
        original_cv = cv.read_bytes()
        path = self.w.path / 'master/main.txt'
        configure(self.w.path, {'master': 'master/main.txt'})
        path.parent.mkdir()
        path.write_text('Previous master statement')
        proposal = self.s.action('master-propose', {})
        self.s.action('master-accept', {'sha256': proposal['sha256'], 'confirmed': True})
        path = path.with_suffix('.md')
        configure(self.w.path, {'master': 'master/main.md'})
        path.write_text('Morgan Finch\nSoftware Engineer\nBuilt dependable queues.')
        proposal = self.s.action('master-propose', {})
        receipt = {'sha256': proposal['sha256'], 'confirmed': True}
        for invalid in (None, {}, [True], ['2'], [2.0], [-1], [3], [2, 2]):
            with self.subTest(selection=invalid):
                with self.assertRaisesRegex(ValueError, 'candidate'):
                    self.s.action('master-accept', {**receipt, 'selected_candidates': invalid})
        result = self.s.action('master-accept', {**receipt, 'selected_candidates': [2]})
        self.assertEqual(result, {'confirmed': 1})
        state = self.w.read()
        active = [f for f in state['facts'] if f['confirmed']]
        self.assertEqual([f['text'] for f in active], [supplemental['text'], 'Built dependable queues.'])
        self.assertTrue(any(f['text'] == 'Previous master statement' and f['retired'] for f in state['facts']))
        self.assertEqual(active[1]['source']['sha256'], proposal['sha256'])
        self.assertEqual(active[1]['source']['master'], 'master/main.md')
        self.assertEqual(state['identity']['name'], 'Alex Morgan')
        self.assertEqual(state['applications'][0], submitted)
        self.assertEqual(cv.read_bytes(), original_cv)

    def test_master_accept_allows_excluding_a_conflicting_candidate(self):
        fact = self.s.action('fact', {'text': 'Engineer', 'association': 'Example Labs', 'dates': '2022 -- 2024'})
        self.s.action('confirm', {'id': fact['id']})
        path = self.w.path / 'master/main.tex'
        path.parent.mkdir()
        path.write_text(r'\begin{document}' + '\n' +
                        r'\role{Engineer}{2020 -- 2024}{Example Labs}{Toronto}' + '\n' +
                        r'\end{document}')
        proposal = self.s.action('master-propose', {})
        self.assertEqual(proposal['conflicts'][0]['candidate_index'], 0)
        receipt = {'sha256': proposal['sha256'], 'confirmed': True}
        with self.assertRaisesRegex(ValueError, 'conflicting supplementary'):
            self.s.action('master-accept', {**receipt, 'selected_candidates': [0]})
        result = self.s.action('master-accept', {**receipt, 'selected_candidates': []})
        self.assertEqual(result, {'confirmed': 0})
        self.assertEqual([f['id'] for f in self.w.read()['facts'] if f['confirmed']], [fact['id']])
        self.assertFalse(self.s.state()['_master']['changed'])

    def test_external_edit_becomes_new_draft_and_original_is_restored(self):
        f, p, j = self.seed()
        app = self.s.action('local-package', {'job_id': j['id'], 'profile_id': p['id']})
        self.s.action('review', {'id': app['id'], 'status': 'reviewed'})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
        with self.w.edit() as state:
            state['applications'][0].update(archived=True, file_changes=['old alert'])
        submitted = self.w.read()['applications'][0]
        target = packages.path_for(self.w.path, app, 'resume.pdf')
        before = target.read_bytes()
        from reportlab.pdfgen import canvas
        stream = io.BytesIO()
        c = canvas.Canvas(stream); c.drawString(72, 750, 'Alex Morgan - manually revised CV'); c.save()
        target.write_bytes(stream.getvalue())
        self.assertTrue(self.s.state()['applications'][0]['file_changes'])
        with self.assertRaises(ValueError):
            packages.path_for(self.w.path, app, 'resume.pdf')
        revised = self.s.action('adopt-edits', {'id': app['id']})
        self.assertEqual(revised['status'], 'draft')
        for key in ('reviewed_at', 'submitted_at', 'file_changes', 'archived'):
            self.assertNotIn(key, revised)
        self.assertNotEqual(revised['folder'], app['folder'])
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual(self.w.read()['applications'][0], submitted)
        self.assertNotIn('resume.docx', revised['documents'])
        self.assertEqual(packages.changed(self.w.path, revised), [])
        from email.parser import BytesParser
        from email import policy
        msg = BytesParser(policy=policy.default).parsebytes(packages.path_for(self.w.path, revised, 'application.eml').read_bytes())
        for attachment in msg.iter_attachments():
            self.assertEqual(attachment.get_payload(decode=True), (self.w.path / revised['folder'] / attachment.get_filename()).read_bytes())

    def test_bad_edits_do_not_change_original_or_status(self):
        f, p, j = self.seed()
        app = self.s.action('local-package', {'job_id': j['id'], 'profile_id': p['id']})
        path = packages.path_for(self.w.path, app, 'resume.pdf')
        path.write_bytes(b'not a PDF')
        with self.assertRaises(Exception):
            self.s.action('adopt-edits', {'id': app['id']})
        self.assertEqual(len(self.s.state()['applications']), 1)
        self.assertEqual(path.read_bytes(), b'not a PDF')

    def test_permissions_are_local_and_export_contains_master_and_recovery(self):
        f, p, j = self.seed()
        self.s.action('consent', {'provider': 'agent', 'grant': True, 'purpose': 'select_application_facts', 'categories': ['confirmed_facts', 'job_description']})
        self.assertEqual(json.loads((self.w.path / 'state.json').read_text())['consents'], {})
        app = self.s.action('local-package', {'job_id': j['id'], 'profile_id': p['id']})
        (self.w.path / 'master').mkdir()
        (self.w.path / 'master/source.txt').write_text('Personal source')
        (self.w.path / 'personal-notes').mkdir()
        (self.w.path / 'personal-notes/extra.md').write_text('Additional experience')
        configure(self.w.path, {'backup_paths': ['personal-notes']})
        (self.w.path / '.npmrc').write_text('project configuration')
        (self.w.path / 'checksums.json').write_text('{}')
        archive = self.w.export(self.root / 'complete.zip')
        with zipfile.ZipFile(archive) as exported:
            self.assertNotIn('.npmrc', exported.namelist())
            self.assertEqual(exported.namelist().count('checksums.json'), 1)
        dest = self.root / 'copy'
        restore(archive, dest)
        restored = Workspace(dest)
        try:
            self.assertEqual(restored.read()['consents'], {})
            self.assertNotEqual(restored.read()['workspace_id'], self.w.read()['workspace_id'])
            self.assertEqual((dest / 'master/source.txt').read_text(), 'Personal source')
            self.assertEqual((dest / 'personal-notes/extra.md').read_text(), 'Additional experience')
            self.assertEqual(packages.changed(dest, app), [])
        finally:
            restored.close()

    def test_backup_includes_configured_master_and_excludes_nested_machine_settings(self):
        path = self.root / 'alternate'
        nested = path / 'docs' / 'machine'
        with patch.dict(os.environ, {'EA_CONFIG_HOME': str(nested)}):
            workspace = Workspace(path)
        try:
            configure(path, {'master': 'custom-source.txt', 'backup_paths': ['docs/machine']})
            (path / 'custom-source.txt').write_text('Workspace source')
            with workspace.edit() as state:
                state['consents']['agent'] = {'purpose': 'select_application_facts'}
            self.assertTrue(workspace.permissions_path().is_file())
            archive = workspace.export(self.root / 'scoped.zip')
            with zipfile.ZipFile(archive) as exported:
                self.assertEqual(exported.read('custom-source.txt'), b'Workspace source')
                self.assertFalse(any(name.startswith('docs/machine/') for name in exported.namelist()))
        finally:
            workspace.close()

    def test_replacement_at_same_path_requires_its_own_consent(self):
        with self.w.edit() as state:
            state['consents']['agent'] = {'purpose': 'select_application_facts'}
        path = self.w.path
        original_grant_path = self.w.permissions_path()
        self.w.close()
        reopened = Workspace(path, create=False)
        try:
            self.assertIn('agent', reopened.read()['consents'])
        finally:
            reopened.close()
        replacement = Workspace(self.root / 'replacement')
        replacement.close()
        shutil.copyfile(replacement.path / 'state.json', path / 'state.json')
        self.w = Workspace(path, create=False)
        self.assertEqual(self.w.read()['consents'], {})
        self.assertNotEqual(self.w.permissions_path(), original_grant_path)

    def test_legacy_path_only_consent_cannot_authorize_existing_records(self):
        path = self.w.path
        state = self.w.read()
        state.pop('workspace_id')
        self.w.close()
        (path / 'state.json').write_bytes(encode(state))
        legacy = self.root / 'config' / 'permissions' / (digest(str(path).encode()) + '.json')
        legacy.parent.mkdir(parents=True)
        legacy.write_bytes(encode({'agent': {'purpose': 'select_application_facts'}}))
        self.w = Workspace(path, create=False)
        self.assertEqual(self.w.read()['consents'], {})
        self.assertEqual(len(self.w.read()['workspace_id']), 32)

    def test_failed_start_preserves_remembered_folder_and_moved_path_is_not_created(self):
        location = self.root / 'config/location.json'
        location.parent.mkdir()
        location.write_bytes(encode({'path': str(self.w.path)}))
        before = location.read_bytes()
        alternate = Workspace(self.root / 'alternate')
        alternate.close()
        command = [sys.executable, '-m', 'employment_agency']
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            port = str(listener.getsockname()[1])
            failed = subprocess.run([*command, '--workspace', str(alternate.path), 'serve', '--port', port],
                                    capture_output=True, text=True, timeout=10)
        self.assertEqual(failed.returncode, 2)
        self.assertIn('Application not started', failed.stderr)
        self.assertEqual(location.read_bytes(), before)
        self.w.close()
        old = self.w.path
        old.rename(self.root / 'moved')
        failed = subprocess.run([*command, 'state'], capture_output=True, text=True, timeout=10)
        self.assertEqual(failed.returncode, 2)
        self.assertIn('Workspace state is missing', failed.stderr)
        self.assertFalse(old.exists())

    @unittest.skipUnless(shutil.which('git'), 'Git clone recovery')
    def test_git_clone_rebuilds_only_verified_document_recovery(self):
        _, profile, job = self.seed()
        application = self.s.action('local-package', {'job_id': job['id'], 'profile_id': profile['id']})
        original = packages.path_for(self.w.path, application, 'resume.pdf').read_bytes()
        files = {role: packages.path_for(self.w.path, application, role).read_bytes()
                 for role in application['documents']}
        standalone = packages.publish(self.w.path, files, {**job, 'title': 'Historical role'}, self.w.read()['identity'])
        self.w.close()
        root = self.w.path
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        git = ['git', '-C', str(root), '-c', 'core.autocrlf=false']
        subprocess.run([*git, 'add', 'state.json', 'applications'], check=True)
        subprocess.run([*git, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                        'commit', '-qm', 'Fictional workspace'], check=True)
        dest = self.root / 'cloned repo'
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'clone', '-q', str(root), str(dest)], check=True)
        self.assertFalse((dest / '.recovery').exists())
        restored = Workspace(dest, create=False)
        try:
            self.assertEqual(packages.path_for(dest, application, 'resume.pdf').read_bytes(), original)
            for record in (application, standalone):
                key = digest(record['folder'].encode())[:24]
                self.assertEqual(history.verified_file(dest, key, record['documents']['resume.pdf']).read_bytes(), original)
        finally:
            restored.close()
        shutil.rmtree(dest / '.recovery')
        manifest = dest / standalone['folder'] / 'version.json'
        manifest.write_bytes(manifest.read_bytes() + b'\n')
        edited = dest / application['folder'] / application['documents']['resume.pdf']
        edited.write_bytes(original + b'changed')
        restored = Workspace(dest, create=False)
        try:
            self.assertTrue(packages.changed(dest, application))
            with self.assertRaises(ValueError):
                history.verified_file(dest, digest(standalone['folder'].encode())[:24], standalone['documents']['resume.pdf'])
        finally:
            restored.close()

    def test_paths_reject_symlinks_and_traversal(self):
        (self.w.path / 'escape').symlink_to(self.root, target_is_directory=True)
        for path in ('../outside', '/absolute', 'escape/file', 'x\\y'):
            with self.assertRaises(ValueError): inside(self.w.path, path)

    def test_switch_rotates_token_and_rejects_old_tab(self):
        http = server(self.s, 0)
        thread = threading.Thread(target=http.serve_forever, daemon=True); thread.start()
        url = 'http://127.0.0.1:' + str(http.server_port)
        def request(action, data, token):
            req = urllib.request.Request(url + '/api/' + action, data=json.dumps(data).encode(), headers={'Origin': url, 'Content-Type': 'application/json', 'X-Workspace-Token': token})
            return json.load(urllib.request.urlopen(req))
        try:
            initial = json.load(urllib.request.urlopen(url + '/api/state'))
            token = initial['token']
            alternate = self.root / 'second'
            alternate.mkdir()
            (alternate / '.git').mkdir()
            with patch('employment_agency.server.remember', side_effect=OSError('Fixture location failure')):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request('workspace-create', {'path': str(alternate)}, token)
            self.assertEqual(error.exception.code, 400)
            active = json.load(urllib.request.urlopen(url + '/api/state'))
            self.assertEqual(active['state']['_workspace']['path'], initial['state']['_workspace']['path'])
            self.assertEqual(active['token'], token)
            request('identity', {'name': 'Original workspace'}, token)
            request('workspace-open', {'path': str(alternate)}, token)
            self.assertEqual(
                json.loads((self.root / 'config/location.json').read_text())['path'],
                str((self.root / 'second').resolve()),
            )
            with self.assertRaises(urllib.error.HTTPError) as error:
                request('identity', {'name': 'Stale tab'}, token)
            self.assertEqual(error.exception.code, 403)
            current = json.load(urllib.request.urlopen(url + '/api/state'))
            self.assertNotEqual(current['token'], token)
            self.assertEqual(current['state']['identity'], {})
        finally:
            http.shutdown(); http.server_close(); thread.join()

    def test_migration_keeps_ids_comments_and_is_repeatable(self):
        f, p, j = self.seed()
        app = self.s.action('local-package', {'job_id': j['id'], 'profile_id': p['id']})
        self.s.action('review', {'id': app['id'], 'status': 'rejected', 'comment': 'Not suitable'})
        self.w.close()
        # Simulate the earlier runtime's package storage using a synthetic fixture.
        source = self.root / 'legacy'
        runtime = source / '.local/general-system/workspace'
        runtime.mkdir(parents=True)
        state = json.loads((self.w.path / 'state.json').read_text())
        state['schema'] = 1
        package = runtime / 'packages' / app['id']; package.mkdir(parents=True)
        for role, name in app['documents'].items():
            (package / role).write_bytes((self.w.path / app['folder'] / name).read_bytes())
        for a in state['applications']:
            for key in ('folder','documents','manifest_hash'): a.pop(key)
        (runtime / 'state.json').write_text(json.dumps(state))
        from employment_agency.migrate import migrate
        target = self.root / 'migrated'
        first = migrate(source, target)
        second = migrate(source, target)
        self.assertEqual(first, second)
        restored = Workspace(target)
        try:
            actual = restored.read()['applications'][0]
            self.assertEqual(actual['id'], app['id'])
            self.assertEqual(actual['status'], 'rejected')
            self.assertEqual(actual['comments'][0]['text'], 'Not suitable')
            self.assertEqual(packages.changed(target, actual), [])
        finally:
            restored.close()

    def test_source_root_cannot_be_a_personal_workspace(self):
        target = self.root / 'software'; target.mkdir()
        (target / 'pyproject.toml').write_text('[project]\nname = "employment-agency-local"\n')
        with self.assertRaisesRegex(ValueError, 'workspace/'):
            Workspace(target)
        self.assertFalse((target / 'state.json').exists())

    def test_migration_rejects_running_source(self):
        from employment_agency.migrate import migrate
        with self.assertRaisesRegex(ValueError, 'Stop the application'):
            migrate(self.w.path, self.root / 'locked-copy')

    def test_master_parser_retains_bold_skills_and_education(self):
        source = r'''\documentclass{article}
\begin{document}
\section{Profile}
An experienced engineer.
\section{Professional Experience}
\role{Engineer}{2021 -- 2025}{Example Labs}{Toronto}
\begin{itemize}
\item Built reliable systems.
\end{itemize}
\section{Key Skills}
\textbf{Technical:} Python, PostgreSQL, [add relevant skills]\\
\section{Education}
\textbf{Bachelor of Computing}\hfill 2017 -- 2021
\end{document}
'''
        facts = master.candidates('master/main.tex', source.encode())
        self.assertTrue(any(f['category']=='education' and 'Bachelor' in f['text'] for f in facts))
        self.assertTrue(any(f['category']=='skills' and 'PostgreSQL' in f['text'] for f in facts))
        self.assertEqual(next(f for f in facts if 'reliable' in f['text'])['association'], 'Example Labs')
        self.assertFalse(any('[add relevant skills]' in f['text'] for f in facts))

    def test_master_conflicting_supplementary_dates_require_resolution(self):
        f=self.s.action('fact',{'text':'Engineer','association':'Example Labs','dates':'2022 -- 2024'})
        self.s.action('confirm',{'id':f['id']})
        p=self.w.path/'master/main.tex';p.parent.mkdir()
        p.write_text(r'\begin{document}'+'\n'+r'\role{Engineer}{2020 -- 2024}{Example Labs}{Toronto}'+'\n'+r'\end{document}')
        proposal=self.s.action('master-propose',{})
        self.assertEqual(proposal['conflicts'][0]['fact_id'],f['id'])
        with self.assertRaisesRegex(ValueError,'conflicting supplementary'):
            self.s.action('master-accept',{'sha256':proposal['sha256'],'confirmed':True})
        self.s.action('retire',{'id':f['id']})
        self.s.action('master-accept',{'sha256':proposal['sha256'],'confirmed':True})

    def test_historical_file_edits_can_be_validated_without_active_card(self):
        f, p, j = self.seed()
        app=self.s.action('local-package',{'job_id':j['id'],'profile_id':p['id']})
        pdf=packages.path_for(self.w.path,app,'resume.pdf'); original=pdf.read_bytes()
        with self.w.edit() as state: state['applications']=[]
        pdf.write_bytes(original+b'\n% edited\n')
        key=digest(app['folder'].encode())[:24]
        revised=self.s.action('history-adopt',{'id':key})
        self.assertEqual(revised['status'],'draft')
        self.assertEqual(pdf.read_bytes(),original)
        self.assertEqual(len(self.s.state()['applications']),1)
