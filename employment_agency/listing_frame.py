"""Same-origin shell for a read-only third-party listing frame."""

from base64 import b64encode
from hashlib import sha256
import re

_LABEL = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
_HOST = re.compile(rf'(?:{_LABEL}\.)+[a-z](?:[a-z0-9-]{{0,61}}[a-z0-9])?')
_PRIVATE_SUFFIXES = ('.localhost', '.local', '.localdomain', '.internal', '.home',
                     '.lan', '.test', '.invalid', '.example', '.onion', '.arpa', '.ts.net')
_STYLE = 'html,body,iframe{width:100%;height:100%;margin:0;border:0}iframe{display:block}'
_STYLE_HASH = b64encode(sha256(_STYLE.encode()).digest()).decode()
_SCRIPT = """(() => {
  if (window.parent === window) return;
  try {
    const listing = new URL(decodeURIComponent(location.hash.slice(1)));
    if (listing.origin !== document.body.dataset.origin || listing.username || listing.password) return;
    document.querySelector('iframe').src = listing.href;
  } catch {
    // The parent dialog still displays the saved advert.
  }
})();"""
_SCRIPT_HASH = b64encode(sha256(_SCRIPT.encode()).digest()).decode()


def listing_frame(host):
    if (not isinstance(host, str) or len(host) > 253 or not _HOST.fullmatch(host)
            or host.endswith(_PRIVATE_SUFFIXES)):
        raise ValueError('Website preview requires a public HTTPS hostname')

    origin = 'https://' + host
    html = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>Website preview</title><style>{_STYLE}</style></head>'
            f'<body data-origin="{origin}"><iframe title="Listing website" sandbox '
            f'referrerpolicy="no-referrer"></iframe><script>{_SCRIPT}</script></body></html>')
    policy = (f"default-src 'none'; script-src 'sha256-{_SCRIPT_HASH}'; style-src 'sha256-{_STYLE_HASH}'; "
              f"frame-src {origin}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'")
    return html, {'Content-Security-Policy': policy, 'X-Frame-Options': 'SAMEORIGIN'}
