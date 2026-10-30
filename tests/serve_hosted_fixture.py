"""Disposable loopback-only hosted browser fixture; never deploy this test server."""
import os
import argparse
from unittest.mock import patch
from test_cloud import Backend, CFG, OWNER
from employment_agency.hosted import app
from employment_agency.cloud import CloudError


def authenticate(bearer):
    if bearer != 'Bearer fixture-session':
        raise CloudError('Fixture session required', 401)
    return OWNER


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8769)
    args = parser.parse_args()
    origin = 'http://127.0.0.1:' + str(args.port)
    os.environ.update({**CFG, 'EA_PUBLIC_ORIGIN': origin})
    backend = Backend()
    backend.authenticate = authenticate
    with patch('employment_agency.hosted.Supabase', return_value=backend):
        app.run(host='127.0.0.1', port=args.port)
