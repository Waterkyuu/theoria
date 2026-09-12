# Agent Adapter Rules

Read this file when changing agent adapters, process discovery, log decoding, file tailing, or child
process management.

- Give agent implementations a shared adapter trait and normalized event model. Platform and agent
  implementations must not calculate UI metrics independently.
- Keep discovery, decoding, normalization, and metric calculation as separate responsibilities.
- Prefer stable structured APIs and logs over terminal scraping. Version and fixture-test
  unavoidable scrapers, and support a degraded state when upstream formats change.
- Give source events a stable deduplication key, timestamp, source ID, adapter version, and an
  inference confidence when applicable.
- Tail files incrementally with persisted offsets; handle truncation, rotation, partial UTF-8,
  duplicates, restarts, and system sleep.
- Bound line length, event size, batch size, retained buffers, and concurrency.
- Never interpolate input into a shell command. Pass an allowlisted executable and arguments
  separately and validate discovered executable identities.
- Bound child output, apply a timeout, and terminate owned children during cancellation or shutdown.
- Never terminate, pause, or modify a monitored third-party agent unless the user explicitly starts
  a feature that requires it.
- Passive monitoring must not materially affect the monitored agent's runtime behavior.
