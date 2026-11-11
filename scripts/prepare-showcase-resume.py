"""Render an explicitly selected master for the public demo, with contacts removed."""

import argparse
from hashlib import sha256
import io
import json
from pathlib import Path
import re
import sys

from pypdf import PdfReader, PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from employment_agency.master import compile_tex, header_fields


SENSITIVE = re.compile(
    r'mailto:|tel:|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\w)\+\d[\d ().-]{7,}\d'
    r'|\b(?:date of birth|passport (?:number|no)|street address|referee contact)\b',
    re.I,
)


def prepare(master, destination):
    if destination.exists():
        raise ValueError('Choose a new directory for the public copy.')
    tex = master.read_text(encoding='utf-8')
    name = header_fields(tex)['name']
    preamble, begin, document = tex.partition(r'\begin{document}')
    header, profile, body = document.partition(r'\section{Profile}')
    if not begin or not profile:
        raise ValueError('The master layout has changed. Review its header before publishing.')
    header, count = re.subn(r'\n\{\\small\\raggedright\s*.*?\\par\}\s*$', '\n', header, flags=re.S)
    if count != 1 or SENSITIVE.search(header + body):
        raise ValueError('The master contains contact fields outside the expected header.')
    body = re.sub(r',\s*\[add relevant skills\]', '', body, flags=re.I)
    rendered, text = compile_tex(preamble + begin + header + profile + body, limit=3)
    if SENSITIVE.search(text) or name not in text:
        raise ValueError('The rendered public copy needs a privacy review.')

    # Publish document pages and a neutral title only.
    writer = PdfWriter()
    for page in PdfReader(io.BytesIO(rendered)).pages:
        page.pop('/Annots', None)
        writer.add_page(page)
    writer.add_metadata({'/Title': 'Demo master résumé'})
    buffer = io.BytesIO()
    writer.write(buffer)
    pdf = buffer.getvalue()
    record = {'name': name, 'text': text.strip(), 'sha256': sha256(pdf).hexdigest()}
    destination.mkdir(parents=True, mode=0o700)
    (destination / 'resume.pdf').write_bytes(pdf)
    (destination / 'resume.json').write_text(json.dumps(record, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Prepared a redacted public résumé ({len(writer.pages)} pages).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    arguments = parser.parse_args()
    prepare(arguments.master, arguments.output)
