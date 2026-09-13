# Repository cleanup audit

Audit this repository for genuinely unused or redundant tracked files, imports, exports,
dependencies, tests, configuration, and assets. Make a change only when the evidence is strong
and the cleanup preserves behavior.

Follow every applicable `AGENTS.md` instruction. Treat a missing text reference as one signal, not
proof. Confirm each removal with repository-wide search plus language-aware checks or dependency
analysis. Account for dynamic imports, route discovery, Tauri commands and configuration,
capabilities and permissions, build scripts, public exports, tests, generated or vendored files,
platform-specific code, localization resources, and assets referenced through runtime paths. If
usage is uncertain, leave the item unchanged.

Keep the run surgical:

- Select at most one coherent cleanup and change no more than six files.
- Do not change behavior, upgrade dependencies, or perform broad formatting.
- Do not edit anything under `.github/workflows/` or `.github/codex/`.
- Do not add new source files or force-add ignored files.
- Do not use the network or install tools or dependencies.
- Review the final diff and revert any speculative change.

The workflow will validate, commit, push, and open the pull request. If no cleanup meets this bar,
leave the working tree unchanged and explain the strongest candidates you deliberately skipped.
