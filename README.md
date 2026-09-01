<div align="center">
  <img src="./assets/theoria.png" alt="Theoria" width="144" />

  <h1>Theoria</h1>

  <p><strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a></p>

  <p><strong>Put every AI agent on the same starting line</strong></p>
  <p>A local-first desktop workspace for parallel AI coding agents and reproducible evaluations</p>

  <p>
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8" />
    <img src="https://img.shields.io/badge/Rust-Stable-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust Stable" />
    <img src="https://img.shields.io/badge/Platform-Desktop-64748B?style=flat-square" alt="Desktop" />
  </p>

  <p>
    <a href="#product-preview">Product Preview</a> ·
    <a href="#highlights">Highlights</a> ·
    <a href="#development">Development</a>
  </p>
</div>

---

## Product Preview

<table>
  <tr>
    <td colspan="2" align="center">
      <a href="./assets/page1.png">
        <img src="./assets/page1.png" alt="Parallel agent runs in Theoria" width="100%" />
      </a>
      <br />
      <sub>Run multiple agents on the same task and follow their status, responses, and tool calls in real time</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="./assets/page2.png">
        <img src="./assets/page2.png" alt="Skill management in Theoria" width="100%" />
      </a>
      <br />
      <sub>Manage skills centrally and mount them into workspaces</sub>
    </td>
    <td width="50%" align="center">
      <a href="./assets/page3.png">
        <img src="./assets/page3.png" alt="Benchmark management in Theoria" width="100%" />
      </a>
      <br />
      <sub>Organize reproducible benchmark comparisons</sub>
    </td>
  </tr>
</table>

## About Theoria

Theoria is a desktop workspace for AI coding agents. It gives every selected agent the same workspace snapshot and an isolated execution directory, allowing Codex, Claude Code, OpenCode, and WorkBuddy to solve one task in parallel while their progress, results, and file changes remain easy to compare.

It supports everyday multi-agent development workflows and provides consistent environments, run history, and skill configuration for repeatable capability evaluations.

> Note: This project is not yet complete and remains under active development.

## Highlights

| Capability | Description |
| --- | --- |
| Parallel agents | Run up to six agents on one task, including Codex, Claude Code, OpenCode, and WorkBuddy |
| Isolated execution | Start from an immutable workspace snapshot and give each agent its own working directory |
| Observable progress | Follow status, streaming output, tool calls, token usage, and duration; stop one agent or all of them |
| Continued collaboration | Preserve agent sessions and send follow-up prompts to every agent or a selected subset |
| Result comparison | Collect final responses and file changes, then persist run history for later review |
| Skill management | Manage skills from local or Git sources and mount them into one or more workspaces |
| Benchmark workflows | Organize reproducible comparisons around fixed snapshots, test cases, and selected agents |
| Local-first data | Keep workspaces, task history, and evaluation data on the local machine through Tauri |
| Internationalization | Use the built-in Simplified Chinese and English interfaces with localized frontend and backend errors |

## Development

### Commands

| Command | Purpose |
| --- | --- |
| `pnpm tauri dev` | Start the Tauri desktop development environment |
| `pnpm dev` | Start only the Vite frontend development server |
| `pnpm test` | Run the Vitest test suite |
| `pnpm test:coverage` | Generate frontend test coverage |
| `pnpm typecheck` | Check frontend and Node configuration types |
| `pnpm check` | Run Biome formatting and code checks |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Check the Rust backend |
| `pnpm build` | Type-check and build the frontend |

Run the complete check suite before committing:

```bash
pnpm check
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```
