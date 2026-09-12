# AGENTS.md

## Scope

Act as a senior Rust and Tauri backend engineer. These rules apply to everything under
`src-tauri/`.

AgentGauge monitors local AI agents. Treat process metadata, prompts, outputs, command arguments,
paths, repository names, tokens, and environment data as sensitive.

## Project Structure

```text
src-tauri/src/
├── main.rs          # Native entrypoint only
├── lib.rs           # Composition root
├── commands/        # Thin IPC handlers
├── dto/             # Serialized IPC contracts
├── domain/          # Entities and domain rules
├── services/        # Use cases and orchestration
├── adapters/        # External agent integrations
├── models/          # Database table definitions
├── repositories/    # Persistence interfaces and implementations
├── platform/        # macOS and Windows implementations
├── state/           # Tauri-managed state
├── error.rs         # Shared application and IPC errors
└── utils/           # Small helpers without domain ownership
```

Keep `main.rs` and `lib.rs` small, do not create empty layers, and preserve this dependency flow:

```text
commands -> services -> domain
                    -> repository and adapter traits
platform implementations -> repository or adapter traits
lib.rs -> concrete implementations and dependency wiring
```

## Progressive Disclosure

Before editing, read only the references relevant to the planned change. If the scope expands, read
the newly relevant reference before continuing.

| Change                                                                                | Required reference                 |
| ------------------------------------------------------------------------------------- | ---------------------------------- |
| Any Rust source, module boundary, type, function, or style                            | `reference/rust/core.md`           |
| Tauri commands, IPC DTOs, errors, managed state, async work, or channels              | `reference/rust/tauri-ipc.md`      |
| Agent adapters, process discovery, log decoding, tailing, or child processes          | `reference/rust/adapters.md`       |
| Filesystem, database, platform code, capabilities, permissions, privacy, or telemetry | `reference/rust/data-security.md`  |
| Logging, performance, dependencies, manifests, build scripts, or configuration        | `reference/rust/operations.md`     |
| Adding, changing, or deleting tests                                                   | `reference/rust/test-code-rule.md` |

Do not read unrelated references preemptively. Multiple references are required when a change
crosses multiple rows.

## Validation

After changing Rust code, run from the repository root in this order:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
cargo check --manifest-path src-tauri/Cargo.toml --all-targets --all-features
```

Also run `pnpm tauri build --no-bundle` after changing manifests, Tauri configuration,
capabilities, permissions, plugins, build scripts, or platform-specific code.

Fix failures caused by the change and rerun the full sequence. Do not suppress warnings. A narrow
`#[allow(...)]` requires a comment explaining why the lint is wrong at that location.

## Definition of Done

- Read every reference triggered by the final change scope.
- Keep architecture boundaries clear and permissions minimal.
- Validate inputs and keep errors typed and safe to expose.
- Bound data volumes and make async work cancellable and non-blocking.
- Redact sensitive data before it leaves its source boundary.
- Add deterministic tests for behavior changes and relevant failure paths.
- Pass the required validation commands and document contract, schema, migration, permission, or
  compatibility changes.
