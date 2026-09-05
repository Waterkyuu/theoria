import {
	LanguageDescription,
	LanguageSupport,
	StreamLanguage,
} from "@codemirror/language";

// Load local language modules only when their file type is opened; descriptions cache successful loads.
// Stream parsers cover highlighting without bundling the larger Rust, Go, and Java syntax trees.
const EDITOR_LANGUAGES = [
	LanguageDescription.of({
		name: "JavaScript",
		extensions: ["js", "mjs", "cjs"],
		load: async () =>
			(await import("@codemirror/lang-javascript")).javascript(),
	}),
	LanguageDescription.of({
		name: "JSX",
		extensions: ["jsx"],
		load: async () =>
			(await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
	}),
	LanguageDescription.of({
		name: "TypeScript",
		extensions: ["ts", "mts", "cts"],
		load: async () =>
			(await import("@codemirror/lang-javascript")).javascript({
				typescript: true,
			}),
	}),
	LanguageDescription.of({
		name: "TSX",
		extensions: ["tsx"],
		load: async () =>
			(await import("@codemirror/lang-javascript")).javascript({
				typescript: true,
				jsx: true,
			}),
	}),
	LanguageDescription.of({
		name: "JSON",
		extensions: ["json"],
		load: async () => (await import("@codemirror/lang-json")).json(),
	}),
	LanguageDescription.of({
		name: "Rust",
		extensions: ["rs"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/rust")).rust,
				),
			),
	}),
	LanguageDescription.of({
		name: "Go",
		extensions: ["go"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/go")).go,
				),
			),
	}),
	LanguageDescription.of({
		name: "Java",
		extensions: ["java"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/clike")).java,
				),
			),
	}),
	LanguageDescription.of({
		name: "Markdown",
		extensions: ["md", "markdown"],
		load: async () => (await import("@codemirror/lang-markdown")).markdown(),
	}),
];

export { EDITOR_LANGUAGES };
