"""Fail-closed WSGI app for the invite-only cloud pilot."""
import mimetypes
import os
from flask import Flask, request, Response, jsonify
from werkzeug.exceptions import HTTPException
from .cloud import config, Supabase, execute, CloudError
from .web_assets import asset, script_policy, MissingFrontendError

app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 3 * 1024 * 1024


@app.after_request
def headers(response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    scripts = script_policy(response.get_data(as_text=True)) if response.mimetype == 'text/html' else "script-src 'self'"
    response.headers['Content-Security-Policy'] = "default-src 'self'; " + scripts + "; style-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' blob:; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


@app.get('/')
def home():
    return static_file('')


@app.get('/<path:name>')
def static_file(name):
    try:
        path = asset('/' + name)
    except MissingFrontendError:
        return jsonify(error='Frontend unavailable. Build the frontend before deploying.'), 503
    except ValueError:
        return jsonify(error='Not found'), 404
    if path is None:
        if not name.startswith('api/') and '.' not in name.rsplit('/', 1)[-1]:
            missing = asset('/404/')
            if missing:
                return Response(missing.read_bytes(), status=404, mimetype='text/html')
        return jsonify(error='Not found'), 404
    return Response(path.read_bytes(), mimetype=mimetypes.guess_type(path.name)[0] or 'application/octet-stream')


@app.get('/api/runtime')
def runtime():
    return jsonify(mode='hosted')


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
