"""Loopback Caddy configuration; Python remains the private access authority."""
import json

from .server import validate_tailscale_access


def configuration(backend_port, frontend_port, gateway_port, tailscale_origin):
    # Reuse the origin parser; the owner is configured only on the Python server.
    host = validate_tailscale_access(tailscale_origin, 'configured-on-backend')
    backend = f'127.0.0.1:{backend_port}'
    frontend = f'127.0.0.1:{frontend_port}'
    local = f'127.0.0.1:{gateway_port}'
    remote_headers = '''
                header_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
                header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
'''
    local_headers = f'''
                header_up Host {backend}
                header_up X-Forwarded-Host {local}
                header_up X-Forwarded-Proto http
'''
    return f'''{{
    admin off
    auto_https off
    # Proxy errors can include request headers. Keep workspace tokens out of logs.
    log default {{
        output discard
    }}
}}
http://:{gateway_port} {{
    bind 127.0.0.1
    @python path /api /api/* /files/* /history/files/* /exports/*
    @remote host {host}
    handle @remote {{
        # This also authorizes WebSocket upgrades before they reach Next.js.
        forward_auth {backend} {{
            uri /api/runtime
{remote_headers}
        }}
        reverse_proxy @python {backend} {{
{remote_headers}
        }}
        reverse_proxy {frontend} {{
{remote_headers}
        }}
    }}
    @local {{
        expression `{{http.request.hostport}} == {json.dumps(local)}`
        not header X-Forwarded-Host *
        not header X-Forwarded-Proto *
        not header X-Forwarded-For *
        not header Forwarded *
        not header Tailscale-User-Login *
        not header Tailscale-Funnel-Request *
    }}
    handle @local {{
        forward_auth {backend} {{
            uri /api/runtime
{local_headers}
        }}
        reverse_proxy @python {backend} {{
{local_headers}
        }}
        reverse_proxy {frontend}
    }}
    respond 403
}}
'''
