/** @type {import("lint-staged").Configuration} */
const config = {
	"*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
		"oxlint --fix --no-error-on-unmatched-pattern",
		"oxfmt --write --no-error-on-unmatched-pattern",
	],
	"*.{json,jsonc,css}": "oxfmt --write --no-error-on-unmatched-pattern",
	"src-tauri/**/*.rs": [
		() => "cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check",
		() =>
			"cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings",
	],
	"src-tauri/{Cargo.toml,Cargo.lock,**/*.toml}": () =>
		"cargo check --manifest-path src-tauri/Cargo.toml --all-targets --all-features",
};

export default config;
