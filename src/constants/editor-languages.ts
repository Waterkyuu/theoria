import {
	LanguageDescription,
	LanguageSupport,
	StreamLanguage,
} from "@codemirror/language";

// Load local language modules only when their file type is opened; descriptions cache successful loads.
// Stream parsers keep additional language highlighting compact without requiring full syntax trees.
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
	LanguageDescription.of({
		name: "Python",
		extensions: ["py", "pyw", "pyi"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/python")).python,
				),
			),
	}),
	LanguageDescription.of({
		name: "Shell",
		extensions: ["sh", "bash", "zsh", "ksh"],
		filename: /(?:^|\/)\.(?:bashrc|bash_profile|zshrc|zprofile|profile)$/,
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/shell")).shell,
				),
			),
	}),
	LanguageDescription.of({
		name: "YAML",
		extensions: ["yaml", "yml"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/yaml")).yaml,
				),
			),
	}),
	LanguageDescription.of({
		name: "TOML",
		extensions: ["toml"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/toml")).toml,
				),
			),
	}),
	LanguageDescription.of({
		name: "SQL",
		extensions: ["sql"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/sql")).standardSQL,
				),
			),
	}),
	LanguageDescription.of({
		name: "C",
		extensions: ["c", "h"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/clike")).c,
				),
			),
	}),
	LanguageDescription.of({
		name: "C++",
		extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/clike")).cpp,
				),
			),
	}),
	LanguageDescription.of({
		name: "C#",
		extensions: ["cs"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/clike")).csharp,
				),
			),
	}),
	LanguageDescription.of({
		name: "Ruby",
		extensions: ["rb", "rake", "gemspec"],
		filename: /(?:^|\/)(?:gemfile|rakefile)$/,
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/ruby")).ruby,
				),
			),
	}),
	LanguageDescription.of({
		name: "Swift",
		extensions: ["swift"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/swift")).swift,
				),
			),
	}),
	LanguageDescription.of({
		name: "Kotlin",
		extensions: ["kt", "kts"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/clike")).kotlin,
				),
			),
	}),
	LanguageDescription.of({
		name: "Lua",
		extensions: ["lua"],
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/lua")).lua,
				),
			),
	}),
	LanguageDescription.of({
		name: "Dockerfile",
		extensions: ["dockerfile"],
		filename: /(?:^|\/)(?:dockerfile|containerfile)(?:\.[^/]+)?$/,
		load: async () =>
			new LanguageSupport(
				StreamLanguage.define(
					(await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile,
				),
			),
	}),
	LanguageDescription.of({
		name: "HTML",
		extensions: ["html", "htm"],
		load: async () => (await import("@codemirror/lang-html")).html(),
	}),
	LanguageDescription.of({
		name: "CSS",
		extensions: ["css"],
		load: async () => (await import("@codemirror/lang-css")).css(),
	}),
	LanguageDescription.of({
		name: "PHP",
		extensions: ["php", "phtml", "php3", "php4", "php5"],
		load: async () => (await import("@codemirror/lang-php")).php(),
	}),
];

export { EDITOR_LANGUAGES };
