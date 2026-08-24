import type { DraftChatAttachment } from "@/lib/chat/attachmentClient";
import { cn } from "@/lib/cn";
import { useMessages } from "@/i18n/useMessage";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Link2, Loader2, X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";

type Props = {
  attachments: DraftChatAttachment[];
  className?: string;
  isPreparing?: boolean;
  onRemove: (attachmentId: string) => void;
  tone?: "dark" | "light";
};

function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function getAttachmentMeta(attachment: DraftChatAttachment) {
  if (attachment.kind === "file") {
    return [attachment.mime, formatBytes(attachment.size)]
      .filter(Boolean)
      .join(" · ");
  }

  return attachment.url;
}

export default function ChatAttachmentDraftList({
  attachments,
  className,
  isPreparing = false,
  onRemove,
  tone = "dark",
}: Props) {
  const { m } = useMessages();

  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {attachments.map((attachment) => {
        const Icon = attachment.kind === "link" ? Link2 : FileText;
        const meta = getAttachmentMeta(attachment);

        return (
          <div
            key={attachment.id}
            className={cn(
              "relative flex w-fit max-w-full items-start justify-between gap-3 overflow-hidden rounded-[14px] px-3 pr-8 py-2.5 text-left",
              tone === "light"
                ? "border border-neutral-1000-a05 bg-bg-floating"
                : "bg-neutral-00/5"
            )}
          >
            <div className="min-w-0 max-w-full">
              <div
                className={cn(
                  "flex min-w-0 flex-row items-center gap-2 text-[13px]",
                  tone === "light"
                    ? "text-neutral-primary"
                    : "text-neutral-00/90"
                )}
              >
                {isPreparing ? (
                  <Loader2
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 animate-spin",
                      tone === "light"
                        ? "text-neutral-muted"
                        : "text-neutral-00/60"
                    )}
                  />
                ) : (
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                )}
                {isPreparing ? (
                  <Skeleton className="h-[13px] w-28 rounded-sm bg-neutral-00/10" />
                ) : (
                  <span className="truncate">{attachment.name}</span>
                )}
              </div>
              {isPreparing ? (
                <Skeleton className="mt-1 h-[11px] w-40 rounded-sm bg-neutral-00/10" />
              ) : meta ? (
                <div
                  className={cn(
                    "mt-1 max-w-full truncate text-[11px]",
                    tone === "light"
                      ? "text-neutral-soft"
                      : "text-neutral-00/60"
                  )}
                >
                  {meta}
                </div>
              ) : null}
            </div>
            <MuteButton
              type="button"
              size="sm"
              variant="transparent"
              onClick={() => onRemove(attachment.id)}
              className={cn(
                "absolute right-1 top-1 shrink-0",
                tone === "light"
                  ? "text-neutral-muted"
                  : "text-neutral-00/60 hover:text-neutral-00/90"
              )}
              aria-label={
                attachment.kind === "link" ? "첨부 링크 제거" : "첨부 파일 제거"
              }
            >
              <X className="h-3.5 w-3.5" />
            </MuteButton>
          </div>
        );
      })}
    </div>
  );
}
