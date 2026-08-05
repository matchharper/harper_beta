import { Mail } from "lucide-react";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { formatKst } from "@/components/ops/career/utils";
import { Badge } from "@/components/ui/badge";
import type { OrgIntroEmailFeedItem } from "@/lib/org/server";

export function OrgIntroEmailFeedCard({
  item,
  recipientLabels,
  senderLabel,
}: {
  item: OrgIntroEmailFeedItem;
  recipientLabels: string[];
  senderLabel: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-muted">
        <Mail className="h-3.5 w-3.5" />
      </span>
      <InternalOnlySurface
        className="min-w-0 flex-1 rounded-sm border border-neutral-1000-a05 bg-bg-default px-3 py-2 text-sm text-neutral-primary"
        showLabel={false}
      >
        <div className="relative z-20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium text-neutral-primary">
                {item.direction === "outbound"
                  ? "보낸 소개 메일"
                  : "받은 답장"}
              </span>
              <Badge size="sm" variant="inverse">
                Harper 내부 전용
              </Badge>
            </div>
            <span className="shrink-0 text-[11px] text-neutral-soft">
              {formatKst(item.createdAt)}
            </span>
          </div>

          {item.subject ? (
            <div className="mt-2 text-[13px] font-medium leading-5 text-neutral-primary">
              {item.subject}
            </div>
          ) : null}

          <dl className="mt-2 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px] leading-4 text-neutral-muted">
            <dt className="text-neutral-soft">보낸 사람</dt>
            <dd className="min-w-0 break-words text-neutral-primary">
              {senderLabel}
            </dd>
            <dt className="text-neutral-soft">받는 사람</dt>
            <dd className="min-w-0 break-words">
              {recipientLabels.length > 0
                ? recipientLabels.join(", ")
                : "수신자 정보 없음"}
            </dd>
          </dl>

          <div className="mt-3 border-t border-neutral-1000-a05 pt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-primary">
            {item.bodyText?.trim() || "메일 본문이 없습니다."}
          </div>
        </div>
      </InternalOnlySurface>
    </div>
  );
}
