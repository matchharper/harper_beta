import { cn } from "@/lib/utils";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mt-7 text-[24px] font-medium leading-tight text-black first:mt-0 md:text-[28px]">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-6 text-[17px] md:text-[19px] font-medium leading-snug text-black first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-5 text-[15px] md:text-[16px] font-semibold leading-snug text-black first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-4 break-keep text-[15px] md:text-[15px] leading-[1.6] text-black/80 font-normal first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 break-keep pl-5 text-[15px] md:text-[15px] leading-[1.6] text-black/80 first:mt-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 break-keep pl-5 text-[15px] md:text-[15px] leading-[1.6] text-black/80 first:mt-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-black">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-black/80">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-beige900/25 underline-offset-4 transition hover:text-black"
    >
      {children}
    </a>
  ),
};

export default function OfficialJobMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const trimmedContent = content.trim();
  if (!trimmedContent) return null;

  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {trimmedContent}
      </ReactMarkdown>
    </div>
  );
}
