import { expect, it } from "vitest";
import { getFileIconName } from "./file-icon";

it.each([
	["src/index.js", "javascript"],
	["src/index.ts", "typescript"],
	["src/App.jsx", "react"],
	["src/App.tsx", "react_ts"],
	["src/App.vue", "vue"],
	["src/App.svelte", "svelte"],
	["src/index.astro", "astro"],
	["src/app.component.ts", "angular"],
	["types/api.d.ts", "typescript-def"],
	["src/main.rs", "rust"],
	["src/main.go", "go"],
	["Main.java", "java"],
	["SKILL.md", "markdown"],
	["config.JSON", "json"],
	["scripts/build.py", "python"],
	["styles/main.scss", "sass"],
	["next.config.ts", "next"],
	["nuxt.config.ts", "nuxt"],
	["vite.config.ts", "vite"],
	["package.json", "nodejs"],
	["pnpm-lock.yaml", "pnpm"],
	["Cargo.toml", "rust"],
	["go.mod", "go-mod"],
	["deploy/Dockerfile.dev", "docker"],
	["scripts/.bashrc", "console"],
	[".gitignore", "git"],
	["notes.unknown", "file"],
	["README", "file"],
	["constructor", "file"],
	["notes.__proto__", "file"],
	["folder.ts/notes", "file"],
])("matches %s to its file type", (path, icon) => {
	expect(getFileIconName(path)).toBe(icon);
});
