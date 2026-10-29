import copy
import os
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from contextlib import nullcontext
from employment_agency.cloud import CloudError, Supabase, execute, MAX_SNAPSHOT
from employment_agency.summaries import summarize
from employment_agency.store import restore

OWNER='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
CFG={'SUPABASE_URL':'https://example.supabase.co','SUPABASE_ANON_KEY':'public',
     'SUPABASE_SERVICE_ROLE_KEY':'private-test-key','EA_ALLOWED_EMAILS':'alex@example.test',
     'EA_PUBLIC_ORIGIN':'https://example.test','EA_PILOT_ENABLED':'true'}

class Backend:
    def __init__(self): self.rows={};self.files={}
    def mutation_guard(self, owner): return nullcontext()
    def record(self, owner): return copy.deepcopy(self.rows.get(owner,{'revision':0,'object_key':None}))
    def download(self, owner, key):
        if not key.startswith(owner+'/'): raise CloudError('Wrong owner',403)
        return self.files[key]
    def commit(self, owner, revision, body):
        if self.record(owner)['revision']!=revision: raise CloudError('Conflict',409)
        key=owner+'/'+str(revision+1)
        self.files[key]=body;self.rows[owner]={'revision':revision+1,'object_key':key}
    def delete(self, owner):
        self.rows.pop(owner,None)
        self.files={k:v for k,v in self.files.items() if not k.startswith(owner+'/')}

class CloudTests(unittest.TestCase):
    def test_auth_verified_google_allowlist(self):
        b=Supabase(CFG)
        good={'id':OWNER,'email':'alex@example.test','email_confirmed_at':'today','app_metadata':{'providers':['google']}}
        with patch.object(b,'request',return_value=good): self.assertEqual(b.authenticate('Bearer token'),OWNER)
        for changes in ({'email':'other@example.test'},{'email_confirmed_at':None},{'app_metadata':{'providers':['email']}},{'id':'../other'}):
            with patch.object(b,'request',return_value={**good,**changes}), self.assertRaises(CloudError): b.authenticate('Bearer token')
        with self.assertRaises(CloudError): b.authenticate('')

    def test_cloud_workspace_isolation_export_and_delete(self):
        b=Backend()
        execute(b,OWNER,'identity',{'name':'Alex'})
        execute(b,OTHER,'identity',{'name':'Taylor'})
        self.assertEqual(execute(b,OWNER,'state',{})['state']['identity']['name'],'Alex')
        self.assertEqual(execute(b,OTHER,'state',{})['state']['identity']['name'],'Taylor')
        self.assertEqual(execute(b,OWNER,'state',{})['state']['_workspace']['path'],'Private cloud workspace')
        body=execute(b,OWNER,'export',{})['binary']
        with tempfile.TemporaryDirectory() as t:
            archive=Path(t)/'backup.zip';archive.write_bytes(body)
            restore(archive,Path(t)/'restored',reset_permissions=False)
            self.assertTrue((Path(t)/'restored/state.json').is_file())
        with self.assertRaises(CloudError): execute(b,OWNER,'delete-account',{})
        execute(b,OWNER,'delete-account',{'confirmation':'DELETE'})
        self.assertNotIn(OWNER,b.rows);self.assertIn(OTHER,b.rows)

    def test_import_is_private_and_requires_confirmation(self):
        import base64
        b=Backend()
        execute(b,OWNER,'import',{'name':'resume.txt','data':base64.b64encode(b'Built Python APIs').decode(),'use_as_master':False})
        facts=execute(b,OWNER,'state',{})['state']['facts']
        self.assertEqual(len(facts),1)
        self.assertFalse(facts[0]['confirmed'])
        self.assertEqual(execute(b,OTHER,'state',{})['state']['facts'],[])
        execute(b,OWNER,'confirm',{'id':facts[0]['id']})
        self.assertTrue(execute(b,OWNER,'state',{})['state']['facts'][0]['confirmed'])

    def test_hosted_rejects_local_and_paid_actions(self):
        b=Backend()
        for action in ('workspace-open','workspace-browse','agent-package','consent','run','adopt-edits'):
            with self.assertRaises(CloudError): execute(b,OWNER,action,{})
        with self.assertRaises(CloudError): execute(b,OWNER,'workspace-settings',{'master_template':True})
        self.assertEqual(b.rows,{})

    def test_cross_owner_snapshot_rejected(self):
        with self.assertRaises(CloudError): Supabase(CFG).download(OWNER,OTHER+'/bad.zip')

    def test_failed_cas_preserves_saved_snapshot(self):
        b=Backend();execute(b,OWNER,'identity',{'name':'Saved'})
        old=dict(b.files)
        with patch.object(b,'commit',side_effect=CloudError('Conflict',409)), self.assertRaises(CloudError):
            execute(b,OWNER,'identity',{'name':'Unsaved'})
        self.assertEqual(b.files,old)
        self.assertEqual(execute(b,OWNER,'state',{})['state']['identity']['name'],'Saved')

    def test_http_fail_closed_and_no_secret_config(self):
        from employment_agency.hosted import app
        client=app.test_client()
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(client.get('/api/state').status_code,503)
            self.assertEqual(client.get('/api/config').status_code,503)
        with patch.dict(os.environ,CFG,clear=True):
            response=client.get('/api/config')
            self.assertEqual(response.status_code,200)
            self.assertNotIn(b'private-test-key',response.data)
            self.assertEqual(client.post('/api/identity',json={}).status_code,403)
            self.assertEqual(client.get('/api/state').status_code,401)
            self.assertEqual(client.get('/api/delete-account').status_code,405)
            self.assertEqual(client.get('/ui/../../state.json').status_code,404)

    def test_mutation_guard_is_exclusive_and_rechecks_account(self):
        b=Supabase(CFG)
        with patch.object(b,'request',side_effect=CloudError('Already exists',409)) as call:
            with self.assertRaises(CloudError), b.mutation_guard(OWNER):
                self.fail('A conflicting lock must not execute the body')
            self.assertEqual(call.call_count,1)
        with patch.object(b,'request',side_effect=[{}, {'id':OWNER}, {}]) as call:
            with b.mutation_guard(OWNER): pass
            self.assertEqual(call.call_args_list[1].args[0],'/auth/v1/admin/users/'+OWNER)
            self.assertEqual(call.call_args_list[-1].args[1],'DELETE')
        with patch.object(b,'request',side_effect=[{}, {'id':OTHER}, {}]):
            with self.assertRaises(CloudError), b.mutation_guard(OWNER):
                self.fail('Deleted or mismatched account must not execute')

    def test_deletion_keeps_lock_until_auth_user_removed(self):
        b=Supabase(CFG)
        with patch.object(b,'request',side_effect=[[],{},[{'name':'operation-lock.zip'},{'name':'one.zip'}],{},[{'name':'operation-lock.zip'}],{}]) as call:
            b.delete(OWNER)
            calls=call.call_args_list
            self.assertEqual(calls[1].args[2],{'owner':OWNER,'deleting':True})
            self.assertEqual(calls[3].args[2],{'prefixes':[OWNER+'/one.zip']})
            self.assertEqual(calls[-1].args,('/auth/v1/admin/users/'+OWNER,'DELETE'))

    def test_read_only_ranking_does_not_consume_snapshot_quota(self):
        b=Backend()
        result=execute(b,OWNER,'profile',{'name':'Pilot','roles':['Engineer'],'locations':[]})['result']
        before=b.record(OWNER)['revision']
        execute(b,OWNER,'rank',{'profile_id':result['id']})
        self.assertEqual(b.record(OWNER)['revision'],before)

    def test_malformed_and_oversized_requests_return_client_errors(self):
        from employment_agency.hosted import app
        c=app.test_client()
        with patch.dict(os.environ,CFG,clear=True), patch.object(Supabase,'authenticate',return_value=OWNER):
            h={'Origin':CFG['EA_PUBLIC_ORIGIN'],'Authorization':'Bearer fixture','Content-Type':'application/json'}
            self.assertEqual(c.post('/api/identity',data='{bad',headers=h).status_code,400)
            self.assertEqual(c.post('/api/identity',data='x'*(3*1024*1024+1),headers=h).status_code,413)

    def test_summary_excludes_unconfirmed_claims_and_mentions_gaps(self):
        facts=[{'id':'1','text':'Built Python APIs','confirmed':True},{'id':'2','text':'Led banking architecture','confirmed':False}]
        summary=summarize({'title':'Python Engineer','description':'Python APIs','requirements':['TOGAF certification']},facts)
        self.assertIn('Built Python APIs',summary);self.assertIn('TOGAF',summary)
        self.assertNotIn('Led banking',summary)

if __name__=='__main__':unittest.main()
