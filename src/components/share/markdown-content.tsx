import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownContentProps = {
	/** Markdown source rendered without changing its stored representation. */
	children: string;
};

type MarkdownTableProps = {
	/** Parsed header and body supplied by the Markdown renderer. */
	children?: ReactNode;
};

/** Keeps wide tables scrollable inside the preview without widening the editor.
 * @example <MarkdownTable><tbody><tr><td>Content</td></tr></tbody></MarkdownTable>
 */
const MarkdownTable = ({ children }: MarkdownTableProps) => (
	<div className="my-4 max-w-full overflow-x-auto">
		<table className="w-full border-collapse [&_th]:border [&_th]:border-hairline [&_th]:bg-surface-soft [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-hairline [&_td]:px-3 [&_td]:py-2">
			{children}
		</table>
	</div>
);

/** Shares table and math support across skill previews and Agent responses, with bundled offline fonts.
 * @example <MarkdownContent>{"Inline $x^2$"}</MarkdownContent>
 */
const MarkdownContent = ({ children }: MarkdownContentProps) => (
	<div className="min-w-0 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2">
		<ReactMarkdown
			remarkPlugins={[remarkGfm, remarkMath]}
			rehypePlugins={[rehypeKatex]}
			components={{ table: MarkdownTable }}
		>
			{children}
		</ReactMarkdown>
	</div>
);

export { MarkdownContent };
