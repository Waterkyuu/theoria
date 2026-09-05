import icon_angular from "material-icon-theme/icons/angular.svg?no-inline";
import icon_astro from "material-icon-theme/icons/astro.svg?no-inline";
import icon_c from "material-icon-theme/icons/c.svg?no-inline";
import icon_clojure from "material-icon-theme/icons/clojure.svg?no-inline";
import icon_cmake from "material-icon-theme/icons/cmake.svg?no-inline";
import icon_console from "material-icon-theme/icons/console.svg?no-inline";
import icon_cpp from "material-icon-theme/icons/cpp.svg?no-inline";
import icon_csharp from "material-icon-theme/icons/csharp.svg?no-inline";
import icon_css from "material-icon-theme/icons/css.svg?no-inline";
import icon_dart from "material-icon-theme/icons/dart.svg?no-inline";
import icon_database from "material-icon-theme/icons/database.svg?no-inline";
import icon_docker from "material-icon-theme/icons/docker.svg?no-inline";
import icon_elixir from "material-icon-theme/icons/elixir.svg?no-inline";
import icon_eslint from "material-icon-theme/icons/eslint.svg?no-inline";
import icon_file from "material-icon-theme/icons/file.svg?no-inline";
import icon_git from "material-icon-theme/icons/git.svg?no-inline";
import icon_go from "material-icon-theme/icons/go.svg?no-inline";
import icon_go_mod from "material-icon-theme/icons/go-mod.svg?no-inline";
import icon_graphql from "material-icon-theme/icons/graphql.svg?no-inline";
import icon_html from "material-icon-theme/icons/html.svg?no-inline";
import icon_java from "material-icon-theme/icons/java.svg?no-inline";
import icon_javascript from "material-icon-theme/icons/javascript.svg?no-inline";
import icon_json from "material-icon-theme/icons/json.svg?no-inline";
import icon_kotlin from "material-icon-theme/icons/kotlin.svg?no-inline";
import icon_less from "material-icon-theme/icons/less.svg?no-inline";
import icon_lua from "material-icon-theme/icons/lua.svg?no-inline";
import icon_markdown from "material-icon-theme/icons/markdown.svg?no-inline";
import icon_next from "material-icon-theme/icons/next.svg?no-inline";
import icon_next_light from "material-icon-theme/icons/next_light.svg?no-inline";
import icon_nodejs from "material-icon-theme/icons/nodejs.svg?no-inline";
import icon_npm from "material-icon-theme/icons/npm.svg?no-inline";
import icon_nuxt from "material-icon-theme/icons/nuxt.svg?no-inline";
import icon_php from "material-icon-theme/icons/php.svg?no-inline";
import icon_pnpm from "material-icon-theme/icons/pnpm.svg?no-inline";
import icon_pnpm_light from "material-icon-theme/icons/pnpm_light.svg?no-inline";
import icon_prettier from "material-icon-theme/icons/prettier.svg?no-inline";
import icon_prisma from "material-icon-theme/icons/prisma.svg?no-inline";
import icon_python from "material-icon-theme/icons/python.svg?no-inline";
import icon_react from "material-icon-theme/icons/react.svg?no-inline";
import icon_react_ts from "material-icon-theme/icons/react_ts.svg?no-inline";
import icon_ruby from "material-icon-theme/icons/ruby.svg?no-inline";
import icon_rust from "material-icon-theme/icons/rust.svg?no-inline";
import icon_sass from "material-icon-theme/icons/sass.svg?no-inline";
import icon_scala from "material-icon-theme/icons/scala.svg?no-inline";
import icon_settings from "material-icon-theme/icons/settings.svg?no-inline";
import icon_svelte from "material-icon-theme/icons/svelte.svg?no-inline";
import icon_swift from "material-icon-theme/icons/swift.svg?no-inline";
import icon_tailwindcss from "material-icon-theme/icons/tailwindcss.svg?no-inline";
import icon_toml from "material-icon-theme/icons/toml.svg?no-inline";
import icon_toml_light from "material-icon-theme/icons/toml_light.svg?no-inline";
import icon_typescript from "material-icon-theme/icons/typescript.svg?no-inline";
import icon_typescript_def from "material-icon-theme/icons/typescript-def.svg?no-inline";
import icon_vite from "material-icon-theme/icons/vite.svg?no-inline";
import icon_vitest from "material-icon-theme/icons/vitest.svg?no-inline";
import icon_vue from "material-icon-theme/icons/vue.svg?no-inline";
import icon_webpack from "material-icon-theme/icons/webpack.svg?no-inline";
import icon_xml from "material-icon-theme/icons/xml.svg?no-inline";
import icon_yaml from "material-icon-theme/icons/yaml.svg?no-inline";
import icon_yarn from "material-icon-theme/icons/yarn.svg?no-inline";

// Explicit asset imports keep unused icons and the theme manifest out of production builds.
const FILE_TYPE_ICONS = {
	file: icon_file,
	javascript: icon_javascript,
	typescript: icon_typescript,
	"typescript-def": icon_typescript_def,
	react: icon_react,
	react_ts: icon_react_ts,
	vue: icon_vue,
	svelte: icon_svelte,
	angular: icon_angular,
	astro: icon_astro,
	next: icon_next,
	nuxt: icon_nuxt,
	vite: icon_vite,
	vitest: icon_vitest,
	webpack: icon_webpack,
	nodejs: icon_nodejs,
	npm: icon_npm,
	pnpm: icon_pnpm,
	yarn: icon_yarn,
	rust: icon_rust,
	go: icon_go,
	"go-mod": icon_go_mod,
	java: icon_java,
	markdown: icon_markdown,
	json: icon_json,
	python: icon_python,
	console: icon_console,
	yaml: icon_yaml,
	toml: icon_toml,
	html: icon_html,
	css: icon_css,
	sass: icon_sass,
	less: icon_less,
	cpp: icon_cpp,
	c: icon_c,
	csharp: icon_csharp,
	php: icon_php,
	ruby: icon_ruby,
	swift: icon_swift,
	kotlin: icon_kotlin,
	lua: icon_lua,
	docker: icon_docker,
	scala: icon_scala,
	dart: icon_dart,
	xml: icon_xml,
	cmake: icon_cmake,
	database: icon_database,
	git: icon_git,
	settings: icon_settings,
	graphql: icon_graphql,
	prisma: icon_prisma,
	elixir: icon_elixir,
	clojure: icon_clojure,
	eslint: icon_eslint,
	prettier: icon_prettier,
	tailwindcss: icon_tailwindcss,
};

type FileIconName = keyof typeof FILE_TYPE_ICONS;

const FILE_ICON_COLORS: Partial<Record<FileIconName, string>> = {
	markdown: "#16a34a",
};

const FILE_ICON_LIGHT_VARIANTS: Partial<Record<FileIconName, string>> = {
	next: icon_next_light,
	pnpm: icon_pnpm_light,
	toml: icon_toml_light,
};

const FILE_ICON_EXTENSIONS = new Map<string, FileIconName>([
	["js", "javascript"],
	["mjs", "javascript"],
	["cjs", "javascript"],
	["ts", "typescript"],
	["mts", "typescript"],
	["cts", "typescript"],
	["d.ts", "typescript-def"],
	["d.mts", "typescript-def"],
	["d.cts", "typescript-def"],
	["jsx", "react"],
	["tsx", "react_ts"],
	["vue", "vue"],
	["svelte", "svelte"],
	["component.ts", "angular"],
	["component.html", "angular"],
	["service.ts", "angular"],
	["directive.ts", "angular"],
	["pipe.ts", "angular"],
	["guard.ts", "angular"],
	["module.ts", "angular"],
	["astro", "astro"],
	["rs", "rust"],
	["go", "go"],
	["java", "java"],
	["class", "java"],
	["jar", "java"],
	["md", "markdown"],
	["markdown", "markdown"],
	["mdx", "markdown"],
	["json", "json"],
	["jsonc", "json"],
	["json5", "json"],
	["py", "python"],
	["pyw", "python"],
	["pyi", "python"],
	["sh", "console"],
	["bash", "console"],
	["zsh", "console"],
	["ksh", "console"],
	["ps1", "console"],
	["bat", "console"],
	["cmd", "console"],
	["yaml", "yaml"],
	["yml", "yaml"],
	["toml", "toml"],
	["html", "html"],
	["htm", "html"],
	["css", "css"],
	["scss", "sass"],
	["sass", "sass"],
	["less", "less"],
	["cpp", "cpp"],
	["cc", "cpp"],
	["cxx", "cpp"],
	["hpp", "cpp"],
	["hh", "cpp"],
	["hxx", "cpp"],
	["c", "c"],
	["h", "c"],
	["cs", "csharp"],
	["csx", "csharp"],
	["php", "php"],
	["phtml", "php"],
	["rb", "ruby"],
	["rake", "ruby"],
	["gemspec", "ruby"],
	["swift", "swift"],
	["kt", "kotlin"],
	["kts", "kotlin"],
	["lua", "lua"],
	["dockerfile", "docker"],
	["scala", "scala"],
	["sc", "scala"],
	["dart", "dart"],
	["xml", "xml"],
	["svg", "xml"],
	["xsd", "xml"],
	["cmake", "cmake"],
	["sql", "database"],
	["sqlite", "database"],
	["db", "database"],
	["graphql", "graphql"],
	["gql", "graphql"],
	["prisma", "prisma"],
	["ex", "elixir"],
	["exs", "elixir"],
	["clj", "clojure"],
	["cljs", "clojure"],
	["cljc", "clojure"],
	["edn", "clojure"],
]);

const FILE_ICON_FILENAMES = new Map<string, FileIconName>([
	["package.json", "nodejs"],
	["package-lock.json", "npm"],
	["pnpm-lock.yaml", "pnpm"],
	["pnpm-workspace.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["cargo.toml", "rust"],
	["cargo.lock", "rust"],
	["go.mod", "go-mod"],
	["go.sum", "go-mod"],
	["cmakelists.txt", "cmake"],
	["angular.json", "angular"],
	["tsconfig.json", "typescript-def"],
	["jsconfig.json", "javascript"],
	[".gitignore", "git"],
	[".gitattributes", "git"],
	[".gitmodules", "git"],
	[".bashrc", "console"],
	[".bash_profile", "console"],
	[".zshrc", "console"],
	[".zprofile", "console"],
	[".profile", "console"],
	[".env", "settings"],
	[".prettierrc", "prettier"],
	[".eslintrc", "eslint"],
	["gemfile", "ruby"],
	["rakefile", "ruby"],
]);

const FILE_ICON_CONFIGS = new Map<string, FileIconName>([
	["next", "next"],
	["nuxt", "nuxt"],
	["vite", "vite"],
	["vitest", "vitest"],
	["webpack", "webpack"],
	["svelte", "svelte"],
	["astro", "astro"],
	["eslint", "eslint"],
	["prettier", "prettier"],
	["tailwindcss", "tailwindcss"],
	["tailwind", "tailwindcss"],
	["vue", "vue"],
	["angular", "angular"],
]);

export type { FileIconName };
export {
	FILE_ICON_COLORS,
	FILE_ICON_CONFIGS,
	FILE_ICON_EXTENSIONS,
	FILE_ICON_FILENAMES,
	FILE_ICON_LIGHT_VARIANTS,
	FILE_TYPE_ICONS,
};
