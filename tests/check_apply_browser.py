"""Real Chromium adapter checks against controlled forms; zero external actions."""
import tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apply_fixture import site, FixtureLinkedIn
from employment_agency.linkedin_apply import NeedsUser

http, origin = site()
browser = FixtureLinkedIn(origin)
try:
    browser.open('https://www.linkedin.com/jobs/view/123456/')
    with tempfile.TemporaryDirectory() as directory:
        resume = Path(directory) / 'AlexMorgan-CV-Custom.pdf';resume.write_bytes(b'%PDF controlled listing-specific bytes')
        cover = Path(directory) / 'AlexMorgan-Cover-Custom.pdf';cover.write_bytes(b'%PDF custom cover for this listing')
        payload = {'contact': {'Email address':'alex@example.test', 'Mobile phone number':'+1 555 0100'}}
        review = browser.prepare(payload, resume, cover)
        from employment_agency.store import digest
        assert review['cover_letter_sha256'] == digest(cover.read_bytes())
        assert not browser.page.evaluate('Boolean(window.sent)')
        # A stored default must not override the newly uploaded custom resume.
        browser.page.locator('#stored').check()
        try: browser.submit(review, resume)
        except NeedsUser: pass
        else: raise AssertionError('Stored generic resume was accepted')
        assert not browser.page.evaluate('Boolean(window.sent)')
        browser.page.locator('#custom').check()
        # Same filename, wrong bytes: a filename-only check would miss this.
        browser.page.get_by_label('Custom resume', exact=True).set_input_files({'name':resume.name,'mimeType':'application/pdf','buffer':b'%PDF wrong job bytes'})
        try: browser.submit(review, resume)
        except NeedsUser: pass
        else: raise AssertionError('Wrong bytes with matching filename were accepted')
        browser.page.get_by_label('Custom resume', exact=True).set_input_files(str(resume))
        browser.page.locator('#cover').set_input_files({'name':cover.name,'mimeType':'application/pdf','buffer':b'%PDF generic cover'})
        try: browser.submit(review, resume)
        except NeedsUser: pass
        else: raise AssertionError('Wrong cover letter bytes were accepted')
        assert not browser.page.evaluate('Boolean(window.sent)')
        browser.page.locator('#cover').set_input_files(str(cover))
        browser.page.locator('#email').fill('changed@example.test')
        try: browser.submit(review, resume)
        except NeedsUser: pass
        else: raise AssertionError('Changed answers reused an approval')
        assert not browser.page.evaluate('Boolean(window.sent)')
        browser.page.locator('#email').fill('alex@example.test')
        receipt = browser.submit(review, resume)
        assert receipt['confirmation'] == 'Application sent'
        browser.page.reload()
        browser.page.locator('#cover').evaluate('e => {e.labels[0].remove(); document.querySelector("#covername").remove()}')
        browser.uploaded = {}
        try: browser.prepare(payload, resume, cover)
        except NeedsUser: pass
        else: raise AssertionError('Form without a cover upload was accepted')
        assert not browser.page.evaluate('Boolean(window.sent)')
        print('Chromium adapter PASS: exact custom résumé and cover bytes, missing-cover pause, stored-default rejection, wrong-file rejection, changed-answer guard, approval-gated final click and receipt')
finally:
    browser.close();http.shutdown();http.server_close()
