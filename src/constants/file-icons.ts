import angularIcon from "material-icon-theme/icons/angular.svg?no-inline";
import astroIcon from "material-icon-theme/icons/astro.svg?no-inline";
import cIcon from "material-icon-theme/icons/c.svg?no-inline";
import clojureIcon from "material-icon-theme/icons/clojure.svg?no-inline";
import cmakeIcon from "material-icon-theme/icons/cmake.svg?no-inline";
import consoleIcon from "material-icon-theme/icons/console.svg?no-inline";
import cppIcon from "material-icon-theme/icons/cpp.svg?no-inline";
import csharpIcon from "material-icon-theme/icons/csharp.svg?no-inline";
import cssIcon from "material-icon-theme/icons/css.svg?no-inline";
import dartIcon from "material-icon-theme/icons/dart.svg?no-inline";
import databaseIcon from "material-icon-theme/icons/database.svg?no-inline";
import dockerIcon from "material-icon-theme/icons/docker.svg?no-inline";
import elixirIcon from "material-icon-theme/icons/elixir.svg?no-inline";
import eslintIcon from "material-icon-theme/icons/eslint.svg?no-inline";
import fileIcon from "material-icon-theme/icons/file.svg?no-inline";
import gitIcon from "material-icon-theme/icons/git.svg?no-inline";
import goIcon from "material-icon-theme/icons/go.svg?no-inline";
import goModIcon from "material-icon-theme/icons/go-mod.svg?no-inline";
import graphqlIcon from "material-icon-theme/icons/graphql.svg?no-inline";
import htmlIcon from "material-icon-theme/icons/html.svg?no-inline";
import javaIcon from "material-icon-theme/icons/java.svg?no-inline";
import javascriptIcon from "material-icon-theme/icons/javascript.svg?no-inline";
import jsonIcon from "material-icon-theme/icons/json.svg?no-inline";
import kotlinIcon from "material-icon-theme/icons/kotlin.svg?no-inline";
import lessIcon from "material-icon-theme/icons/less.svg?no-inline";
import luaIcon from "material-icon-theme/icons/lua.svg?no-inline";
import markdownIcon from "material-icon-theme/icons/markdown.svg?no-inline";
import nextIcon from "material-icon-theme/icons/next.svg?no-inline";
import nextLightIcon from "material-icon-theme/icons/next_light.svg?no-inline";
import nodejsIcon from "material-icon-theme/icons/nodejs.svg?no-inline";
import npmIcon from "material-icon-theme/icons/npm.svg?no-inline";
import nuxtIcon from "material-icon-theme/icons/nuxt.svg?no-inline";
import phpIcon from "material-icon-theme/icons/php.svg?no-inline";
import pnpmIcon from "material-icon-theme/icons/pnpm.svg?no-inline";
import pnpmLightIcon from "material-icon-theme/icons/pnpm_light.svg?no-inline";
import prettierIcon from "material-icon-theme/icons/prettier.svg?no-inline";
import prismaIcon from "material-icon-theme/icons/prisma.svg?no-inline";
import pythonIcon from "material-icon-theme/icons/python.svg?no-inline";
import reactIcon from "material-icon-theme/icons/react.svg?no-inline";
import reactTsIcon from "material-icon-theme/icons/react_ts.svg?no-inline";
import rubyIcon from "material-icon-theme/icons/ruby.svg?no-inline";
import rustIcon from "material-icon-theme/icons/rust.svg?no-inline";
import sassIcon from "material-icon-theme/icons/sass.svg?no-inline";
import scalaIcon from "material-icon-theme/icons/scala.svg?no-inline";
import settingsIcon from "material-icon-theme/icons/settings.svg?no-inline";
import svelteIcon from "material-icon-theme/icons/svelte.svg?no-inline";
import swiftIcon from "material-icon-theme/icons/swift.svg?no-inline";
import tailwindcssIcon from "material-icon-theme/icons/tailwindcss.svg?no-inline";
import tomlIcon from "material-icon-theme/icons/toml.svg?no-inline";
import tomlLightIcon from "material-icon-theme/icons/toml_light.svg?no-inline";
import typescriptIcon from "material-icon-theme/icons/typescript.svg?no-inline";
import typescriptDefIcon from "material-icon-theme/icons/typescript-def.svg?no-inline";
import viteIcon from "material-icon-theme/icons/vite.svg?no-inline";
import vitestIcon from "material-icon-theme/icons/vitest.svg?no-inline";
import vueIcon from "material-icon-theme/icons/vue.svg?no-inline";
import webpackIcon from "material-icon-theme/icons/webpack.svg?no-inline";
import xmlIcon from "material-icon-theme/icons/xml.svg?no-inline";
import yamlIcon from "material-icon-theme/icons/yaml.svg?no-inline";
import yarnIcon from "material-icon-theme/icons/yarn.svg?no-inline";

// Explicit asset imports keep unused icons and the theme manifest out of production builds.
const FILE_TYPE_ICONS = {
	file: fileIcon,
	javascript: javascriptIcon,
	typescript: typescriptIcon,
	"typescript-def": typescriptDefIcon,
	react: reactIcon,
	react_ts: reactTsIcon,
	vue: vueIcon,
	svelte: svelteIcon,
	angular: angularIcon,
	astro: astroIcon,
	next: nextIcon,
	nuxt: nuxtIcon,
	vite: viteIcon,
	vitest: vitestIcon,
	webpack: webpackIcon,
	nodejs: nodejsIcon,
	npm: npmIcon,
	pnpm: pnpmIcon,
	yarn: yarnIcon,
	rust: rustIcon,
	go: goIcon,
	"go-mod": goModIcon,
	java: javaIcon,
	markdown: markdownIcon,
	json: jsonIcon,
	python: pythonIcon,
	console: consoleIcon,
	yaml: yamlIcon,
	toml: tomlIcon,
	html: htmlIcon,
	css: cssIcon,
	sass: sassIcon,
	less: lessIcon,
	cpp: cppIcon,
	c: cIcon,
	csharp: csharpIcon,
	php: phpIcon,
	ruby: rubyIcon,
	swift: swiftIcon,
	kotlin: kotlinIcon,
	lua: luaIcon,
	docker: dockerIcon,
	scala: scalaIcon,
	dart: dartIcon,
	xml: xmlIcon,
	cmake: cmakeIcon,
	database: databaseIcon,
	git: gitIcon,
	settings: settingsIcon,
	graphql: graphqlIcon,
	prisma: prismaIcon,
	elixir: elixirIcon,
	clojure: clojureIcon,
	eslint: eslintIcon,
	prettier: prettierIcon,
	tailwindcss: tailwindcssIcon,
};

type FileIconName = keyof typeof FILE_TYPE_ICONS;

const FOLDER_ICON_COLOR = "#93c5fd";

const FILE_ICON_COLORS: Partial<Record<FileIconName, string>> = {
	markdown: "#16a34a",
};

const FILE_ICON_LIGHT_VARIANTS: Partial<Record<FileIconName, string>> = {
	next: nextLightIcon,
	pnpm: pnpmLightIcon,
	toml: tomlLightIcon,
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
	FOLDER_ICON_COLOR,
};
