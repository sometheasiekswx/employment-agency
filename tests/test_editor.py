import base64
import email
import io
import unittest
from pypdf import PdfReader
from employment_agency import packages
import test_workflow

class Editor(unittest.TestCase):
    setUp = test_workflow.Workflow.setUp
    tearDown = test_workflow.Workflow.tearDown
    seed = test_workflow.Workflow.seed

    def package(self):
        _, profile, job = self.seed()
        return self.s.action('local-package', {'job_id':job['id'], 'profile_id':profile['id']})

    def test_preview_and_save_preserve_submitted_and_rebuild_attachments(self):
        app = self.package()
        self.s.action('review', {'id':app['id'], 'status':'submitted'})
        before = self.w.read()
        original = packages.path_for(self.w.path, app, 'resume.pdf').read_bytes()
        for stem in ('resume', 'cover-letter'):
            edit = self.s.action('document-editor', {'id':app['id'], 'document':stem})
            edit['blocks'].append(['text','Additional carefully reviewed wording.'])
            preview = self.s.action('preview-document', edit)
            self.assertIn('Additional carefully reviewed wording.', PdfReader(io.BytesIO(base64.b64decode(preview['pdf']))).pages[0].extract_text())
            self.assertEqual(self.w.read(), before)
            revised = self.s.action('save-document', edit)
            self.assertEqual(revised['status'], 'draft')
            self.assertNotEqual(app['folder'], revised['folder'])
            self.assertFalse(packages.changed(self.w.path, revised))
            message = email.message_from_bytes(packages.path_for(self.w.path,revised,'application.eml').read_bytes())
            attached = [p.get_payload(decode=True) for p in message.walk() if p.get_content_type()=='application/pdf']
            self.assertEqual(attached, [packages.path_for(self.w.path,revised,n).read_bytes() for n in ('resume.pdf','cover-letter.pdf')])
            before = self.w.read()
        self.assertEqual(self.w.read()['applications'][0]['status'], 'submitted')
        self.assertEqual(original, packages.path_for(self.w.path,app,'resume.pdf').read_bytes())

    def test_invalid_and_stale_inputs_do_not_save(self):
        app = self.package()
        edit = self.s.action('document-editor', {'id':app['id'],'document':'resume'})
        before = self.w.read()
        for values in ({'base':'wrong'}, {'blocks':[]}, {'blocks':[['text','']]}, {'blocks':[['text','x'*4001]]}):
            with self.assertRaises(ValueError): self.s.action('save-document', {**edit,**values})
        self.assertEqual(before,self.w.read())
        packages.path_for(self.w.path,app,'resume.txt').write_text('Changed externally')
        with self.assertRaisesRegex(ValueError,'Files changed'): self.s.action('save-document',edit)

    def test_hosted_editor_reads_do_not_commit_and_other_owner_cannot_edit(self):
        from test_cloud import Backend, OWNER, OTHER
        from employment_agency.cloud import execute
        app = self.package()
        archive = self.root / 'cloud.zip'
        self.w.export(archive)
        backend = Backend(); backend.commit(OWNER, 0, archive.read_bytes())
        edit = execute(backend, OWNER, 'document-editor', {'id':app['id'], 'document':'resume'})['result']
        self.assertEqual(edit['mode'], 'blocks')
        execute(backend, OWNER, 'preview-document', edit)
        self.assertEqual(backend.record(OWNER)['revision'], 1)
        with self.assertRaisesRegex(ValueError, 'not found'):
            execute(backend, OTHER, 'document-editor', {'id':app['id'], 'document':'resume'})
        edited = execute(backend, OWNER, 'save-document', edit)['result']
        self.assertEqual(edited['status'], 'draft')
        self.assertEqual(backend.record(OWNER)['revision'], 2)
