import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HOOK_PATH = Path(__file__).with_name("review_agents_before_commit.py")


class ReviewAgentsBeforeCommitTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.repository = Path(self.temporary_directory.name)
        subprocess.run(
            ["git", "init", "--quiet", str(self.repository)],
            check=True,
        )
        self._write("src/AGENTS.md", "REACT_INSTRUCTIONS")
        self._write("src-tauri/AGENTS.md", "RUST_INSTRUCTIONS")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_rust_commit_injects_only_rust_instructions(self) -> None:
        self._stage("src-tauri/src/lib.rs")

        result = self._run_hook("git commit -m 'feat: rust'")

        context = result["hookSpecificOutput"]["additionalContext"]
        self.assertEqual(
            result["hookSpecificOutput"]["permissionDecision"], "deny"
        )
        self.assertIn("RUST_INSTRUCTIONS", context)
        self.assertNotIn("REACT_INSTRUCTIONS", context)

    def test_typescript_commit_injects_only_react_instructions(self) -> None:
        for source_file in ("src/example.ts", "src/example.tsx"):
            with self.subTest(source_file=source_file):
                self._stage(source_file)

                result = self._run_hook("git commit -m 'feat: react'")

                context = result["hookSpecificOutput"]["additionalContext"]
                self.assertIn("REACT_INSTRUCTIONS", context)
                self.assertNotIn("RUST_INSTRUCTIONS", context)

    def test_mixed_commit_is_blocked_without_injecting_either_file(self) -> None:
        self._stage("src-tauri/src/lib.rs")
        self._stage("src/example.ts")

        result = self._run_hook("git commit -m 'feat: mixed'")

        output = result["hookSpecificOutput"]
        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn(
            "Split the staged Rust and React changes",
            output["additionalContext"],
        )
        self.assertNotIn("RUST_INSTRUCTIONS", output["additionalContext"])
        self.assertNotIn("REACT_INSTRUCTIONS", output["additionalContext"])

    def test_unrelated_commit_does_not_inject_context(self) -> None:
        self._stage("README.md")

        completed = self._invoke_hook("git commit -m 'docs: update'")

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "")

    def test_review_marker_allows_the_retried_commit(self) -> None:
        self._stage("src/example.ts")

        completed = self._invoke_hook(
            "CODEX_AGENTS_REVIEWED=1 git commit -m 'feat: react'"
        )

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "")

    def _write(self, relative_path: str, content: str) -> None:
        path = self.repository / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def _stage(self, relative_path: str) -> None:
        self._write(relative_path, "change")
        subprocess.run(
            ["git", "-C", str(self.repository), "add", relative_path],
            check=True,
        )

    def _invoke_hook(self, command: str) -> subprocess.CompletedProcess[str]:
        event = {
            "cwd": str(self.repository),
            "hook_event_name": "PreToolUse",
            "tool_input": {"command": command},
            "tool_name": "Bash",
        }
        return subprocess.run(
            [sys.executable, str(HOOK_PATH)],
            input=json.dumps(event),
            capture_output=True,
            text=True,
            check=False,
        )

    def _run_hook(self, command: str) -> dict:
        completed = self._invoke_hook(command)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertNotEqual(completed.stdout, "")
        return json.loads(completed.stdout)


if __name__ == "__main__":
    unittest.main()
