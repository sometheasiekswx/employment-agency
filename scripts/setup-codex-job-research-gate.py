#!/usr/bin/env python3
"""Install the job-research gate in a local career workspace."""

import argparse
import json
import os
from pathlib import Path
import shlex
import sys
import tempfile
import tomllib


GATE_SCRIPT = Path(__file__).with_name("codex-job-research-gate.py").resolve()
RESEARCH_TOOLS = (
    r"^(Bash|exec_command|functions\.exec|exec|code_mode.*|cua_repl.*|node_repl.*|"
    r"web[._].*|web_search.*|search_service.*|browser.*|in_app_browser.*|computer_use.*|"
    r"mcp__.*(cua_repl|node_repl|search_service|web_run|web_search|search_web|browser|"
    r"computer_use|playwright|firecrawl|tavily|brave_search|exa|fetch).*)$"
)


def hook_command(workspace, port):
    arguments = [sys.executable, "-I", str(GATE_SCRIPT), str(workspace), str(port)]
    if os.name == "nt":
        quoted = ["'" + arg.replace("'", "''") + "'" for arg in arguments]
        return "& " + " ".join(quoted) + "; if ($LASTEXITCODE -ne 0) { exit 2 }"
    return shlex.join(arguments) + " || exit 2"


def merge_hooks(source, workspace, port):
    config = json.loads(source) if source.strip() else {}
    if not isinstance(config, dict) or not isinstance(config.setdefault("hooks", {}), dict):
        raise ValueError("Expected a Codex hooks.json object.")
    command = hook_command(workspace, port)
    events = {
        "UserPromptSubmit": ("Checking Employment Agency cooldowns", {}),
        "PreToolUse": ("Verifying cooldowns before research tools", {"matcher": RESEARCH_TOOLS}),
    }
    for name, (message, matcher) in events.items():
        handler = {"type": "command", "command": command, "timeout": 8, "statusMessage": message}
        for group in config["hooks"].setdefault(name, []):
            for index, existing in enumerate(group["hooks"]):
                if existing.get("statusMessage") == message and GATE_SCRIPT.name in existing.get("command", ""):
                    group.update(matcher)
                    group["hooks"][index] = handler
                    break
            else:
                continue
            break
        else:
            config["hooks"][name].append({**matcher, "hooks": [handler]})
    return json.dumps(config, indent=2) + "\n"


def configure_search(source):
    config = tomllib.loads(source)
    if config.get("features", {}).get("hooks") is False:
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


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--workspace", required=True, type=Path, help="Your private SQLite career workspace folder")
    cli.add_argument("--port", default=8766, type=int, help="Local Employment Agency API port (default: 8766)")
    args = cli.parse_args()
    if not 1 <= args.port <= 65535:
        cli.error("--port must be between 1 and 65535.")
    workspace = args.workspace.expanduser().resolve()
    try:
        install(workspace, args.port)
    except (OSError, ValueError, AttributeError, KeyError, TypeError) as exc:
        cli.error(str(exc))
    print(f"Configured the job-research gate in {workspace}.")
    print(f"Start the app with this workspace on http://127.0.0.1:{args.port}.")
    print("Open a local Codex session in the workspace and review and trust UserPromptSubmit and PreToolUse.")


if __name__ == "__main__":
    main()
