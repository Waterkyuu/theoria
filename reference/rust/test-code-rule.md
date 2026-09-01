# Rust Test Code Rules

The purpose of a test is to protect observable behavior, a business rule, or an external contract
that could realistically regress. Tests are not written to increase coverage, mirror the source
code, or prove that Rust syntax and the type system work.

## Decide Whether a Test Is Worth Writing

Before adding a test, identify the exact regression it prevents. A test is justified when removing
it could allow at least one of the following to reach users or persisted data unnoticed:

- incorrect user-visible behavior or an incorrect IPC response;
- violation of a domain invariant or business rule;
- data loss, corruption, incompatible persistence, or a broken migration;
- incorrect parsing of an external or versioned protocol;
- a security, privacy, permission, path, process, or resource-boundary failure;
- an incorrect state transition, error path, cancellation path, or concurrency outcome;
- recurrence of a real bug that is not already covered by an existing test.

If none of these risks exists, do not add a test. If existing tests already fail for the relevant
regression, improve or reuse those tests instead of adding another one.

Use these three questions as the default gate:

- Could user-observable behavior break?
- Could business logic, data integrity, security, or privacy regress?
- Could a core product flow or external compatibility contract break?

If the answer to all three is no, do not write the test.

## Changes That Require Tests

Write or update focused tests for:

- new business behavior, validation rules, calculations, state transitions, or error handling;
- bug fixes, with a regression test that fails for the reported defect before the fix;
- parsers and adapters for external data, including meaningful malformed or partial input;
- persistence queries, migrations, pagination, ordering, uniqueness, and transaction behavior;
- IPC serialization when field names, optionality, variants, or compatibility contracts change;
- filesystem and process behavior where platform differences or hostile input matter;
- concurrency, retry, timeout, cancellation, deduplication, and bounded-resource logic;
- refactors that expose a previously untested observable risk.

Test the smallest public or module-level behavior that demonstrates the requirement. Cover only
branches with distinct business outcomes; do not mechanically create one test per code branch.

## Changes That Normally Do Not Need New Tests

Do not add tests solely for:

- renaming, moving, re-exporting, or deduplicating code without changing behavior;
- formatting, comments, logging text, documentation, imports, or lint-only changes;
- enum variant existence, derives, type aliases, visibility, or module layout;
- constants whose values have no independent business rule;
- trivial getters, setters, constructors that only assign fields, or direct delegation wrappers;
- one arbitrary happy-path constant or enum-to-string mapping;
- private function call counts, internal collection choice, exact helper boundaries, or other
  implementation details;
- behavior guaranteed by Rust, Serde, Tauri, the standard library, or a dependency itself;
- compile failures manufactured only to satisfy a red-green-refactor ritual;
- code already adequately protected by a higher-level repository, service, command, or contract
  test.

A stable identifier mapping may deserve a test only when it is an external compatibility contract
and is not already exercised at the persistence or IPC boundary. In that case, test the complete
contract or the relevant round trip, not one hand-picked value.

## Workflow

For new behavior and bug fixes:

1. Write the smallest test that expresses the missing behavior or regression.
2. Run it and confirm that it fails for the intended reason.
3. Implement the minimum production change.
4. Run the focused test, then the relevant suite.
5. Refactor only while the tests remain green.

For behavior-preserving refactors, run the relevant existing tests before and after the change.
Do not invent a new test merely to create a failing red step. Add a test only if the risk assessment
above reveals an observable behavior that was not already protected.

## Test Design Requirements

- Name the behavior and expected outcome, not the function under test.
- Assert observable outputs, state, persisted records, emitted contracts, or owned side effects.
- Keep each test focused on one meaningful scenario.
- Prefer real domain values and small fixtures. Use a fake only at an actual external boundary.
- Do not add test-only branches or public APIs to production code.
- Avoid snapshots for small typed values; assert the important contract fields directly.
- Do not assert exact error prose unless the text is a stable user-facing contract. Prefer typed
  error variants or machine-readable codes.
- Make tests deterministic and independent of execution order, wall-clock timing, the network, the
  developer's home directory, or locally installed applications and services.
- Use temporary directories and owned resources for filesystem and process tests.
- A test must fail when its protected behavior is broken. Delete or rewrite tests that cannot catch
  a realistic regression.

## Limit the Number of Tests

Write the minimum set of scenarios needed to protect the behavior. As a default, keep a focused
unit or command behavior to no more than three to five core tests.

Add more only when distinct risk remains, such as:

- separate business branches with different outcomes;
- a previously reported regression;
- security, privacy, persistence, or migration behavior;
- a parser compatibility matrix with meaningfully different inputs;
- a state machine, concurrency flow, or asynchronous lifecycle with distinct terminal states.

Do not multiply tests by enum variants, input permutations, or implementation branches when those
cases have the same behavior and risk.

## Rust and Tauri Placement

- Put unit tests beside the module in `#[cfg(test)] mod tests`.
- Put black-box crate tests in `src-tauri/tests/`.
- Put shared external-protocol fixtures in `src-tauri/tests/fixtures/` and version them when the
  upstream format is versioned.
- Domain and service tests must run without starting Tauri.
- Test IPC DTOs at the serialization boundary and keep domain tests independent of Tauri types.
- Use platform-gated tests only for genuinely operating-system-specific behavior; keep portable
  contract tests for shared behavior.
