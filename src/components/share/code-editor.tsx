import { useEffect, useEffectEvent, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import "@/styles/code-editor.css";

type CodeEditorProps = {
	/** File path used for language selection and the accessible editor name. */
	path: string;
	/** Current file contents; switching files preserves the parent's draft. */
	value: string;
	/** Receives edits so the owner can save the entire directory. */
	onChange: (value: string) => void;
	/** Prevent edits while a snapshot is being saved. */
	isReadOnly?: boolean;
};

/**
 * Bundles the editor locally for offline use in Tauri, with Markdown support and independent undo per file.
 *
 * @example
 * <CodeEditor path="SKILL.md" value={content} onChange={setContent} />
 */
const CodeEditor = ({
	path,
	value,
	onChange,
	isReadOnly = false,
}: CodeEditorProps) => {
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<EditorView | null>(null);
	const states = useRef(new Map<string, EditorState>());
	const readOnly = useRef(new Compartment());
	const initialValue = useEffectEvent(() => value);
	const reportChange = useEffectEvent((content: string) => onChange(content));

	useEffect(() => {
		if (!host.current) return;
		const view = new EditorView({
			parent: host.current,
			state:
				states.current.get(path) ??
				EditorState.create({
					doc: initialValue(),
					extensions: [
						basicSetup,
						/\.md$/i.test(path) ? markdown() : [],
						EditorView.lineWrapping,
						readOnly.current.of(EditorState.readOnly.of(false)),
						EditorView.contentAttributes.of({
							"aria-label": path,
							spellcheck: "false",
						}),
						EditorView.updateListener.of((update) => {
							if (update.docChanged) reportChange(update.state.doc.toString());
						}),
						EditorView.theme({
							"&": {
								height: "100%",
								backgroundColor: "var(--color-surface-card)",
								color: "var(--color-ink)",
							},
							".cm-scroller": {
								overflow: "auto",
								fontFamily: "var(--font-mono)",
								fontSize: "14px",
								lineHeight: "1.8",
							},
							".cm-content": { padding: "16px 0" },
							".cm-line": { padding: "0 20px" },
							".cm-gutters": {
								backgroundColor: "var(--color-surface-card)",
								color: "var(--color-mute)",
								border: "none",
							},
							".cm-gutterElement": { padding: "0 8px" },
							".cm-activeLineGutter": {
								backgroundColor: "var(--color-surface-soft)",
							},
							// Keep the active line transparent so it cannot cover the selection drawn beneath it.
							".cm-activeLine": { backgroundColor: "transparent" },
							"&.cm-focused": { outline: "none" },
							".cm-content ::selection": { color: "var(--color-ink)" },
							".cm-cursor": { borderLeftColor: "var(--color-ink)" },
						}),
					],
				}),
		});
		editor.current = view;
		const documents = states.current;
		return () => {
			documents.set(path, view.state);
			view.destroy();
			editor.current = null;
		};
	}, [path]);

	useEffect(() => {
		const view = editor.current;
		if (view?.contentDOM.getAttribute("aria-label") !== path) return;
		view.dispatch({
			effects: readOnly.current.reconfigure(
				EditorState.readOnly.of(isReadOnly),
			),
		});
	}, [isReadOnly, path]);

	useEffect(() => {
		const view = editor.current;
		if (view && view.state.doc.toString() !== value) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value },
			});
		}
	}, [value]);

	return (
		<div
			className="skill-code-editor h-full min-h-0 min-w-0 overflow-hidden"
			ref={host}
		/>
	);
};

export type { CodeEditorProps };
export { CodeEditor };
