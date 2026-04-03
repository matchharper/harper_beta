import { renderEmailBodyHtml } from "@/lib/ats/emailBodyFormat";

type AtsEmailBodyContentProps = {
  body: string;
  className?: string;
  emptyMessage?: string;
  tone?: "dark" | "light";
};

export default function AtsEmailBodyContent({
  body,
  className = "",
  emptyMessage,
  tone = "dark",
}: AtsEmailBodyContentProps) {
  if (!body.trim()) {
    return emptyMessage ? (
      <div className={className}>{emptyMessage}</div>
    ) : null;
  }

  const toneClass =
    tone === "light"
      ? "text-black/75 [&_a]:text-black [&_blockquote]:text-black/70"
      : "text-white/60 [&_a]:text-white [&_blockquote]:text-white/70";

  return (
    <div
      className={`${toneClass} text-sm leading-6 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderEmailBodyHtml(body) }}
    />
  );
}
