import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownView({ markdown }: { markdown: string }) {
    return (
        <div className="prose prose-neutral max-w-none">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
