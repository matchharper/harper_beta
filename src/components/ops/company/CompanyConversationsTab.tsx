import Image from "next/image";
import { Bot, ChevronUp, Globe2, LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/ops/opportunities/shared";
import {
  formatKstDateTime,
  formatKstRelativeDate,
} from "@/components/ops/dateUtils";
import { Badge } from "@/components/ui/badge";
import {
  OPS_COMPANY_CONVERSATION_PAGE_SIZE,
  useOpsCompanyConversations,
} from "@/hooks/ops/useOpsCompany";
import type { OpsCompanyConversationItem } from "@/lib/ops/company";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getConversationPersonLabel(item: OpsCompanyConversationItem) {
  return (
    item.user.name ||
    item.user.email ||
    (item.user.slackUserId
      ? `Slack 사용자 (${item.user.slackUserId})`
      : "이름 없음")
  );
}

function ConversationSourceBadge({
  source,
}: {
  source: OpsCompanyConversationItem["source"];
}) {
  if (source === "slack") {
    return (
      <Badge
        icon={
          <Image
            alt=""
            aria-hidden="true"
            height={12}
            src="/images/logos/slack.svg"
            width={12}
          />
        }
        size="sm"
        variant="outline"
      >
        Slack
      </Badge>
    );
  }

  return (
    <Badge icon={<Globe2 />} size="sm" variant="outline">
      웹
    </Badge>
  );
}

function ConversationRow({ item }: { item: OpsCompanyConversationItem }) {
  const isHarper = item.role === "assistant";
  const personLabel = isHarper ? "Harper" : getConversationPersonLabel(item);
  const secondaryLabel = isHarper
    ? null
    : item.source === "slack"
      ? item.user.slackUserId
      : item.user.email;
  const initials = personLabel.trim().slice(0, 1).toUpperCase() || "?";
  const occurredAt = new Date(item.occurredAt);

  return (
    <article className="flex min-w-0 items-start gap-3">
      <div
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
          isHarper
            ? "border-primary/20 bg-primary-faded text-primary"
            : "border-neutral-1000-a05 bg-bg-weak text-neutral-muted"
        )}
      >
        {isHarper ? <Bot className="h-4 w-4" /> : initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-neutral-primary">
            {personLabel}
          </span>
          {!isHarper ? (
            <Badge size="sm" variant="faded">
              사용자
            </Badge>
          ) : null}
          <ConversationSourceBadge source={item.source} />
          <time className="ml-auto shrink-0 text-xs text-neutral-soft">
            {Number.isNaN(occurredAt.getTime())
              ? item.occurredAt
              : formatKstDateTime(occurredAt)}
          </time>
        </div>
        {secondaryLabel ? (
          <div className="mt-0.5 truncate text-xs text-neutral-muted">
            {secondaryLabel}
          </div>
        ) : null}
        <div
          className={cn(
            "mt-2 whitespace-pre-wrap rounded-md border px-3 py-2.5 text-sm leading-6 text-neutral-primary",
            isHarper
              ? "border-primary/20 bg-primary-faded/55"
              : "border-neutral-1000-a05 bg-bg-floating"
          )}
        >
          {item.content || "텍스트 내용 없음"}
        </div>
      </div>
    </article>
  );
}

function ConversationDayDivider({ occurredAt }: { occurredAt: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator">
      <div className="h-px flex-1 bg-neutral-1000-a05" />
      <span className="text-xs font-medium text-neutral-soft">
        {formatKstRelativeDate(occurredAt)}
      </span>
      <div className="h-px flex-1 bg-neutral-1000-a05" />
    </div>
  );
}

export function CompanyConversationsTab({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId: string | null;
}) {
  const conversationsQuery = useOpsCompanyConversations({
    enabled,
    workspaceId,
  });
  const items = useMemo(
    () =>
      (conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [])
        .slice()
        .sort((left, right) => {
          const byOccurredAt =
            new Date(left.occurredAt).getTime() -
            new Date(right.occurredAt).getTime();
          return byOccurredAt || left.messageId - right.messageId;
        }),
    [conversationsQuery.data?.pages]
  );

  if (conversationsQuery.isLoading) {
    return <EmptyState copy="최근 대화를 불러오는 중입니다." />;
  }
  if (conversationsQuery.error) {
    return <EmptyState copy="최근 대화를 새로고침해 주세요." />;
  }
  if (items.length === 0) {
    return <EmptyState copy="표시할 대화 메시지가 없습니다." />;
  }

  return (
    <div className="space-y-3">
      {conversationsQuery.hasNextPage ? (
        <MuteButton
          variant="neutral"
          disabled={conversationsQuery.isFetchingNextPage}
          onClick={() => void conversationsQuery.fetchNextPage()}
          className="w-full"
        >
          {conversationsQuery.isFetchingNextPage ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          이전 메시지 {OPS_COMPANY_CONVERSATION_PAGE_SIZE}개 불러오기
        </MuteButton>
      ) : null}
      <section className="rounded-lg border border-neutral-1000-a05 bg-bg-default px-4 py-4">
        <div className="space-y-4">
          {items.map((item, index) => {
            const previous = items[index - 1];
            const dayLabel = formatKstRelativeDate(item.occurredAt);
            const previousDayLabel = previous
              ? formatKstRelativeDate(previous.occurredAt)
              : null;
            return (
              <div key={item.messageId} className="space-y-4">
                {dayLabel !== previousDayLabel ? (
                  <ConversationDayDivider occurredAt={item.occurredAt} />
                ) : null}
                <ConversationRow item={item} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
