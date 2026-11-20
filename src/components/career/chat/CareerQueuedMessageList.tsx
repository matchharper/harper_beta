"use client";

import { Clock3, Paperclip, X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";

export type CareerQueuedMessageItem = {
  id: string;
  text: string;
  fileNames: string[];
};

/** Messages waiting for the running turn to finish, shown above the composer. */
export function CareerQueuedMessageList({
  items,
  onRemove,
}: {
  items: CareerQueuedMessageItem[];
  onRemove: (id: string) => void;
}) {
  const t = useCareerT();
  return (
    <ol
      aria-label={t(
        "career.chat.queued_messages.title",
        "답변이 끝나면 보낼 메시지"
      )}
      className="career-glass career-work-surface flex max-h-[min(176px,24dvh)] flex-col overflow-y-auto overscroll-contain py-1 pl-4 pr-2"
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-h-9 min-w-0 items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
        >
          <Clock3
            className="h-3.5 w-3.5 shrink-0 text-neutral-muted"
            aria-hidden="true"
          />
          <Typography variant="body" className="min-w-0 flex-1 truncate">
            {item.text || item.fileNames.join(", ")}
          </Typography>
          {item.text && item.fileNames.length > 0 ? (
            <Typography
              variant="caption"
              className="inline-flex shrink-0 items-center gap-0.5"
              title={item.fileNames.join(", ")}
            >
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              {item.fileNames.length}
            </Typography>
          ) : null}
          <MuteButton
            aria-label={t(
              "career.chat.queued_messages.remove_aria",
              "보낼 메시지에서 빼기"
            )}
            className="size-8 shrink-0 p-0"
            size="sm"
            variant="transparent"
            onClick={() => onRemove(item.id)}
          >
            <X className="h-3.5 w-3.5" />
          </MuteButton>
        </li>
      ))}
    </ol>
  );
}
