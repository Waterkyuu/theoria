# Theoria Agent Guidance

## Project Context

Theoria is a local-first desktop workspace for comparing AI coding agents. The frontend lives in `src/`; the Tauri/Rust backend lives in `src-tauri/`.

## Directory Guidance

- For frontend, UI, React, TypeScript, styling, i18n, and frontend test changes, follow `src/AGENTS.md`.
- For Tauri, Rust, IPC, SQLite, filesystem, process, permissions, adapter, and backend test changes, follow `src-tauri/AGENTS.md`.
- When a change crosses both layers, apply both files and check the frontend/backend contract explicitly.

## Repository Validation

Use the narrowest validation command that covers the change. For cross-layer changes, combine the relevant frontend checks from `src/AGENTS.md` with the relevant Rust/Tauri checks from `src-tauri/AGENTS.md`.

## Code Review Rules

- Prefer the closest `AGENTS.md` for detailed review rules. Root rules are only for repository-wide and cross-layer concerns.
- Flag frontend/backend contract drift, especially Tauri command names, DTO shapes, error payloads, lifecycle states, path validation, and persisted data schemas.
- Flag changes that weaken the local-first privacy model or move workspace, run history, benchmark, skill, agent-session, prompt, output, token, path, or environment data outside local user control.
- Flag changes that can break isolation between parallel agent runs, including shared mutable state, reused execution directories, mixed process metadata, or result artifacts written to the wrong run.
- Flag duplicated lifecycle, validation, path, or persistence business logic across `src/` and `src-tauri/` when one side can drift from the other.
- For maintainability and readability, avoid personal style feedback. Raise issues only when ambiguity, hidden side effects, excessive coupling, or unnecessary abstraction creates concrete correctness, onboarding, reviewability, or long-term maintenance risk.
