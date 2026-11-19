# Theoria Benchmark template

This folder is a complete importable Benchmark example. In the Benchmark catalog, choose **Import folder** and select this directory, then assign a local Tag before creating the draft.

The example asks every selected Agent to summarize `orders.json` into `summary.json`. It demonstrates:

- a public starting file under `files/`;
- a built-in structural JSON check;
- a private Python validator with the fixed `validate(workspace)` entrypoint.

The Python validator returns only the documented public report shape. It receives the finished execution workspace as a `pathlib.Path`; it is not copied into the Agent's starting files.

## Python verifier environment

Python checks use the same Docker sandbox on Windows, macOS, and Linux. Start a Linux-container
Docker engine and pull the fixed verifier image once with `docker pull python:3.13.18-slim`.
Theoria probes the actual engine and image; it does not disable verification based on host OS.
Validators run with networking disabled, read-only mounts, and bounded CPU, memory, and runtime.

CI builds and runs Rust tests on all three desktop operating systems. Linux additionally runs the
real container isolation and publication tests; the shared engine invocation contract is tested
on every host.

## Experiment configuration

Run configuration is separate from the published benchmark. The launch form accepts exact model
and reasoning settings, a comma-separated subset of one-based case numbers, and 1–10 independent
trials per case and configuration. Multiple configurations can use the same agent product. An
empty model or mode inherits local settings and remains unknown in the snapshot; specify both
for reproducible comparisons. Native CLI versions are not pinned by Theoria.

Each trial starts with a fresh workspace. Repetitions are independent measurements, not retries,
and every result contributes to the aggregate. Completed scores are preserved after an application
restart. **Resume unfinished trials** restarts only interrupted trials under the original plan;
**Rerun** creates a new experiment. User-cancelled runs are not resumed automatically.

## Public benchmark references

Choose **Add new → Add public benchmark**, select a tag and a supported release, and enter exact
upstream task names. Theoria stores references to upstream tasks instead of replacing their
instructions, environments, or tests with local answer checks. Mount the published reference to a
workspace to configure and run it.

Supported initial releases:

- `terminal-bench@2.0` through Harbor `0.26.0`.
- `swebench-verified@1.0` through Harbor's SWE-bench adapter and verifier.

Public references currently accept up to 100 explicitly selected tasks. They are subset
experiments, not official full-dataset leaderboard scores. Use the upstream task identifiers;
Theoria does not download and browse the full task catalog in this release.

Install the pinned runner with `uv tool install harbor==0.26.0`, start Docker, and configure
credentials supported by the selected Harbor agent. A host CLI login does not establish container
credentials. Preflight checks Harbor's version and Docker separately from native agent logins.

Each execution owns a single-trial Harbor job with automatic retries disabled. Harbor manages its
container and verifier. Theoria retains the job under its application-owned execution directory,
imports the original numeric rewards, records the observed CLI/model metadata, and copies bounded
regular-file artifacts into the result view. Credentials and exception tracebacks are excluded from
Theoria's imported summary. Original job files remain local to Harbor's managed directory.

A completed upstream result can be imported after a restart; a partially completed job is resumed
using Harbor's own resume command. Cancellation signals the owned runner and allows it to clean up
its container before a forced process stop. Container cleanup after forced termination still depends
on Docker and Harbor completing their shutdown; inspect the owned job if shutdown was interrupted.

The result view shows pass rate, error categories, duration, tokens, provider-reported USD cost,
measurement coverage, each repetition, and available artifacts. Missing measurements are shown as
unknown. External duration includes setup and verification, so compare it only with runs using the
same protocol. Infrastructure and verifier errors leave the aggregate score incomplete.
