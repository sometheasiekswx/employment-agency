#!/usr/bin/env python3
"""Install the job-research gate in a local career workspace."""

import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import tomllib


GATE_SCRIPT = Path(__file__).with_name("codex-job-research-gate.py").resolve()
RESEARCH_TOOLS = (
    r"^(Bash|exec_command|shell_command|shell|container\.exec|functions\.exec|exec|"
    r"code_mode.*|cua_repl.*|node_repl.*|web[._].*|websearch.*|search_service.*|browser.*|"
    r"in_app_browser.*|computer_use.*|playwright.*|firecrawl.*|"
    r"mcp__.*(cua_repl|node_repl|search_service|web_run|web_search|search_web|"
    r"websearch|browser|computer_use|playwright|firecrawl|tavily|brave_search|"
    r"duckduckgo|searx|serpapi|exa|fetch|http_request).*)$"
)


def hook_command(workspace, port):
    arguments = [sys.executable, "-I", str(GATE_SCRIPT), str(workspace), str(port)]
    if os.name == "nt":
        quoted = ["'" + arg.replace("'", "''") + "'" for arg in arguments]
        return "& " + " ".join(quoted) + "; if ($LASTEXITCODE -ne 0) { exit 2 }"
    return shlex.join(arguments) + " || exit 2"


EVENTS = {
    "UserPromptSubmit": ("Checking Employment Agency cooldowns", {}),
    "PreToolUse": ("Verifying cooldowns before research tools", {"matcher": RESEARCH_TOOLS}),
}


def merge_hooks(source, workspace, port):
    config = json.loads(source) if source.strip() else {}
    if not isinstance(config, dict) or not isinstance(config.setdefault("hooks", {}), dict):
        raise ValueError("Expected a Codex hooks.json object.")
    command = hook_command(workspace, port)
    for name, (message, matcher) in EVENTS.items():
        handler = {"type": "command", "command": command, "timeout": 8, "statusMessage": message}
        groups = config["hooks"].setdefault(name, [])
        gate_group = {**matcher, "hooks": [handler]}
        for index, group in enumerate(groups):
            existing_handlers = group["hooks"]
            for hook_index, existing in enumerate(existing_handlers):
                if (existing.get("statusMessage") == message
                        and GATE_SCRIPT.name in existing.get("command", "")):
                    if len(existing_handlers) == 1 or all(group.get(key) == value for key, value in matcher.items()):
                        group.update(matcher)
                        existing_handlers[hook_index] = handler
                    else:
                        del existing_handlers[hook_index]
                        groups.insert(index + 1, gate_group)
                    break
            else:
                continue
            break
        else:
            groups.append(gate_group)
    return json.dumps(config, indent=2) + "\n"


def configure_search(source):
    config = tomllib.loads(source)
    features = config.get("features", {})
    if any(features.get(key) is False for key in ("hooks", "codex_hooks")):
        raise ValueError("Enable Codex hooks in the workspace .codex/config.toml, then rerun.")
    if "web_search" not in config:
        source = 'web_search = "disabled"\n' + ("\n" + source if source else "")
    elif config["web_search"] != "disabled":
        raise ValueError('Set web_search = "disabled" in the workspace .codex/config.toml, then rerun.')
    return source


def write_config(path, contents):
    # Keep a running Codex session from seeing a partially written configuration.
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as staging:
        staged_path = Path(staging.name)
        try:
            staging.write(contents.encode("utf-8"))
            staging.close()
            if path.exists():
                staged_path.chmod(path.stat().st_mode & 0o777)
            staged_path.replace(path)
        finally:
            staged_path.unlink(missing_ok=True)


def install(workspace, port):
    if not (workspace / "workspace.sqlite3").is_file():
        raise ValueError("Choose an initialized Employment Agency SQLite workspace. Run the app's init command first.")
    if not GATE_SCRIPT.is_file():
        raise ValueError("The gate script is missing from this Employment Agency checkout.")
    if not Path(sys.executable).is_file():
        raise ValueError("Run setup with a Python interpreter that Codex can launch.")
    directory = workspace / ".codex"
    config_path = directory / "config.toml"
    hooks_path = directory / "hooks.json"
    for path in (directory, config_path, hooks_path):
        if path.is_symlink() or not path.resolve().is_relative_to(workspace):
            raise ValueError(f"Expected a workspace-local path for {path.name}.")

    config = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    hooks = hooks_path.read_text(encoding="utf-8") if hooks_path.exists() else ""
    new_config = configure_search(config)
    new_hooks = merge_hooks(hooks, workspace, port)
    directory.mkdir(exist_ok=True)
    if new_config != config:
        write_config(config_path, new_config)
    if new_hooks != hooks:
        write_config(hooks_path, new_hooks)


def check_setup(workspace, port):
    directory = workspace / ".codex"
    config_path = directory / "config.toml"
    hooks_path = directory / "hooks.json"
    if not config_path.is_file() or not hooks_path.is_file():
        raise ValueError("Workspace gate configuration is missing. Run setup first.")
    config = config_path.read_text(encoding="utf-8")
    hooks = hooks_path.read_text(encoding="utf-8")
    if configure_search(config) != config:
        raise ValueError('Set web_search = "disabled" in the workspace .codex/config.toml.')
    if json.loads(merge_hooks(hooks, workspace, port)) != json.loads(hooks):
        raise ValueError("Gate hook definitions are missing or stale. Rerun setup with this Python, workspace and port.")
    probe = subprocess.run(
        [sys.executable, "-I", str(GATE_SCRIPT), str(workspace), str(port)],
        input=json.dumps({"hook_event_name": "PreToolUse", "tool_name": "mcp__browser__navigate"}),
        text=True, capture_output=True, timeout=6,
    )
    if probe.returncode:
        raise ValueError(probe.stderr.strip() or "The gate probe could not run.")
    result = json.loads(probe.stdout)["hookSpecificOutput"]
    if "additionalContext" not in result or result.get("permissionDecision") == "deny":
        raise ValueError(result.get("permissionDecisionReason", "The gate probe failed."))
    print("Workspace gate files and GET /api/company-avoid passed. An empty cooldown list is valid.")
    print("Check hook trust and enabled status in Codex before researching.")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--workspace", required=True, type=Path, help="Your private SQLite career workspace folder")
    cli.add_argument("--port", default=8766, type=int, help="Local Employment Agency API port (default: 8766)")
    cli.add_argument("--check", action="store_true", help="Check local gate files and the live API without changing them")
    args = cli.parse_args()
    if not 1 <= args.port <= 65535:
        cli.error("--port must be between 1 and 65535.")
    workspace = args.workspace.expanduser().resolve()
    try:
        if args.check:
            check_setup(workspace, args.port)
            return
        install(workspace, args.port)
    except (OSError, ValueError, AttributeError, KeyError, TypeError, subprocess.TimeoutExpired) as exc:
        cli.error(str(exc))
    print(f"Configured the job-research gate in {workspace}.")
    print(f"Start the app with this workspace on http://127.0.0.1:{args.port}.")
    print("Open a local Codex session in the workspace and review and trust UserPromptSubmit and PreToolUse.")


if __name__ == "__main__":
    main()
