# Benchmark result design QA

## Reference

- Source: `/var/folders/dw/6h20cl7n6nl2jl52_zffzqrw0000gn/T/codex-clipboard-5b3a2ef3-3308-4198-8d9a-98abf5316079.png`
- Source size: 1487 × 1058
- Implementation viewport: 1120 × 720
- Normalized comparison: source scaled to 835 px wide; implementation content cropped to 834 px wide

## Comparison history

### Iteration 1

- P1: HeroUI's primary table treatment rendered the Case row as a rounded card. Changed all benchmark tables to HeroUI `Table` with the secondary variant.
- P2: The pane ratio gave too little space to the comparison. Added a reusable split size option and set this view to 33% Case list and 67% detail.

### Iteration 2

- P2: The secondary table header still had rounded corners. Added one shared benchmark table override to keep headers flat.

### Iteration 3

- P2: Collapsing the workspace sidebar changed the split from 33%/67% to 50%/50%. The benchmark layout now preserves relative panel sizes when its container changes.

## Final review

- Layout: the result view follows the reference's two pane structure, selected Case row, comparison matrix, Agent tabs, tool call table, and Case requirements section.
- Components: every benchmark data table uses HeroUI `Table`; no native table markup remains in the benchmark view.
- Tool details: the table includes tool name, parameters, result, status, and duration. Historical runs without the new persisted fields show an unavailable value.
- Typography and spacing: hierarchy, density, dividers, and muted labels follow the existing Task page patterns.
- Color: status color is reserved for pass and failure states; surfaces remain flat and neutral.
- Responsive behavior: the tool detail table scrolls horizontally when the detail pane is narrower than its content.
- Assets: existing vector Agent icons are reused and remain sharp.
- Full comparison: `/tmp/theoria-design-qa-evidence/benchmark-full-comparison.png`
- Focused comparison: `/tmp/theoria-design-qa-evidence/benchmark-tool-comparison.png`

final result: passed
