# Theoria Agent Guidance

## Project Context

Theoria is a local-first desktop workspace for comparing AI coding agents. The frontend is TypeScript, React, Vite, and Tauri APIs. The desktop backend is Rust/Tauri and stores application records locally, including SQLite-backed state.

## Validation Commands

Use the narrowest command that covers the change, then expand when risk crosses frontend/backend boundaries.

- `pnpm lint` checks TypeScript and frontend lint rules.
- `pnpm format` checks repository formatting.
- `pnpm typecheck` checks TypeScript and Vite config types.
- `pnpm test` runs Vitest tests.
- `pnpm build` runs typecheck and Vite build.
- `pnpm tauri` is the entry point for Tauri commands when desktop integration needs validation.

## Code Review Rules

### Local-first data safety

- Flag changes that move workspace, run history, benchmark, skill, or agent-session data out of local storage without an explicit user-controlled export or sync path.
- Flag migrations or SQLite/state-shape changes that can drop, overwrite, or orphan existing local records without a compatibility or migration plan.
- Flag filesystem operations that can escape the selected workspace, follow untrusted paths, or delete user files without a clear confirmation boundary.

### Agent execution isolation

- Flag changes that let one agent run read or mutate another agent's isolated execution directory, session metadata, or result artifacts.
- Flag shared mutable state across parallel agent runs when it can corrupt status, token usage, tool-call logs, duration tracking, or final comparison results.
- Flag process-management changes that can leave child agent processes running after a stop/cancel action.

### Tauri and command boundaries

- Flag new or changed Tauri commands that expose filesystem, process, network, or database access without input validation and frontend call-site review.
- Flag frontend code that assumes a Tauri command cannot fail; user-visible operations should handle rejected promises and backend errors.
- Flag security-sensitive changes in `src-tauri` that broaden permissions, shell execution, path access, or platform-specific APIs without tests or justification.

### Frontend state and UX correctness

- Flag changes that can desynchronize visible agent status from persisted backend state, especially around streaming output, stop/retry, follow-up prompts, and benchmark runs.
- Flag async React Query/Jotai state changes that can show stale data after mutations or route transitions.
- Flag internationalized UI changes that add user-facing text without updating both English and Simplified Chinese paths when the surrounding feature is localized.

### Maintainability and readability

- Flag code that mixes unrelated responsibilities, such as UI rendering, persistence, process control, and validation in one function or component when it makes future changes risky.
- Flag unclear names for domain concepts like agents, runs, skills, benchmarks, workspaces, snapshots, sessions, and artifacts when the ambiguity can cause misuse.
- Flag duplicated business logic across frontend and Tauri/Rust layers when one side can drift from the other, especially lifecycle state transitions and path validation.
- Flag deeply nested conditionals, large components, or long functions when they obscure error handling, state transitions, or user-visible side effects.
- Flag abstractions that hide important side effects or make data ownership unclear, particularly around local files, SQLite records, child processes, and streaming output.
- Prefer comments that explain non-obvious invariants or cross-layer contracts; do not ask for comments that merely restate what code already says.
- Avoid personal style feedback. Only raise readability issues when they affect correctness, onboarding, reviewability, or long-term maintenance.

### Tests and verification

- For behavior changes in agent lifecycle, benchmark comparison, skill mounting, persistence, or Tauri commands, flag missing tests or manual validation notes.
- For pure styling or copy changes, avoid asking for broad tests unless the change affects layout-critical, localized, or stateful UI.
- Treat generated lockfile-only or asset-only changes as suspicious unless they are clearly tied to dependency or visual updates in the same PR.
