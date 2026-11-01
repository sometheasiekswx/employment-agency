"""Application UI evidence fixture: isolated fictional workspace + recording transports."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tempfile
import os
import signal
from email import policy
from email.parser import BytesParser

from employment_agency.store import Workspace, digest
from employment_agency.service import Service
from employment_agency.server import server
from employment_agency.application_delivery import Delivery
from apply_fixture import site, FixtureLinkedIn
from test_workflow import Workflow


class FixtureDelivery(Delivery):
    def staged(self, record, cover_letter=False):
        try:
            return super().staged(record, cover_letter=cover_letter)
        except Exception:
            import traceback
            traceback.print_exc()
            raise


class RecordingMail:
    def sender(self): return 'alex@example.test'
    def send(self, raw):
        message = BytesParser(policy=policy.default).parsebytes(raw)
        attachments = list(message.iter_attachments())
        assert len(attachments) == 2
        return {'provider': 'CONTROLLED RECORDING TRANSPORT — no email sent', 'message_id': 'fixture-message',
                'attachment_sha256': digest(attachments[0].get_payload(decode=True)),
                'cover_letter_sha256': digest(attachments[1].get_payload(decode=True))}


if __name__ == '__main__':
    p = argparse.ArgumentParser();p.add_argument('--port',type=int,default=8780);args=p.parse_args()
    with tempfile.TemporaryDirectory(prefix='employment-agency-apply-fixture-') as root:
        os.environ['EA_CONFIG_HOME'] = str(Path(root)/'config')
        site_http, origin = site()
        w = Workspace(Path(root)/'workspace');s = Service(w)
        fixture = Workflow();fixture.s=s;fixture.w=w
        _, profile, job = fixture.seed()
        s.action('workspace-settings', {'setup_complete':True})
        s.action('local-package', {'job_id':job['id'],'profile_id':profile['id']})
        linkedin = s.action('job', {**job, 'id':'', 'title':'Platform Engineer', 'employer':'Fictional Browser Systems',
                                  'url':'https://www.linkedin.com/jobs/view/123456/'})
        s.action('local-package', {'job_id':linkedin['id'],'profile_id':profile['id']})
        s.delivery = FixtureDelivery(s,mail=RecordingMail(),browser_factory=lambda:FixtureLinkedIn(origin))
        http = server(s,args.port)
        print('CONTROLLED fixture: http://127.0.0.1:'+str(http.server_port),flush=True)
        def stop(*args): raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, stop)
        try: http.serve_forever()
        except KeyboardInterrupt:pass
        finally:
            http.server_close();site_http.shutdown();site_http.server_close()
