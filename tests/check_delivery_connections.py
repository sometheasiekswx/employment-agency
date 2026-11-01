"""Exercise the real Gmail connector with fake OAuth/keychain/HTTP boundaries."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import base64
import io
import json
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, Mock
from google.oauth2.credentials import Credentials
from employment_agency.delivery_connections import Gmail, SCOPES

deny_requests = patch('requests.sessions.Session.request', side_effect=AssertionError('Real HTTP is prohibited in this fixture'))
deny_requests.start()
credentials=Credentials(token='fixture-access-token',refresh_token='fixture-refresh',token_uri='https://oauth2.googleapis.com/token',
                        client_id='fixture-client',client_secret='fixture-secret',scopes=SCOPES, expiry=datetime.now(timezone.utc).replace(tzinfo=None)+timedelta(hours=1))
client={'installed':{'client_id':'fixture-client','client_secret':'fixture-secret',
        'auth_uri':'https://accounts.google.com/o/oauth2/auth','token_uri':'https://oauth2.googleapis.com/token'}}
class Vault:
    value=None
    def get_password(self,*args):return self.value
    def set_password(self,*args):self.value=args[-1]
    def delete_password(self,*args):self.value=None
store=Vault();flow=Mock();flow.run_local_server.return_value=credentials
with patch('employment_agency.delivery_connections.vault',return_value=store), \
     patch('google_auth_oauthlib.flow.InstalledAppFlow.from_client_config',return_value=flow) as oauth, \
     patch('urllib.request.urlopen',return_value=io.BytesIO(b'{"email":"alex@example.test","verified_email":true}')):
    assert Gmail().connect_config(client)=={'connected':True,'email':'alex@example.test'}
    assert json.loads(store.value)['credentials']['refresh_token']=='fixture-refresh'
    assert oauth.call_args.kwargs['autogenerate_code_verifier'] is True
    assert flow.run_local_server.call_args.kwargs['prompt'] == 'consent'
    assert not any('readonly' in s or 'modify' in s for s in SCOPES)
message=EmailMessage();message['From']='alex@example.test';message['To']='jobs@example.test';message['Subject']='Controlled application';message.set_content('Fixture')
message.add_attachment(b'%PDF exact custom bytes',maintype='application',subtype='pdf',filename='custom.pdf')
raw=message.as_bytes()
with patch('employment_agency.delivery_connections.vault',return_value=store), \
     patch('urllib.request.urlopen',return_value=io.BytesIO(b'{"id":"fixture-gmail-id","threadId":"fixture-thread"}')) as send:
    result=Gmail().send(raw);assert result['message_id']=='fixture-gmail-id'
    request=send.call_args.args[0];assert request.full_url=='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
    assert base64.urlsafe_b64decode(json.loads(request.data)['raw'])==raw
with patch('employment_agency.delivery_connections.vault',return_value=store), patch('urllib.request.urlopen') as send:
    bad=EmailMessage();bad['From']='other@example.test'
    try:Gmail().send(bad.as_bytes())
    except ValueError:pass
    else:raise AssertionError('Changed connected sender was accepted')
    send.assert_not_called()
    try:Gmail().connect_config({'installed':{**client['installed'],'token_uri':'https://evil.example/token'}})
    except ValueError:pass
    else:raise AssertionError('Non-Google token destination accepted')
    send.assert_not_called()
    Gmail().disconnect();assert store.value is None
print('Real Gmail connector PASS: PKCE OAuth, send-only mail scope, Keychain boundary, exact MIME upload, provider ID, sender/account guard, disconnect; mocked HTTP only')
