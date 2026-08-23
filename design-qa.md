# Design QA: theoria workspace shell

## Target

- Reference: `/Users/waterkyuu/.codex/generated_images/01a02e64-fda9-7ff2-b324-3a69c3277b3c/exec-cda69ae3-e777-4886-8612-f0c1f3ec8b85.png`
- Prototype viewport: 1120 × 720
- Comparison artifact: `/tmp/theoria-sidebar-comparison.png`

## Verified states

- Workspace tree uses three visible ownership levels: Workspace, collection, and record.
- Tree guide lines, chevrons, icons, labels, and counts remain aligned in the 288px desktop sidebar.
- Global navigation remains fixed above the independently scrolling Workspace list.
- App Settings remains fixed below the Workspace list.
- Composer opens Agent autocomplete after `/`, adds a running Agent, switches to Benchmark mode, and opens the Agent environment panel.
- Benchmark mode explains isolated Workspace snapshots before submission.

## Visual corrections made during QA

- Replaced unresolved semantic spacing classes on the floating environment controls with explicit desktop offsets.
- Reduced Composer width to preserve a dedicated lower-right environment-control area.
- Rechecked the expanded conversation hierarchy beside the selected reference.

## Result

Final result: passed.
