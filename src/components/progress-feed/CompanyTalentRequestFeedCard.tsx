import { Clock3, LoaderCircle, MailCheck, Send, XCircle } from "lucide-react";
import { formatKstDateTime } from "@/components/ops/dateUtils";
import { MuteButton } from "@/components/ui/button";
import type { OrgCompanyTalentRequestFeedItem } from "@/lib/org/server";
import { cn } from "@/lib/utils";

function formatExactKst(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatKstDateTime(date) : value;
}

export function CompanyTalentRequestFeedCard({
  item,
  onCancel,
  pending = false,
}: {
  item: OrgCompanyTalentRequestFeedItem;
  onCancel?: () => void;
  pending?: boolean;
}) {
  const statusMeta =
    item.deliveryStatus === "sent"
      ? {
          Icon: MailCheck,
          detail: `${formatExactKst(item.sentAt)} 이메일과 Harper 채팅으로 전달`,
          title: "후보자 문의 발송 완료",
        }
      : item.deliveryStatus === "processing"
        ? {
            Icon: Send,
            detail: "이메일과 Harper 채팅 전달을 처리하고 있습니다.",
            title: "후보자 문의 발송 중",
          }
        : item.deliveryStatus === "cancelled"
          ? {
              Icon: XCircle,
              detail: `${formatExactKst(item.cancelledAt)} 발송 취소`,
              title: "후보자 문의 취소",
            }
          : item.deliveryStatus === "failed"
            ? {
                Icon: XCircle,
                detail:
                  "발송 처리에 실패했습니다. 실제 전달 여부를 확인해 주세요.",
                title: "후보자 문의 발송 실패",
              }
            : {
                Icon: Clock3,
                detail: `${formatExactKst(item.scheduledAt)} 이메일과 Harper 채팅으로 전달 예정`,
                title: "후보자 문의 예약",
              };
  const StatusIcon = statusMeta.Icon;

  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-muted">
        <StatusIcon className="h-3.5 w-3.5" />
      </span>
      <article className="min-w-0 flex-1 border-b border-neutral-1000-a05 pb-3 text-sm text-neutral-primary">
        <div className="text-[12px] font-medium text-neutral-primary">
          {statusMeta.title}
        </div>
        <div
          className={cn(
            "mt-1 text-xs leading-5",
            item.deliveryStatus === "failed"
              ? "text-critical"
              : "text-neutral-muted"
          )}
        >
          {statusMeta.detail}
        </div>
        <div className="mt-2 text-xs leading-5 text-neutral-primary">
          <span className="text-neutral-soft">주제 · </span>
          {item.requestContext}
        </div>
        {item.roleName ? (
          <div className="mt-1 text-xs text-neutral-soft">
            포지션 · {item.roleName}
          </div>
        ) : null}
        {item.canCancel && onCancel ? (
          <div className="mt-3">
            <MuteButton
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    item.deliveryStatus === "failed"
                      ? "이 실패한 문의를 종료해 추가 발송을 막을까요? 이미 외부 전송이 시작된 경우에는 되돌릴 수 없습니다."
                      : "이 후보자 문의를 취소할까요? 취소하면 이메일과 Harper 채팅이 발송되지 않습니다."
                  )
                ) {
                  onCancel();
                }
              }}
              size="sm"
              variant="warn"
            >
              {pending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              발송 취소
            </MuteButton>
          </div>
        ) : null}
      </article>
    </div>
  );
}
