#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys
from pathlib import Path


COMMIT_PATTERN = re.compile(
    r"(?:^|[;&|]\s*)"
    r"(?P<reviewed>CODEX_AGENTS_REVIEWED=1\s+)?"
    r"git(?:\s+-C\s+(?:'[^']*'|\"[^\"]*\"|\S+))?\s+commit(?:\s|$)"
)
REACT_EXTENSIONS = {".ts", ".tsx"}
REACT_INSTRUCTIONS = Path("src/AGENTS.md")
RUST_INSTRUCTIONS = Path("src-tauri/AGENTS.md")


def deny(reason: str, context: str) -> None:
    """Return model-visible guidance while preventing the pending commit."""
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
                "additionalContext": context,
            }
        },
        sys.stdout,
        ensure_ascii=False,
    )


event = json.load(sys.stdin)
command = event.get("tool_input", {}).get("command", "")

if not isinstance(command, str):
    sys.exit(0)

commit_match = COMMIT_PATTERN.search(command)
if commit_match is None:
    sys.exit(0)

cwd = event.get("cwd") or os.getcwd()

try:
    repository = Path(
        subprocess.check_output(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    )
    staged_files = subprocess.check_output(
        ["git", "-C", cwd, "diff", "--cached", "--name-only", "-z"],
        stderr=subprocess.DEVNULL,
    ).decode("utf-8", errors="surrogateescape").split("\0")
except subprocess.CalledProcessError:
    deny(
        "Cannot inspect the staged files.",
        "Do not commit until the repository and staged files can be inspected.",
    )
    sys.exit(0)

has_rust = any(Path(path).suffix == ".rs" for path in staged_files)
has_react = any(Path(path).suffix in REACT_EXTENSIONS for path in staged_files)

if has_rust and has_react:
    deny(
        "Rust and React files are staged together.",
        "Split the staged Rust and React changes into separate commits. "
        "No scoped AGENTS.md file was injected.",
    )
    sys.exit(0)

instructions_path = (
    RUST_INSTRUCTIONS if has_rust else REACT_INSTRUCTIONS if has_react else None
)
if instructions_path is None:
    sys.exit(0)

absolute_instructions_path = repository / instructions_path
try:
    instructions = absolute_instructions_path.read_text(encoding="utf-8")
except OSError:
    deny(
        f"Required instruction file is unavailable: {instructions_path}",
        f"Do not commit until {instructions_path} can be read.",
    )
    sys.exit(0)

if commit_match.group("reviewed"):
    sys.exit(0)

deny(
    f"Review {instructions_path} before committing.",
    "Review and apply the current scoped instructions below. Then retry the same "
    "command with `CODEX_AGENTS_REVIEWED=1` immediately before `git commit`.\n\n"
    f"===== {instructions_path} =====\n{instructions}",
)
