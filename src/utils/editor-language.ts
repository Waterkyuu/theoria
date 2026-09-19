import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/** Keeps filename aliases consistent between editable and read-only code views.
 * @example matchEditorLanguage("scripts/.zshrc")
 */
const matchEditorLanguage = (path: string) => {
	const filename = (path.split(/[\\/]/).pop() ?? path)
		.replace(/^(?:dockerfile|containerfile)(?:\..*)?$/i, "Dockerfile")
		.replace(/^\.(?:bashrc|bash_profile|zshrc|zprofile|profile)$/i, "script.sh")
		.replace(/\.zsh$/i, ".sh")
		.replace(/\.pyi$/i, ".py")
		.replace(/\.(?:mts|cts)$/i, ".ts")
		.replace(/^gemfile$/i, "Gemfile")
		.replace(/^rakefile$/i, "Rakefile");
	return (
		LanguageDescription.matchFilename(languages, filename) ??
		LanguageDescription.matchFilename(languages, filename.toLowerCase())
	);
};

export { matchEditorLanguage };
