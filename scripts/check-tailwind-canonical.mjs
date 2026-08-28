import { __unstable__loadDesignSystem } from "tailwindcss";
import ts from "typescript";
import { readdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = join(ROOT, "src");
const STYLESHEET_PATH = join(SOURCE_ROOT, "styles.css");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const findPackageStylesheet = async (id, base) => {
	const segments = id.split("/");
	const packageName = id.startsWith("@")
		? segments.slice(0, 2).join("/")
		: segments[0];
	const packageSubpath = segments.slice(packageName.startsWith("@") ? 2 : 1);
	const exportKey =
		packageSubpath.length === 0 ? "." : `./${packageSubpath.join("/")}`;
	const realBase = await realpath(base);
	const packageRoots =
		createRequire(join(realBase, "stylesheet-loader.cjs")).resolve.paths(
			packageName,
		) ?? [];

	for (const packageRoot of packageRoots) {
		const packageDirectory = join(packageRoot, packageName);
		const packageJsonPath = join(packageDirectory, "package.json");

		try {
			const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
			const exportedValue = packageJson.exports?.[exportKey];
			const stylesheet =
				(typeof exportedValue === "string"
					? exportedValue
					: exportedValue?.style) ??
				(packageSubpath.length === 0 ? packageJson.style : undefined);

			if (stylesheet) {
				return join(packageDirectory, stylesheet);
			}
		} catch (error) {
			if (error?.code !== "ENOENT") {
				throw error;
			}
		}
	}

	throw new Error(`Cannot find a CSS export for ${id} from ${base}`);
};

const loadStylesheet = async (id, base) => {
	const stylesheetPath = id.startsWith(".")
		? resolve(base, id)
		: await findPackageStylesheet(id, base);

	return {
		path: stylesheetPath,
		base: dirname(stylesheetPath),
		content: await readFile(stylesheetPath, "utf8"),
	};
};

const collectSourceFiles = async (directory) => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await collectSourceFiles(path)));
		} else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
			files.push(path);
		}
	}

	return files;
};

const collectStringCandidates = (file, content) => {
	const sourceFile = ts.createSourceFile(
		file,
		content,
		ts.ScriptTarget.Latest,
		true,
		extname(file).endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const candidates = [];

	const visit = (node) => {
		if (ts.isStringLiteralLike(node)) {
			for (const match of node.text.matchAll(/\S+/g)) {
				const position = sourceFile.getLineAndCharacterOfPosition(
					node.getStart(sourceFile) + 1 + match.index,
				);

				candidates.push({
					candidate: match[0],
					line: position.line + 1,
					column: position.character + 1,
				});
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return candidates;
};

const projectCss = await readFile(STYLESHEET_PATH, "utf8");
const designSystem = await __unstable__loadDesignSystem(projectCss, {
	base: SOURCE_ROOT,
	from: STYLESHEET_PATH,
	loadStylesheet,
});
const violations = [];

for (const file of await collectSourceFiles(SOURCE_ROOT)) {
	const content = await readFile(file, "utf8");

	for (const { candidate, line, column } of collectStringCandidates(
		file,
		content,
	)) {
		const canonical = designSystem.canonicalizeCandidates([candidate], {
			rem: 16,
		})[0];

		if (canonical && canonical !== candidate) {
			violations.push({ file, line, column, candidate, canonical });
		}
	}
}

if (violations.length > 0) {
	console.error("Non-canonical Tailwind CSS classes found:\n");

	for (const violation of violations) {
		console.error(
			`${relative(ROOT, violation.file)}:${violation.line}:${violation.column}  ${violation.candidate} -> ${violation.canonical}`,
		);
	}

	process.exitCode = 1;
} else {
	console.log("Tailwind CSS canonical class check passed.");
}
