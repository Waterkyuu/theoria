# Rust Core Rules

Read this file before changing Rust source under `src-tauri/`.

## Architecture

- Keep `main.rs` limited to starting the library entrypoint.
- Keep `lib.rs` as the composition root for state, plugins, commands, and lifecycle hooks.
- Keep Tauri types at IPC and composition boundaries. Domain and service modules must remain
  testable without a webview or application runtime.

## Naming and Visibility

- Follow standard Rust naming and use the narrowest visibility: private, then `pub(crate)`, then
  `pub` only at real crate or command boundaries.
- Use concrete business names. Do not use `resolve` or `normalized` in function or variable names;
  prefer precise verbs or state names such as `find`, `parse`, `load`, `map`, or `validate`.
- Avoid wildcard imports outside explicit preludes and clearly scoped test modules.
- Put behavior on its owning domain type or service instead of a generic `utils` function.

## Ownership and Types

- Model valid states with enums, newtypes, and validated constructors.
- Borrow at synchronous internal boundaries when ownership is unnecessary. Async Tauri commands
  should own inputs such as `String` and `PathBuf`.
- Reconsider ownership before cloning. Clone only for deliberate snapshots or task boundaries.
- Use `Path` and `PathBuf`; never construct paths by concatenating separators.
- Prefer standard conversion traits over ad hoc conversion methods.
- Derive useful traits on public and IPC types where semantically correct.
- Use explicit DTOs instead of `serde_json::Value`, except at genuinely dynamic adapter boundaries.
- Do not use `unsafe`. If a platform API requires it, isolate it under `platform`, document every
  safety invariant, and test the safe wrapper.

## Functions and Documentation

- Keep functions focused, prefer pure transformations, use early returns, and avoid boolean
  parameters when an enum communicates intent better.
- Do not extract short, single-use operations without reusable meaning.
- Comments explain decisions and invariants, not syntax.
- Every named or tuple `struct` field requires a field-level `///` comment, including private and
  test-only structs. Add rustdoc to public or reusable APIs and non-obvious command contracts.

## Readability

- When only one pattern matters, use `if let` instead of `match` with an empty fallback arm.
- When an iteration needs the collection index, use `.iter().enumerate()` instead of an index range
  or manual counter.
- Inside an `impl`, use `Self` in return types, constructors, and struct expressions unless the
  concrete type name is needed for clarity or disambiguation.
