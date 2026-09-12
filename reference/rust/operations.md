# Rust Operations Rules

Read this file when changing logging, performance-sensitive code, dependencies, manifests, build
scripts, plugins, or configuration.

## Logging and Performance

- Use one structured logging facade; do not use `println!` or `dbg!` in runtime code.
- Log safe correlation fields and appropriate levels. Never log sensitive raw values.
- Aggregate high-frequency events and never let observability materially affect measured agents.
- Prefer event-driven observation. If polling is necessary, document its interval and resource
  budget and back off while idle.
- Do not run filesystem scans, migrations, or process enumeration on the UI thread.
- Stream and batch growing inputs; do not read complete growing logs into memory.
- Bound memory, event sizes, batches, and concurrency.
- Measure before caching. Every cache needs an invalidation rule and memory bound.
- Give performance-sensitive changes a repeatable benchmark or before-and-after measurement.

## Dependencies and Configuration

- Prefer the standard library and maintained crates with a narrow purpose. Do not add a dependency
  to avoid writing a small, well-tested pure function.
- Justify new dependencies and review licenses, maintenance, transitive cost, build scripts, enabled
  features, and platform support.
- Disable default features that add unused functionality or system access.
- Keep JavaScript and Rust Tauri package versions compatible.
- Commit `Cargo.lock` for this desktop application.
