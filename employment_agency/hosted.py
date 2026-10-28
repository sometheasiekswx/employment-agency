"""Fail-closed WSGI app for the invite-only cloud pilot."""
import mimetypes
import os
from pathlib import Path
from flask import Flask, request, Response, jsonify
from werkzeug.exceptions import HTTPException
from .cloud import config, Supabase, execute, CloudError

app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 3 * 1024 * 1024
STATIC = Path(__file__).parent / 'static'


@app.after_request
def headers(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


@app.get('/')
def home():
    html = (STATIC / 'index.html').read_text()
    html = html.replace('<script src="/app.js" defer></script>', '<script src="/ui/cloud.js" defer></script>')
    html = html.replace('<script src="/ui/workspace.js" defer></script>', '')
    html = html.replace('Local workspace', 'Private cloud workspace').replace('Local edition', 'Invite-only hosted pilot')
    return Response(html, mimetype='text/html')


@app.get('/app.js')
@app.get('/style.css')
@app.get('/ui/<path:name>')
def static_file(name=None):
    name = name or request.path.lstrip('/')
    allowed = {p.relative_to(STATIC).as_posix() for p in STATIC.rglob('*') if p.is_file()}
    if name not in allowed or name == 'index.html':
        return jsonify(error='Not found'), 404
    return Response((STATIC / name).read_bytes(), mimetype=mimetypes.guess_type(name)[0] or 'application/octet-stream')


@app.get('/api/config')
def public_config():
    try:
        c = config()
        # A deployment requires an explicit operator release gate after live isolation checks.
        if os.environ.get('EA_PILOT_ENABLED') != 'true':
            raise CloudError('Hosted pilot is awaiting verification.', 503)
        return jsonify(url=c['SUPABASE_URL'], key=c['SUPABASE_ANON_KEY'])
    except CloudError as exc:
        return jsonify(error=str(exc)), exc.status


@app.route('/api/<action>', methods=['GET', 'POST'])
def api(action):
    try:
        c = config()
        if os.environ.get('EA_PILOT_ENABLED') != 'true':
            raise CloudError('Hosted pilot is awaiting verification.', 503)
        if request.method == 'GET' and action != 'state':
            raise CloudError('Use POST for this operation.', 405)
        if request.method == 'POST' and request.headers.get('Origin') != c['EA_PUBLIC_ORIGIN']:
            raise CloudError('Request origin rejected.', 403)
        if request.method == 'POST' and not request.is_json:
            raise CloudError('Use application/json.', 415)
        backend = Supabase(c)
        owner = backend.authenticate(request.headers.get('Authorization', ''))
        args = {} if request.method == 'GET' else request.get_json()
        result = execute(backend, owner, action, args)
        if isinstance(result, dict) and 'binary' in result:
            from urllib.parse import quote
            return Response(result['binary'], mimetype=mimetypes.guess_type(result['filename'])[0] or 'application/octet-stream',
                            headers={'Content-Disposition': "attachment; filename*=UTF-8''" + quote(result['filename'], safe='')})
        return jsonify(result)
    except CloudError as exc:
        return jsonify(error=str(exc)), exc.status
    except HTTPException as exc:
        return jsonify(error='Invalid request body or request size.'), exc.code
    except (ValueError, KeyError, TypeError):
        return jsonify(error='Invalid input or unavailable document. Review your inputs and retry.'), 400
    except Exception:
        # Do not log tokens, upstream bodies or career material.
        return jsonify(error='Operation failed. Your last saved workspace is preserved.'), 500
