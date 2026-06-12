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
      ? "text-neutral-primary/75 [&_a]:text-neutral-primary [&_blockquote]:text-neutral-muted"
      : "text-neutral-00/60 [&_a]:text-neutral-00 [&_blockquote]:text-neutral-00/70";

  return (
    <div
      className={`${toneClass} text-sm leading-6 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderEmailBodyHtml(body) }}
    />
  );
}
