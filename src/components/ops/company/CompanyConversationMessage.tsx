import Image from "next/image";
import { MarkdownView } from "@/components/chat/MarkDownView";
import {
  formatKstDateOnly,
  formatOpsCompanyDate,
} from "@/components/ops/dateUtils";
import { convertSlackMrkdwnToWebMarkdown } from "@/lib/org/agent/navigationMarkdown";
import {
  conversationMessageTime,
  displaySlackMentions,
} from "@/lib/ops/companyConversationPresentation";
import type { OpsCompanyConversationItem } from "@/lib/ops/company";
import { cn } from "@/lib/utils";

export function conversationDay(item: OpsCompanyConversationItem) {
  return formatKstDateOnly(new Date(conversationMessageTime(item)));
}

export function ConversationDateDivider({ day }: { day: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-4"
      role="separator"
      aria-label={day}
    >
      <span className="h-px flex-1 bg-neutral-1000-a10" />
      <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-muted">
        {day}
      </span>
      <span className="h-px flex-1 bg-neutral-1000-a10" />
    </div>
  );
}

export function CompanyConversationMessage({
  item,
  compact = false,
  names,
}: {
  item: OpsCompanyConversationItem;
  compact?: boolean;
  names: ReadonlyMap<string, string>;
}) {
  const harper = item.role === "assistant";
  const name = harper
    ? "Harper"
    : item.user.name ||
      item.user.email ||
      (item.user.slackUserId && names.get(item.user.slackUserId)) ||
      (item.source === "slack" ? "Slack 팀원" : "팀원");
  const time = new Date(conversationMessageTime(item));
  const exactTime = time.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const unresolved =
    !harper &&
    !item.user.name &&
    !item.user.email &&
    item.user.slackUserId &&
    !names.has(item.user.slackUserId);
  return (
    <article
      className={cn(
        "group/message flex gap-2.5 px-4",
        compact ? "py-0.5" : "pb-1 pt-3"
      )}
    >
      <div className="flex w-6 shrink-0 justify-center pt-0.5">
        {!compact &&
          (harper ? (
            <Image
              src="/svgs/face.svg"
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px]"
            />
          ) : (
            <span
              className="flex h-6 w-6 items-center justify-center rounded bg-bg-weak text-xs font-medium text-neutral-muted"
              aria-hidden
            >
              {unresolved ? "@" : name.slice(0, 1)}
            </span>
          ))}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-neutral-primary">
              {name}
            </span>
            {unresolved && (
              <span className="text-xs text-neutral-muted">
                @{item.user.slackUserId}
              </span>
            )}
            <time
              dateTime={time.toISOString()}
              title={exactTime}
              className="text-xs text-neutral-muted"
            >
              {formatOpsCompanyDate(time.toISOString())}
            </time>
          </div>
        )}
        <div
          title={compact ? exactTime : undefined}
          className="break-words text-sm leading-[1.55] text-neutral-primary [&_.prose]:text-sm [&_.prose]:leading-[1.55] [&_.prose]:text-neutral-primary [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_a]:text-link [&_blockquote]:font-normal [&_blockquote]:text-neutral-muted [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2"
        >
          <MarkdownView
            markdown={
              (item.source === "slack"
                ? convertSlackMrkdwnToWebMarkdown(
                    displaySlackMentions(item.content, names)
                  )
                : item.content) || "텍스트 내용 없음"
            }
          />
        </div>
      </div>
    </article>
  );
}
