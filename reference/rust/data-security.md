# Data, Platform, and Security Rules

Read this file when changing filesystem or database access, platform code, Tauri capabilities,
permissions, privacy, exports, or telemetry.

## Filesystem and Persistence

- Store data in a Tauri-resolved application data directory, never an assumed working directory.
- Treat external paths as untrusted. Restrict access to an allowed root and prevent traversal or
  symlink escape. State the symlink policy at each adapter boundary.
- Use atomic writes and database transactions; parameterize every query.
- Version schemas and metric rules. Migrations must be forward-safe, fixture-tested, and
  non-destructive.
- Store timestamps in UTC and durations as integer units identified by the field name or type.
- Paginate list queries and index frequently filtered fields.

## Cross-Platform Behavior

- Treat macOS and Windows as first-class. Put OS differences behind traits in `platform/macos` and
  `platform/windows`; keep `#[cfg(...)]` near implementations.
- Never hardcode separators, drive letters, `$HOME`, `%APPDATA%`, shell commands, or assumptions
  that process IDs and executable names uniquely identify sessions.
- Normalize platform observations into common domain types.
- Add platform-specific tests or fixtures for paths, permissions, process output, log rotation,
  encoding, and timestamps when relevant.
- Represent unavailable platform metrics explicitly instead of using `0` or fabricated estimates.

## Security and Privacy

- Follow least privilege. Scope Tauri capabilities to exact windows, paths, URLs, and commands; do
  not grant wildcards for convenience or expose local capabilities to remote origins without an
  approved threat model.
- Review capabilities, custom permissions, CSP, and plugin features together when adding system or
  IPC access.
- Do not read credentials, environment values, SSH keys, browser storage, or unrelated directories
  during discovery.
- Redact secrets, prompts, outputs, arguments, usernames, paths, and tokens before logging,
  persistence, events, or exports.
- Enforce privacy modes before persistence and allowlist exported fields; do not serialize internal
  structs wholesale.
- Telemetry and network transmission must be explicitly opt-in and must not reuse consent granted
  for local collection.
