import base64
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import threading
import urllib.request
import urllib.error
from employment_agency.store import Workspace, restore, digest
from employment_agency.service import Service
from employment_agency.workspaces import configure, inside, selected_workspace, default_workspace
from employment_agency import packages, master
from employment_agency.server import server
import test_workflow


class WorkspaceContracts(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed
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

    def test_external_edit_becomes_new_draft_and_original_is_restored(self):
        f, p, j = self.seed()
        app = self.s.action('local-package', {'job_id': j['id'], 'profile_id': p['id']})
        self.s.action('review', {'id': app['id'], 'status': 'reviewed'})
        self.s.action('review', {'id': app['id'], 'status': 'submitted'})
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
        self.assertNotEqual(revised['folder'], app['folder'])
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual(self.s.state()['applications'][0]['status'], 'submitted')
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
        archive = self.w.export(self.root / 'complete.zip')
        dest = self.root / 'copy'
        restore(archive, dest)
        restored = Workspace(dest)
        try:
            self.assertEqual(restored.read()['consents'], {})
            self.assertEqual((dest / 'master/source.txt').read_text(), 'Personal source')
            self.assertEqual((dest / 'personal-notes/extra.md').read_text(), 'Additional experience')
            self.assertEqual(packages.changed(dest, app), [])
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
            token = json.load(urllib.request.urlopen(url + '/api/state'))['token']
            request('workspace-create', {'path': str(self.root / 'second')}, token)
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
