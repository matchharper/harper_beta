import {
  ChevronRight,
  Clock3,
  LoaderCircle,
  MailCheck,
  Send,
  XCircle,
} from "lucide-react";
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
          detail: item.sentAt
            ? `${formatExactKst(item.sentAt)}에 전달했어요.`
            : "후보자에게 전달했어요.",
          title:
            item.requestKind === "resume"
              ? "후보자에게 이력서를 요청했어요"
              : "후보자에게 질문을 보냈어요",
        }
      : item.deliveryStatus === "processing"
        ? {
            Icon: Send,
            detail: "전달이 끝나면 이곳에서 확인할 수 있어요.",
            title: "후보자에게 전달하고 있어요",
          }
        : item.deliveryStatus === "cancelled"
          ? {
              Icon: XCircle,
              detail: item.cancelledAt
                ? `${formatExactKst(item.cancelledAt)}에 취소했어요.`
                : "후보자에게 전달되지 않아요.",
              title: "후보자에게 보내기 전에 취소했어요",
            }
          : item.deliveryStatus === "failed"
            ? {
                Icon: XCircle,
                detail:
                  "중복 연락을 피하려면 실제 전달 여부를 먼저 확인해 주세요.",
                title: "후보자에게 전달됐는지 확인이 필요해요",
              }
            : {
                Icon: Clock3,
                detail: `${formatExactKst(item.scheduledAt)}에 전달할 예정이에요.`,
                title: "후보자에게 전달할 예정이에요",
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
          <span className="text-neutral-soft">요청 내용 · </span>
          {item.requestContext}
        </div>
        {item.roleName ? (
          <div className="mt-1 text-xs text-neutral-soft">
            Role · {item.roleName}
          </div>
        ) : null}
        {item.responseMessage ? (
          <div className="mt-3 rounded-md bg-bg-weak px-3 py-2.5">
            <div className="text-xs font-medium text-neutral-primary">
              후보자 답변
            </div>
            <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-muted">
              {item.responseMessage}
            </div>
          </div>
        ) : null}
        {item.sentMessage ? (
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-xs font-medium text-neutral-muted transition hover:text-neutral-primary [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              후보자에게 보낸 내용
            </summary>
            <div className="mt-1 whitespace-pre-wrap break-words rounded-md bg-bg-weak px-3 py-2.5 text-xs leading-5 text-neutral-muted">
              {item.sentMessage}
            </div>
          </details>
        ) : null}
        {item.canCancel && onCancel ? (
          <div className="mt-3">
            <MuteButton
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    item.deliveryStatus === "failed"
                      ? "이 문의를 종료할까요? 전달이 시작된 뒤 실패했다면 후보자에게 일부 내용이 도착했을 수 있어요."
                      : "이 후보자 문의를 취소할까요? 취소하면 후보자에게 전달되지 않아요."
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
              문의 취소
            </MuteButton>
          </div>
        ) : null}
      </article>
    </div>
  );
}
