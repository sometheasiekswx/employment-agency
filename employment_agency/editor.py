"""In-page document editing; original versions and confirmed facts remain unchanged."""
import base64
import json
import tempfile
from pathlib import Path
from . import documents, packages, master
from .store import encode, digest, uid, now
from .workspaces import settings

KINDS = {'title', 'contact', 'heading', 'bullet', 'text'}


def original(workspace, args):
    stem = args.get('document')
    if stem not in ('resume', 'cover-letter'):
        raise ValueError('Choose a CV or cover letter')
    app = next((a for a in workspace.read()['applications'] if a['id'] == args.get('id')), None)
    if not app:
        raise ValueError('Application not found')
    if packages.changed(workspace.path, app):
        raise ValueError('Files changed on disk; validate them before editing')
    return app, stem


def load(workspace, args):
    from docx import Document
    app, stem = original(workspace, args)
    config = settings(workspace.path)
    tex = app['documents'].get(stem + '.tex')
    mode = 'tex' if config['master_template'] and tex else 'blocks'
    result = {'id': app['id'], 'document': stem, 'base': app['manifest_hash'], 'mode': mode}
    if mode == 'tex':
        result['source'] = packages.path_for(workspace.path, app, stem + '.tex').read_text(encoding='utf-8')
    elif stem + '.docx' in app['documents']:
        doc = Document(packages.path_for(workspace.path, app, stem + '.docx'))
        styles = {'Title':'title', 'Heading 2':'heading', 'List Bullet':'bullet', 'Contact':'contact'}
        result['blocks'] = [[styles.get(p.style.name, 'text'), p.text] for p in doc.paragraphs if p.text.strip()]
        # Standard templates place up to two contact paragraphs directly after the title.
        if 'Contact' not in doc.styles:
            for block in result['blocks'][1:3]:
                if block[0] == 'text': block[0] = 'contact'
    else:
        result['mode'] = 'view'
        result['notice'] = 'This version has no supported editable source. You can view its PDF.'
    result['pdf'] = base64.b64encode(packages.path_for(workspace.path, app, stem + '.pdf').read_bytes()).decode()
    return result


def edit(workspace, args, *, save=False):
    with workspace.lock:
        app, stem = original(workspace, args)
        if args.get('base') != app['manifest_hash']:
            raise ValueError('The source version changed. Reopen the editor.')
        config = settings(workspace.path)
        mode = 'tex' if config['master_template'] and stem + '.tex' in app['documents'] else 'blocks'
        limit = config['resume_pages'] if stem == 'resume' else config['cover_letter_pages']
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            if mode == 'tex':
                source = args.get('source')
                if not isinstance(source, str) or not source.strip() or len(source) > 100000:
                    raise ValueError('Enter LaTeX source up to 100,000 characters')
                pdf, extracted = master.compile_tex(source, limit)
                (p / (stem + '.pdf')).write_bytes(pdf)
                (p / (stem + '.tex')).write_text(source, encoding='utf-8')
                (p / (stem + '.txt')).write_text(extracted, encoding='utf-8')
                master.word_copy(source, p / (stem + '.docx'))
            else:
                if stem + '.docx' not in app['documents']:
                    raise ValueError('This document has no supported editable source')
                blocks = args.get('blocks')
                if not isinstance(blocks, list) or not 1 <= len(blocks) <= 200:
                    raise ValueError('Use between 1 and 200 text blocks')
                for block in blocks:
                    if not isinstance(block, list) or len(block) != 2 or block[0] not in KINDS or not isinstance(block[1], str) or not block[1].strip() or len(block[1]) > 4000:
                        raise ValueError('Every block needs a supported style and non-empty text up to 4,000 characters')
                if sum(len(b[1]) for b in blocks) > 40000:
                    raise ValueError('Document text exceeds the editing limit')
                evidence_path = app['documents'].get('evidence.json')
                evidence = json.loads(packages.path_for(workspace.path, app, 'evidence.json').read_text()) if evidence_path else {}
                documents.render_blocks(p, stem, blocks, limit, evidence.get('template', 'navy'))
            pdf = (p / (stem + '.pdf')).read_bytes()
            if not save:
                return {'pdf': base64.b64encode(pdf).decode()}
            files = {role: packages.path_for(workspace.path, app, role).read_bytes() for role in app['documents']}
            for ext in ('pdf', 'tex', 'txt', 'docx'):
                files[stem + '.' + ext] = (p / (stem + '.' + ext)).read_bytes()
            evidence = json.loads(files.get('evidence.json', b'{}'))
            evidence.setdefault('manual_edits', []).append({'document':stem, 'at':now(), 'source_version':app['manifest_hash'], 'pdf_sha256':digest(pdf), 'notice':'User-authored document edit; does not confirm or change career facts.'})
            files['evidence.json'] = encode(evidence)
            packages.validate(files, config)  # Also rebuild exact unsent PDF attachments.
            record = packages.record(workspace.path, app)
            version = packages.publish(workspace.path, files, record['job'], workspace.read()['identity'], source='In-page user edit')
            new = {**app, **version, 'id':uid(), 'status':'draft', 'created_at':now(), 'comments':[], 'derived_from':app['id']}
            for key in ('reviewed_at', 'submitted_at', 'file_changes', 'archived'):
                new.pop(key, None)
            with workspace.edit() as state:
                state['applications'].append(new)
            return new
