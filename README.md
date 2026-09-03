<div align="center">
  <img src="./assets/theoria.png" alt="Theoria" width="144" />

  <h1><img src="./assets/theoria-wordmark.svg" alt="Theoria" width="210" /></h1>

  <p><strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a></p>

  <p><strong>Put every AI agent on the same starting line</strong></p>
  <p>A local-first desktop workspace for parallel AI coding agents and reproducible evaluations</p>
  <p><strong>Privacy first. All data stays local, with application records stored in SQLite.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 7.0" />
    <img src="https://img.shields.io/badge/Rust-Stable-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust Stable" />
    <img src="https://img.shields.io/badge/Platform-Desktop-64748B?style=flat-square" alt="Desktop" />
  </p>

  <p>
    <a href="#product-preview">Product Preview</a> ·
    <a href="#highlights">Highlights</a>
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
      <a href="./assets/page4.png">
        <img src="./assets/page4.png" alt="Agent run board in Theoria" width="100%" />
      </a>
      <br />
      <sub>Monitor every Agent task at a glance with searchable lifecycle columns</sub>
    </td>
    <td width="50%" align="center">
      <a href="./assets/page5.png">
        <img src="./assets/page5.png" alt="Agent result summary in Theoria" width="100%" />
      </a>
      <br />
      <sub>Compare completion, latency, token usage, tool calls, and file changes side by side</sub>
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

> [!WARNING]
> This project is not yet complete and remains under active development.

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
| Local-first data | Keep workspaces on the local file system and persist application records in SQLite |
| Internationalization | Use the built-in Simplified Chinese and English interfaces with localized frontend and backend errors |
