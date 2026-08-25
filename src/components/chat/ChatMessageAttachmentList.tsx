import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

export function ChatMessageAttachmentList({
  align = "end",
  attachments,
  className,
}: {
  align?: "end" | "start";
  attachments: Array<{ name: string }>;
  className?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        "flex max-w-[min(820px,92%)] flex-wrap gap-1.5",
        align === "end" ? "ml-auto justify-end" : "mr-auto justify-start",
        className
      )}
    >
      {attachments.map((attachment, index) => (
        <span
          key={`${attachment.name}:${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-1000-a10 bg-bg-floating px-2.5 py-1 text-[11px] text-neutral-muted"
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{attachment.name}</span>
        </span>
      ))}
    </div>
  );
}
