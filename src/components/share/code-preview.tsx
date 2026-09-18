import { useEffect, useRef } from "react";
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "codemirror";
import { handleError } from "@/utils/error";
import { matchEditorLanguage } from "./editor-language";

type CodePreviewProps = {
	/** File path used to load the same language as the Skill editor. */
	path: string;
	/** Bounded text returned by the file preview API. */
	value: string;
};

/** Draws only visible lines without loading editing commands into file previews.
 * @example <CodePreview path="index.js" value="const count = 1;" />
 */
const CodePreview = ({ path, value }: CodePreviewProps) => {
	const host = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!host.current) return;
		const view = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: value,
				extensions: [
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					EditorView.lineWrapping,
					syntaxHighlighting(defaultHighlightStyle),
					EditorView.theme({
						"&": {
							maxHeight: "480px",
							backgroundColor: "var(--color-surface-soft)",
							color: "var(--color-ink)",
						},
						".cm-scroller": {
							overflow: "auto",
							fontFamily: "var(--font-mono)",
							fontSize: "14px",
							lineHeight: "1.6",
						},
						".cm-content": { padding: "12px 0" },
						".cm-line": { padding: "0 12px" },
						"&.cm-focused": { outline: "none" },
						".cm-selectionBackground": {
							backgroundColor: "var(--color-focus-ring)",
						},
						".cm-content ::selection": { color: "var(--color-ink)" },
					}),
				],
			}),
		});
		let disposed = false;
		matchEditorLanguage(path)
			?.load()
			.then((support) => {
				if (!disposed)
					view.dispatch({ effects: StateEffect.appendConfig.of(support) });
			})
			.catch((error: unknown) =>
				handleError(error, "Failed to load preview language"),
			);
		return () => {
			disposed = true;
			view.destroy();
		};
	}, [path, value]);

	return <div aria-label={path} ref={host} role="region" />;
};

export { CodePreview };
