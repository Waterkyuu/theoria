# Tauri IPC and Concurrency Rules

Read this file when changing commands, IPC types, errors, managed state, async tasks, or channels.

## Errors

- Return typed `Result<T, E>` errors and preserve their sources. Do not return `Result<T, String>`
  below a framework compatibility boundary.
- Do not use `unwrap()` or `expect()` in runtime paths. Startup-only `expect()` is allowed when
  startup cannot continue and its message identifies the failed invariant.
- Never discard errors with `let _ = ...`; handle, propagate, log, or document why ignoring one is
  safe.
- Convert internal errors at the command boundary to stable IPC errors containing a code and a safe
  user-facing message. Never expose raw system errors, SQL, paths, prompts, arguments, secrets, or
  stack traces.
- Add safe operational context when errors cross boundaries.

## Commands and IPC

- Keep commands thin: validate the request, obtain managed state, call one service method, and map
  the response. Command names must be globally unique.
- Revalidate all frontend input and bound lengths, counts, ranges, paths, allocations, and payloads.
- Use typed request and response DTOs with `#[serde(rename_all = "camelCase")]`.
- Register all commands in one `tauri::generate_handler![...]` invocation.
- Use request-response commands for returned results, targeted events for small notifications, and
  Tauri channels for ordered or high-volume streams.
- Never use webview JavaScript evaluation for application data flow. Store large data locally and
  return identifiers, pagination, or summaries.

## State and Concurrency

- Register long-lived dependencies with `tauri::Builder::manage`; access `tauri::State` only at the
  command boundary.
- Prefer immutable state. Document the owner and synchronization strategy of shared mutable state.
- Use `Arc` only for genuine shared ownership.
- Never hold a `Mutex` or `RwLock` guard across `.await`. Use async-aware synchronization for async
  state and standard locks only for short, synchronous critical sections.
- Move blocking or CPU-heavy work off the async executor.
- Use bounded channels and buffers. Every spawned task needs an owner, shutdown signal, and
  observable failure path.
- Apply timeouts to external work. Retry only transient failures with bounded backoff and jitter;
  never retry validation, authorization, or permanent errors.
