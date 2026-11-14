"""Exercise stdio ordering, interruption and denial without using an account."""

import json
import subprocess
import sys
import textwrap
import threading
import unittest
from pathlib import Path

from employment_agency.codex_runtime import CodexError, CodexInterrupted, Protocol


PEER = '''
import json, sys

def read():
    return json.loads(sys.stdin.readline())

def send(value):
    print(json.dumps(value), flush=True)

started=read()
assert started['method']=='initialize'
send({'id':started['id'],'result':{}})
assert read()=={'method':'initialized'}
started=read()
assert started['method']=='thread/start' and started['params']['environments']==[]
send({'id':started['id'],'result':{'thread':{'id':'selected','ephemeral':True},'model':'gpt-6.1-sol',
    'modelProvider':'openai','approvalPolicy':'never','sandbox':{'type':'readOnly','networkAccess':False}}})
pending=read()
assert pending['method']=='turn/start' and pending['params']['effort']=='max'
'''


class AgentProtocol(unittest.TestCase):
    def peer(self, script):
        process = subprocess.Popen([sys.executable, '-u', '-c', textwrap.dedent(PEER + script)], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        connection = Protocol(process)
        self.addCleanup(connection.close)
        connection.initialize()
        return connection

    def run_turn(self, connection, call=None, stop=lambda: False):
        return connection.turn('Fixture', call or (lambda *args: {}), [], Path.cwd(), stop=stop)

    def test_calls_may_arrive_before_turn_start_reply_but_are_scope_checked(self):
        connection = self.peer('''
send({'method':'turn/started','params':{'threadId':'selected','turn':{'id':'first'}}})
for request_id, thread, turn in [('foreign','other','first'),('wrong-turn','selected','bad'),('valid','selected','first'),
    ('replay','selected','first')]:
    send({'id':request_id,'method':'item/tool/call','params':{'threadId':thread,'turnId':turn,
        'callId':'same-call','arguments':{},'tool':'selected_role'}})
    reply=read()
    assert reply['id']==request_id and ('result' in reply)==(request_id=='valid')
send({'id':'approval','method':'item/commandExecution/requestApproval','params':{}})
assert 'error' in read()
send({'id':pending['id'],'result':{'turn':{'id':'first'}}})
send({'method':'turn/completed','params':{'threadId':'other','turn':{'id':'first','status':'failed'}}})
send({'method':'turn/completed','params':{'threadId':'selected','turn':{'id':'first','status':'completed'}}})
''')
        calls = []

        def called(*args):
            calls.append(args)
            return {'receipt': 'fictional'}

        self.run_turn(connection, called)
        self.assertEqual(calls, [(None, 'selected_role', {})])

    def test_stop_interrupts_turn_and_revokes_following_tool_call(self):
        connection = self.peer('''
send({'id':pending['id'],'result':{'turn':{'id':'first'}}})
send({'id':'initial','method':'item/tool/call','params':{'threadId':'selected','turnId':'first',
    'callId':'initial','arguments':{},'tool':'selected_role'}})
assert 'result' in read()
interrupt=read()
assert interrupt['method']=='turn/interrupt' and interrupt['params']=={'threadId':'selected','turnId':'first'}
send({'id':'late','method':'item/tool/call','params':{'threadId':'selected','turnId':'first',
    'callId':'late','arguments':{},'tool':'selected_role'}})
assert 'error' in read()
send({'id':interrupt['id'],'result':{}})
''')
        stopped = threading.Event()

        def called(*_):
            stopped.set()
            return {'started': True}

        with self.assertRaises(CodexInterrupted):
            self.run_turn(connection, called, stop=stopped.is_set)

    def test_malformed_frame_fails_without_showing_its_contents(self):
        connection = self.peer("print('invalid fictional message', flush=True)\n")
        with self.assertRaisesRegex(CodexError, 'invalid protocol message'):
            self.run_turn(connection)

    def test_disconnect_and_usage_exhaustion_have_specific_help(self):
        connection = self.peer('sys.exit(0)\n')
        with self.assertRaisesRegex(CodexError, 'disconnected'):
            self.run_turn(connection)
        connection = self.peer('''
send({'id':pending['id'],'result':{'turn':{'id':'first'}}})
send({'method':'turn/completed','params':{'threadId':'selected','turn':{'id':'first','status':'failed',
    'error':{'codexErrorInfo':'usageLimitExceeded'}}}})
''')
        with self.assertRaisesRegex(CodexError, 'usage limits'):
            self.run_turn(connection)
