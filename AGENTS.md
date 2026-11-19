# Theoria Agent Coding Guidance

TSX & TS: src/AGENTS.md
Rust: src-tauri/AGENTS.md

## Core shared coding rules

- Keep code formatting clean and consistent, with minimal repetition and no over-engineering.
- Do not over-abstract or split cohesive logic into unnecessary functions, modules, traits, or layers.
- Do not extract single-use trivial expressions, constant-returning functions, or wrappers that only forward arguments. Prefer the direct expression or an existing language/framework default mechanism.
- Extract code only when it reuses meaningful logic, isolates a real boundary, or makes complex behavior easier to understand and test.
- Do not add speculative compatibility paths, redundant type or state checks, repeated validation, silent fallbacks, or multiple defensive branches for states that existing contracts already exclude.
- Validate untrusted inputs and real filesystem, process, database, and network boundaries once at the owning boundary. Keep necessary error handling explicit; do not hide failures with fabricated defaults.
- Solve the current requirement with the smallest clear implementation. Do not introduce generic factories, configuration frameworks, or extension points for hypothetical future needs.
