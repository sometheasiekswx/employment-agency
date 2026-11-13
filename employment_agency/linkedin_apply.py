"""Experimental visible Easy Apply adapter. Final click is a separate operation."""
import re
from urllib.parse import urlsplit
from .workspaces import config_home
from .store import digest


class NeedsUser(Exception):
    pass


def linkedin_url(value):
    p = urlsplit(value)
    if p.scheme != 'https' or p.hostname not in ('www.linkedin.com', 'linkedin.com') or p.port not in (None, 443) or p.username or p.password:
        raise ValueError('Choose a LinkedIn job URL using HTTPS')
    match = re.fullmatch(r'/jobs/view/(\d+)/?', p.path)
    if not match:
        raise ValueError('Use the exact LinkedIn /jobs/view/JOB_ID listing URL')
    return 'https://www.linkedin.com/jobs/view/' + match[1] + '/'


class LinkedIn:
    def __init__(self):
        self.engine = self.context = self.page = None
        self.target = None
        self.uploaded = {}
        self.cancelled = lambda: False

    def open(self, url):
        from playwright.sync_api import sync_playwright
        self.target = linkedin_url(url)
        if self.page is None:
            self.engine = sync_playwright().start()
            directory = config_home() / 'apply/browser'
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            directory.chmod(0o700)
            self.context = self.engine.chromium.launch_persistent_context(str(directory), channel='chrome', headless=False)
            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        self.page.goto(self.target, wait_until='domcontentloaded', timeout=30000)

    def guard(self):
        if self.cancelled():
            raise NeedsUser('Cancelled before submission')
        try:
            current = linkedin_url(self.page.url)
        except ValueError:
            current = None
        if current != self.target:
            raise NeedsUser('Sign in/complete verification, then return to the exact job listing and choose Resume')
        if self.page.locator('iframe[src*="captcha"], input[name="pin"], input[name="verificationCode"]').count():
            raise NeedsUser('Complete verification in the visible browser, then choose Resume')

    def dialog(self):
        dialogs = self.page.get_by_role('dialog').filter(has=self.page.get_by_role('button', name=re.compile('Submit application', re.I)))
        if dialogs.count() == 1:
            return dialogs
        dialogs = self.page.get_by_role('dialog')
        if dialogs.count() != 1:
            raise NeedsUser('Open Easy Apply for this job in the visible browser, then choose Resume')
        return dialogs

    def prepare(self, payload, resume, cover=None):
        self.guard()
        if not self.page.get_by_role('dialog').count():
            button = self.page.get_by_role('button', name=re.compile(r'Easy Apply', re.I))
            if button.count() != 1:
                raise NeedsUser('This listing has no unambiguous Easy Apply form; use the browser to inspect it')
            button.click()
        for _ in range(12):
            self.guard()
            dialog = self.dialog()
            # Fill only exact contact labels; never infer legal/sensitive answers.
            for label, value in payload['contact'].items():
                field = dialog.get_by_label(label, exact=True)
                if value and field.count() == 1 and field.first.get_attribute('type') != 'file':
                    field.fill(value)
            uploads = dialog.locator('input[type=file]')
            for index in range(uploads.count()):
                upload = uploads.nth(index)
                label = upload.evaluate("e => Array.from(e.labels || []).map(l => l.innerText).join(' ') || e.getAttribute('aria-label') || ''")
                if re.search(r'cover\s*letter', label, re.I):
                    kind, document = 'cover', cover
                elif re.search(r'r[eé]sum[eé]|\bcv\b', label, re.I) or uploads.count() == 1 and cover is None:
                    kind, document = 'resume', resume
                else:
                    raise NeedsUser('Cannot identify this document upload. Inspect the form before continuing')
                if document is None:
                    raise NeedsUser('A custom cover letter is required before preparing this form')
                upload.set_input_files(str(document))
                expected_hash = digest(document.read_bytes())
                if self.file_hashes(upload) != [expected_hash]:
                    raise NeedsUser('The browser did not select the exact custom document bytes')
                self.uploaded[kind] = (document.name, expected_hash)
            missing = dialog.locator('input:invalid, textarea:invalid, select:invalid')
            if missing.count():
                raise NeedsUser('Complete required answers and consents in the browser, then choose Resume; never guess work rights')
            submit = dialog.get_by_role('button', name=re.compile(r'^Submit application$', re.I))
            if submit.count() == 1:
                if not submit.is_enabled():
                    raise NeedsUser('Complete the required answers/consents in the browser before review')
                if cover is not None and 'cover' not in self.uploaded:
                    raise NeedsUser('This form has not accepted the custom cover letter. Complete it manually; no submission will be made without both documents')
                return self.snapshot(resume.name)
            next_button = dialog.get_by_role('button', name=re.compile(r'^(Next|Review)$', re.I))
            if next_button.count() != 1 or not next_button.is_enabled():
                raise NeedsUser('Review this unsupported form step in the browser, then choose Resume')
            next_button.click()
        raise NeedsUser('Form step limit reached. Inspect the browser before continuing')

    def file_hashes(self, inputs):
        return inputs.evaluate_all("""async els => Promise.all(els.flatMap(e => Array.from(e.files || [])).map(async f =>
            Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())))
            .map(b => b.toString(16).padStart(2, '0')).join('')))
        """)

    def snapshot(self, filename):
        self.guard()
        dialog = self.dialog()
        submit = dialog.get_by_role('button', name=re.compile(r'^Submit application$', re.I))
        if submit.count() != 1 or not submit.is_enabled():
            raise NeedsUser('The website is not ready to submit; complete its required answers first')
        if self.uploaded.get('resume', (None,))[0] != filename:
            raise NeedsUser('The custom résumé has not been verified')
        for name, _ in self.uploaded.values():
            if dialog.inner_text().count(name) != 1:
                raise NeedsUser('The final form does not confirm both custom document filenames. Inspect the uploads before continuing')
        # Reject any live file selection that differs from the approved staged file.
        selected = dialog.locator('input[type=file]').evaluate_all('(els) => els.flatMap(e => Array.from(e.files || []).map(f => f.name))')
        try:
            hashes = self.file_hashes(dialog.locator('input[type=file]'))
        except Exception as exc:
            raise NeedsUser('The browser cannot read the selected résumé. Resume to upload and review it again') from exc
        selected_documents = dialog.locator('input[type=radio]:checked').evaluate_all("els => els.map(e => e.labels?.[0]?.innerText || e.getAttribute('aria-label') || '').filter(s => /\\.(pdf|docx?)\\b/i.test(s))")
        names = [item[0] for item in self.uploaded.values()]
        if any(not any(name in label for name in names) for label in selected_documents):
            raise NeedsUser('A stored document is selected instead of the custom documents')
        expected = dict(self.uploaded.values())
        if len(selected) != len(set(selected)) or any(expected.get(name) != sha for name, sha in zip(selected, hashes)):
            raise NeedsUser('The selected documents differ from the custom documents')
        fields = dialog.locator('input:not([type=file]):not([type=hidden]),textarea,select').evaluate_all('''els => els.map(e => ({
            label:e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.name || e.id,
            value:['checkbox','radio'].includes(e.type) ? String(e.checked) : e.value
        }))''')
        return {'upload_sha256': self.uploaded['resume'][1],
                'cover_letter_sha256': self.uploaded.get('cover', ('', ''))[1],
                'page': self.page.url, 'review_text': dialog.inner_text()[:16000], 'fields': fields, 'filename': filename}

    def submit(self, expected, resume, *, before_submit=None):
        try:
            current = self.snapshot(resume.name)
        except NeedsUser:
            raise
        except Exception as exc:
            raise NeedsUser('Cannot verify the current form. Resume and review it again') from exc
        if current != expected:
            raise NeedsUser('The website form changed after review. Resume and approve its new contents')
        dialog = self.dialog()
        if before_submit:
            before_submit()
        dialog.get_by_role('button', name=re.compile(r'^Submit application$', re.I)).click(timeout=10000)
        confirmation = self.page.get_by_text(re.compile(r'(application (was )?sent|successfully submitted)', re.I))
        confirmation.first.wait_for(timeout=15000)
        return {'provider': 'linkedin', 'url': self.target, 'confirmation': confirmation.first.inner_text()[:1000],
                'meaning': 'Observed site confirmation; this does not imply employer acceptance'}

    def close(self):
        if self.context:
            self.context.close()
        if self.engine:
            self.engine.stop()
        self.engine = self.context = self.page = None
