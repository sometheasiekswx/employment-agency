"""Optional local delivery acceptance; requires the apply extra and Chrome."""
import subprocess
import sys
from run_browser_checks import fixture, browser, ROOT

subprocess.run([sys.executable, str(ROOT / 'tests/check_delivery_connections.py')], check=True, cwd=ROOT)
subprocess.run([sys.executable, str(ROOT / 'tests/check_apply_browser.py')], check=True, cwd=ROOT)
subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests',
                '-p', 'test_agent_*.py', '-v'], check=True, cwd=ROOT)
with fixture('serve_apply_fixture.py') as url:
    browser('apply-browser.cjs', url)
print('All controlled Apply For Me browser checks passed; no employer action or real mail.', flush=True)
