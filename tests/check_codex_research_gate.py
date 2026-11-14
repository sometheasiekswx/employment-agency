"""Optional installed-Codex smoke test. Run: python3 tests/check_codex_research_gate.py."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from shutil import which
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread


ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = "mcp__fixture_search_service"
TOOLS = ("web_run", "browser_navigate")


def run_fixture_mcp(log_path):
    for line in sys.stdin:
        request = json.loads(line)
        if "id" not in request:
            continue

        method = request["method"]
        if method == "initialize":
            result = {
                "protocolVersion": "2025-03-26",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "research-fixture", "version": "1.0"},
            }
        elif method == "tools/list":
            result = {"tools": [
                {
                    "name": tool,
                    "description": "Synthetic local research fixture",
                    "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
                }
                for tool in TOOLS
            ]}
        elif method == "tools/call":
            with log_path.open("a", encoding="utf-8") as log:
                log.write(request["params"]["name"] + "\n")
            result = {"content": [{"type": "text", "text": "Fixture tool dispatched"}]}
        else:
            result = {}
        print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)


class FixtureServer(ThreadingHTTPServer):
    def __init__(self, workspace):
        super().__init__(("127.0.0.1", 0), FixtureHandler)
        self.workspace = workspace
        self.paths = []
        self.model_requests = []
        self.allow_lookup = False
        self.next_tool = None

    @property
    def origin(self):
        return f"http://127.0.0.1:{self.server_port}"


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.server.paths.append(self.path)
        status, body = 404, b"Unexpected fixture path"
        if self.path == "/api/company-avoid":
            status = 200 if self.server.allow_lookup else 503
            body = json.dumps({"result": {"workspace": str(self.server.workspace), "companies": []}}).encode()
        elif self.path == "/job-source-fixture":
            status, body = 200, b"Fixture source dispatched"
        self.send_response(status)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/v1/responses":
            self.send_error(404)
            return
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.model_requests.append(request)
        item = self.server.next_tool
        self.server.next_tool = None
        if item is None:
            item = {
                "type": "message", "id": "msg_fixture", "role": "assistant", "status": "completed",
                "content": [{"type": "output_text", "text": "Fixture finished", "annotations": []}],
            }
        response = {
            "id": f"resp_{len(self.server.model_requests)}", "object": "response",
            "created_at": 1, "status": "completed", "model": "gpt-5.4", "output": [item],
            "usage": {
                "input_tokens": 1, "output_tokens": 1, "total_tokens": 2,
                "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0},
            },
        }
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for kind, body in (
            ("response.created", {"response": {**response, "status": "in_progress", "output": []}}),
            ("response.output_item.added", {"item": item, "output_index": 0}),
            ("response.output_item.done", {"item": item, "output_index": 0}),
            ("response.completed", {"response": response}),
        ):
            self.wfile.write(f"event: {kind}\ndata: {json.dumps({'type': kind, **body})}\n\n".encode())


def fixture_tool(server, name):
    call = {"id": "fc_fixture", "call_id": "call_fixture", "status": "completed"}
    if name == "exec":
        return {
            **call, "type": "custom_tool_call", "name": name,
            "input": (
                f"try {{ text(await tools.{NAMESPACE}__web_run({{}})); }}"
                " catch (error) { text(String(error)); }"
            ),
        }
    command = f"curl -q --noproxy 127.0.0.1 -fsS {server.origin}/job-source-fixture"
    if name == "exec_command":
        return {**call, "type": "function_call", "name": name, "arguments": json.dumps({"cmd": command})}
    return {**call, "type": "function_call", "name": name, "namespace": NAMESPACE, "arguments": "{}"}


def verify_dispatch(codex, server, config, mcp_log):
    environment = {"PATH": os.defpath, "CODEX_HOME": str(config), "NO_PROXY": "127.0.0.1"}
    for name in ("exec_command", *TOOLS, "exec"):
        command = [
            codex, "exec", "--ephemeral", "--skip-git-repo-check", "--dangerously-bypass-hook-trust",
            "--json", "-c", 'approval_policy="never"', "-s", "danger-full-access", "-C", str(server.workspace),
        ]
        if name == "exec":
            command.extend(("--enable", "code_mode"))
        for allowed in (False, True):
            server.paths.clear()
            server.model_requests.clear()
            mcp_log.unlink(missing_ok=True)
            server.allow_lookup = allowed
            server.next_tool = fixture_tool(server, name)
            result = subprocess.run(
                [*command, "Synthetic local-only research gate audit"], env=environment,
                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20,
            )
            outputs = [
                item.get("output") for request in server.model_requests for item in request.get("input", [])
                if item.get("type") in {"function_call_output", "custom_tool_call_output"}
            ]
            expected_paths = ["/api/company-avoid"] * 2
            expected_mcp = []
            if allowed:
                if name == "exec_command":
                    expected_paths.append("/job-source-fixture")
                else:
                    expected_mcp = ["web_run" if name == "exec" else name]
            mcp_calls = mcp_log.read_text(encoding="utf-8").splitlines() if mcp_log.exists() else []
            expected_output = "Fixture" if allowed else "blocked by PreToolUse hook"
            hosted_websearch = any(
                tool.get("type", "").startswith("web_search")
                for request in server.model_requests for tool in request.get("tools", [])
            )
            if (result.returncode or server.paths != expected_paths or mcp_calls != expected_mcp
                    or expected_output not in json.dumps(outputs) or hosted_websearch):
                raise AssertionError(
                    f"{name}  {'200' if allowed else '503'}\n"
                    f"Paths {server.paths!r}\nMCP calls {mcp_calls!r}\n"
                    f"Tool outputs {outputs!r}\n{result.stdout}\n{result.stderr}"
                )
            print(f"{name} {'dispatched on HTTP 200' if allowed else 'blocked on HTTP 503'}")


def main():
    codex = which("codex")
    if os.name == "nt" or not codex or not which("curl"):
        raise SystemExit("This optional check requires a Unix shell, curl and a recent Codex CLI on PATH.")
    with TemporaryDirectory(prefix="codex research fixture ") as temporary:
        directory = Path(temporary).resolve()
        workspace = directory / "workspace's data"
        workspace.mkdir()
        (workspace / "workspace.sqlite3").touch()
        config = directory / "codex-state"
        config.mkdir()
        mcp_log = directory / "mcp.log"
        with FixtureServer(workspace) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                subprocess.run(
                    [sys.executable, str(ROOT / "scripts/setup-codex-job-research-gate.py"),
                     "--workspace", str(workspace), "--port", str(server.server_port)],
                    check=True,
                )
                (config / "config.toml").write_text(
                    'model = "gpt-5.4"\nmodel_provider = "fixture"\n'
                    '[model_providers.fixture]\nname = "Fixture"\n'
                    f'base_url = "{server.origin}/v1"\n'
                    f'[projects.{json.dumps(str(workspace))}]\ntrust_level = "trusted"\n'
                    '[mcp_servers.fixture_search_service]\n'
                    f'command = {json.dumps(sys.executable)}\n'
                    f'args = {json.dumps([str(Path(__file__).resolve()), "--fixture-mcp", str(mcp_log)])}\n',
                    encoding="utf-8",
                )
                verify_dispatch(codex, server, config, mcp_log)
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    if sys.argv[1:2] == ["--fixture-mcp"]:
        run_fixture_mcp(Path(sys.argv[2]))
    else:
        main()
