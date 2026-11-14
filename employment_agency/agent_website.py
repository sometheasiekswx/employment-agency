"""A browser for verified, same-endpoint HTML application forms."""

from http.cookies import SimpleCookie
from importlib.util import find_spec
from pathlib import Path
from time import monotonic
from urllib.parse import urlencode, urljoin, urlsplit
import os
import re
import secrets
import sys

from . import sources
from .store import digest


class Unavailable(Exception):
    """Verified channel unavailability before an external effect."""


class Help(Exception):
    def __init__(self, message, *, field=None, prompt=None):
        super().__init__(message)
        self.field, self.prompt = field, prompt


class Interrupted(Exception):
    pass


def chrome_available():
    if not find_spec('playwright'):
        return False
    if sys.platform == 'darwin':
        paths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    elif os.name == 'nt':
        paths = [str(Path(os.environ.get(key, '')) / r'Google\Chrome\Application\chrome.exe')
                 for key in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA')]
    else:
        paths = ['/opt/google/chrome/chrome']
    return any(Path(path).is_file() for path in paths)


class WebsiteTransport:
    """Pin HTTPS to a checked public IP and carry cookies only to the exact endpoint."""

    def __init__(self, destination):
        self.url = sources.public_url(destination)
        self.cookies = SimpleCookie()

    def request(self, body=None, content_type=None):
        address = sources.public_addresses(self.url.hostname)[0]
        connection = sources.PinnedHTTPS(self.url.hostname, address, 12)
        target = (self.url.path or '/') + ('?' + self.url.query if self.url.query else '')
        headers = {'Accept': 'text/html', 'User-Agent': sources.USER_AGENT}
        if self.cookies:
            headers['Cookie'] = '; '.join(cookie.OutputString(attrs=[]) for cookie in self.cookies.values())
        if content_type:
            headers['Content-Type'] = content_type
        try:
            connection.request('POST' if body is not None else 'GET', target, body=body, headers=headers)
            with connection.getresponse() as response:
                deadline = monotonic() + 12
                content = bytearray()
                while len(content) <= sources.MAX_BYTES:
                    if connection.sock:
                        connection.sock.settimeout(sources.remaining(deadline))
                    block = response.read1(min(65536, sources.MAX_BYTES + 1 - len(content)))
                    if not block:
                        break
                    content.extend(block)
                if len(content) > sources.MAX_BYTES or response.length:
                    raise Help('The website response exceeds the supported application form size.')
                for key, value in response.getheaders():
                    if key.lower() == 'set-cookie':
                        cookie = SimpleCookie(value)
                        for name, item in cookie.items():
                            if item['max-age'] == '0':
                                self.cookies.pop(name, None)
                            else:
                                self.cookies[name] = item.value
                return response.status, response.getheader('Content-Type', ''), bytes(content)
        finally:
            connection.close()


FORM_SCRIPT = """() => Array.from(document.forms).filter(form => form.getClientRects().length).map(form => ({
    action: form.getAttribute('action') || '', method: form.method, target: form.target,
    encoding: form.enctype, base: !!document.querySelector('base'),
    fields: Array.from(form.elements).filter(e => !e.matches(':disabled')).map(e => ({
        tag: e.tagName.toLowerCase(), type: e.type, name: e.name ?? '', value: e.value ?? '',
        label: (e.getAttribute('aria-label') || Array.from(e.labels || []).map(l => l.innerText).join(' ') || e.name || '').trim(),
        visible: !!e.getClientRects().length, required: e.required === true,
        checked: e.checked === true, multiple: e.multiple === true, accept: e.accept || '',
        choices: Array.from(e.options || []).filter(o => !o.disabled).map(o => ({label: o.text.trim(), value: o.value})),
        override: ['formaction', 'formmethod', 'formenctype', 'formtarget'].some(k => e.hasAttribute(k)),
        text: (e.innerText || e.value || '').trim()
    }))
}))"""

SUBMIT = re.compile(r'^(submit( my)? application|send application|apply now|submit)$', re.I)
NEXT = re.compile(r'^(next|continue|review( application)?)$', re.I)
RECEIPT = re.compile(r'(?:(?:your )?application (?:was |has been )?(?:successfully )?'
                     r'(?:sent|submitted|received)(?: successfully)?|'
                     r'thank you for (?:your application|applying|submitting your application))[.!]?', re.I)
CONFIRMATION = '[role=status]:visible, h1:visible, h2:visible, [data-application-confirmation]:visible'
DOCUMENT = re.compile(r'\b(r[eé]sum[eé]|cv|cover[ -]?letter)\b', re.I)
FIELD_NAME = re.compile(r'[A-Za-z0-9_.\[\]:-]{1,150}\Z')
SITE_STATE = re.compile(r'(?:_?csrf(?:middlewaretoken|[_-]?token)?|authenticity_token|_token|'
                        r'(?:form|session|flow|state)[_-]?(?:id|token)|step|state)', re.I)
VACANCY_FIELD = re.compile(r'(?:job|vacancy|requisition|posting|application)[_-]?id', re.I)
CONTACT = {'name': 'name', 'full name': 'name', 'first name': 'first_name', 'last name': 'last_name',
           'email': 'email', 'email address': 'email', 'phone': 'phone', 'phone number': 'phone',
           'mobile phone number': 'phone', 'mobile number': 'phone', 'location': 'location'}


def key(text):
    return ' '.join(str(text).strip(' *:').casefold().split())


def contact_value(identity, label):
    field = CONTACT.get(key(label))
    if field in {'first_name', 'last_name'}:
        name = str(identity.get('name', '')).split()
        if len(name) == 2:
            return name[0 if field == 'first_name' else 1]
        return None
    return identity.get(field) or None


def encode_form(fields, uploads, encoding):
    if not uploads and encoding == 'application/x-www-form-urlencoded':
        return urlencode(fields).encode(), encoding
    if encoding != 'multipart/form-data':
        raise Help('The site does not offer a supported document upload form.')
    boundary = 'ea-' + secrets.token_hex(16)
    parts = []
    for name, value in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode() + value.encode() + b'\r\n')
    for name, document in uploads:
        filename = document['filename']
        if not re.fullmatch(r'[\w.-]{1,200}\.pdf', filename, re.UNICODE):
            raise Help('The application document filename cannot be used on this form.')
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                     'Content-Type: application/pdf\r\n\r\n'.encode() + document['data'] + b'\r\n')
    return b''.join(parts) + f'--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


class Website:
    """Read the rendered form and send only its validated, service-built fields."""

    def __init__(self, transport_factory=WebsiteTransport):
        self.transport_factory = transport_factory

    def readiness(self):
        available = chrome_available()
        return {'available': available, 'reason': '' if available else 'The local Playwright and Chrome application tools are unavailable.'}

    def submit(self, destination, documents, identity, answers, *, before_dispatch, after_step, ask, stop,
               cover_required=False):
        from playwright.sync_api import Error as BrowserError, sync_playwright

        transport = self.transport_factory(destination)
        try:
            status, content_type, body = transport.request()
        except (OSError, ValueError) as exc:
            raise Help('Open the verified application site to check access, then resume.') from exc
        if status in (404, 410):
            raise Unavailable('The verified website returned HTTP ' + str(status) + '.')
        if status != 200 or 'text/html' not in content_type.lower():
            raise Help('The application site requires sign-in, redirects away, or has an unsupported form.')
        submitted_documents = set()
        with sync_playwright() as engine:
            try:
                browser = engine.chromium.launch(channel='chrome', headless=True, args=[
                    '--disable-background-networking', '--disable-quic', '--disable-extensions', '--no-pings'])
            except BrowserError as exc:
                raise Help('Chrome could not open the application form. Check the local browser connection.') from exc
            try:
                page = browser.new_context(java_script_enabled=False, service_workers='block',
                                           accept_downloads=False).new_page()
                page.context.route('**/*', lambda route: route.abort())
                submitted_shapes = set()
                seen_confirmations = set()
                for _ in range(8):
                    if stop():
                        raise Interrupted()
                    page.set_content(body.decode('utf-8', errors='replace'), wait_until='domcontentloaded', timeout=12000)
                    seen_confirmations.update(key(text) for text in page.locator(CONFIRMATION).all_inner_texts())
                    if page.locator('form:visible input[type=password], iframe[src*="captcha"], [data-sitekey]').count():
                        raise Help('The site requires sign-in or verification. Complete this application on the site.')
                    form, button = self.form(page, destination)
                    final = bool(SUBMIT.fullmatch(button['text']))
                    shape = digest(repr((form['action'], form['encoding'], button['text'], [
                        (field['name'], field['label'], field['type'], field['choices']) for field in form['fields']
                        if field['type'] != 'hidden'])).encode())
                    if shape in submitted_shapes:
                        raise Help('The site returned a previously sent form. Check the site to resolve the outcome.')
                    while True:
                        try:
                            fields, uploads, applied = self.values(form, button, documents, identity, answers())
                            break
                        except Help as question:
                            if not question.field:
                                raise
                            ask(question)
                    sent_documents = submitted_documents | {document['role'] for _, document in uploads}
                    if final and ('resume.pdf' not in sent_documents or cover_required and 'cover-letter.pdf' not in sent_documents):
                        raise Help('The site does not confirm all required custom application documents.')
                    data, content_type = encode_form(fields, uploads, form['encoding'])
                    before_dispatch({'kind': 'submit' if final else 'continue', 'form_sha256': shape,
                                     'body_sha256': digest(data), 'answers': applied,
                                     'documents': [{k: d[k] for k in ('role', 'filename', 'sha256')} for _, d in uploads]})
                    status, content_type, body = transport.request(data, content_type)
                    submitted_shapes.add(shape)
                    submitted_documents = sent_documents
                    if status != 200 or 'text/html' not in content_type.lower():
                        raise Help('The site returned an unverified result after receiving the application data.')
                    page.set_content(body.decode('utf-8', errors='replace'), wait_until='domcontentloaded', timeout=12000)
                    confirmations = [text.strip() for text in page.locator(CONFIRMATION).all_inner_texts()
                                     if RECEIPT.fullmatch(key(text)) and key(text) not in seen_confirmations]
                    if final and confirmations and not page.locator('form:visible, [role=alert]:visible').count():
                        return {'provider': 'website', 'url': destination, 'confirmation': confirmations[0],
                                'response_sha256': digest(body)}
                    if final:
                        raise Help('The final form was sent but no submission confirmation appeared.')
                    # Check the next form in the same scoped session before continuing.
                    self.form(page, destination)
                    after_step()
                raise Help('The site exceeded the supported number of application form steps.')
            finally:
                browser.close()

    @staticmethod
    def form(page, destination):
        forms = page.evaluate(FORM_SCRIPT)
        options = [(form, field) for form in forms for field in form['fields']
                   if field['type'] == 'submit' and field['visible']
                   and (SUBMIT.fullmatch(field['text']) or NEXT.fullmatch(field['text']))]
        if len(options) != 1:
            raise Help('The site has no unambiguous supported application form. Inspect the application site.')
        form, button = options[0]
        params = urlsplit(destination)
        effective = urlsplit(urljoin(destination, form['action']))
        if (form['method'] != 'post' or form['target'] not in ('', '_self') or form['base'] or button['override']
                or len(form['fields']) > 80 or not form['fields']
                or effective._replace(fragment='') != params._replace(fragment='')):
            raise Help('The website form changes the verified destination or uses an unsupported submission method.')
        return form, button

    @staticmethod
    def values(form, button, documents, identity, answers):
        fields, uploads, used = [], [], []
        for field in form['fields']:
            kind, label, name = field['type'], field['label'], field['name']
            value = field['value']
            if kind == 'submit' and field is not button or kind in {'button', 'reset'}:
                continue
            if not name and kind == 'submit':
                continue
            if not FIELD_NAME.fullmatch(name) or field['multiple'] or len(value) > 10000:
                raise Help('A website field uses an unsupported value or input type.')
            if kind == 'file':
                role = ('cover-letter.pdf' if re.search(r'cover[ -]?letter', label, re.I)
                        else 'resume.pdf' if DOCUMENT.search(label) else None)
                accepts = set(part.strip().lower() for part in field['accept'].split(','))
                if not field['visible'] or not role or (accepts != {''} and not accepts & {'.pdf', 'application/pdf', '*/*'}):
                    raise Help('The site asks for an unsupported file or may be using a stored résumé.')
                uploads.append((name, documents[role]))
            elif kind == 'hidden' or kind == 'submit':
                if VACANCY_FIELD.fullmatch(name):
                    raise Help('The website form sets a separate vacancy identifier. Confirm the correct role on the application site.')
                if kind == 'hidden' and not SITE_STATE.fullmatch(name):
                    if DOCUMENT.search(name.replace('_', ' ').replace('-', ' ')) and value:
                        raise Help('The site selected a stored document instead of the exact application version.')
                    raise Help('The site has a hidden field outside the supported form-state fields. Inspect its application form.')
                fields.append((name, value))
            elif kind in {'radio', 'checkbox'}:
                if DOCUMENT.search(label) or re.search(r'\.(pdf|docx?)\b', label, re.I):
                    raise Help('The site selected a stored document or needs the custom upload selected manually.')
                raise Help('The site requires a checkbox or radio choice. Complete it directly on the application site.')
            elif kind in {'text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select-one'} and field['visible']:
                answer = next((row['value'] for row in answers if row.get('field') == name
                               and row.get('question') == label), None)
                answer = answer if answer is not None else contact_value(identity, label)
                if answer is None:
                    if field['required'] or value:
                        raise Help('The website needs an application answer.', field=name, prompt=label[:300])
                    continue
                if kind == 'select-one':
                    choices = [choice['value'] for choice in field['choices']
                        if key(answer) in (key(choice['value']), key(choice['label'])) and choice['value']]
                    if len(set(choices)) != 1:
                        raise Help('The answer must match one of the website options.', field=name, prompt=label[:300])
                    field_value = choices[0]
                else:
                    field_value = answer
                if len(label) > 300:
                    raise Help('A website question is too long to verify in this application.')
                fields.append((name, field_value))
                used.append({'field': name, 'question': label, 'value': field_value, 'confirmed_value': answer})
            else:
                raise Help('The website contains an unsupported application field.')
        payload_names = [name for name, _ in fields + uploads]
        if len(payload_names) != len(set(payload_names)):
            raise Help('The website form repeats field names and cannot bind the exact answers.')
        return fields, uploads, used
