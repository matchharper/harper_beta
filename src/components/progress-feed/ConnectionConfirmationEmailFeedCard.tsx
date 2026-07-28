import { Clock3, LoaderCircle, MailCheck, Send, XCircle } from "lucide-react";
import { formatKst } from "@/components/ops/career/utils";
import { cx } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import type { OpsMatchingConnectionConfirmationEmail } from "@/lib/ops/connectionConfirmationEmail";

export function ConnectionConfirmationEmailFeedCard({
  item,
  onCancel,
  onSendNow,
  pendingAction = null,
  showRoleContext = false,
}: {
  item: OpsMatchingConnectionConfirmationEmail;
  onCancel?: () => void;
  onSendNow?: () => void;
  pendingAction?: "cancel" | "send_now" | null;
  showRoleContext?: boolean;
}) {
  const statusMeta =
    item.status === "sent"
      ? {
          Icon: MailCheck,
          detail: `${formatKst(item.sentAt)} 발송 완료`,
          title: "연결 확정 안내 메일 발송",
        }
      : item.status === "sending"
        ? {
            Icon: LoaderCircle,
            detail: "발송을 처리하고 있습니다.",
            title: "연결 확정 안내 메일 발송 중",
          }
        : item.status === "cancelled"
          ? {
              Icon: XCircle,
              detail: `${formatKst(item.cancelledAt)} 발송하지 않음`,
              title: "연결 확정 안내 메일 미발송",
            }
          : item.status === "failed"
            ? {
                Icon: XCircle,
                detail:
                  item.lastError?.trim() ||
                  "발송에 실패했습니다. 오류를 확인해 주세요.",
                title: "연결 확정 안내 메일 실패",
              }
            : {
                Icon: Clock3,
                detail: `${formatKst(item.scheduledAt)} 발송 예정`,
                title: "연결 확정 안내 메일 대기",
              };
  const StatusIcon = statusMeta.Icon;
  const roleContext = [item.companyName, item.roleName]
    .filter(Boolean)
    .join(" · ");
  const isUpdating = pendingAction !== null;

  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-muted">
        <StatusIcon
          className={cx(
            "h-3.5 w-3.5",
            item.status === "sending" && "animate-spin"
          )}
        />
      </span>
      <article className="min-w-0 flex-1 rounded-sm border border-neutral-1000-a05 bg-bg-floating px-3 py-2 text-sm text-neutral-primary">
        {showRoleContext && roleContext ? (
          <div className="truncate text-xs font-medium text-neutral-primary">
            {roleContext}
          </div>
        ) : null}
        <div
          className={cx(
            "text-[12px] font-medium text-neutral-primary",
            showRoleContext && roleContext && "mt-1"
          )}
        >
          {statusMeta.title}
        </div>
        <div
          className={cx(
            "mt-1 text-xs leading-5",
            item.status === "failed" ? "text-critical" : "text-neutral-muted"
          )}
        >
          {statusMeta.detail}
        </div>

        {item.recipientResponse?.status === "stopped" ? (
          <div className="mt-2 rounded-md bg-critical-faded px-2.5 py-2 text-xs leading-5 text-critical">
            <div className="font-medium">
              인재가 이메일로 진행 종료를 요청했습니다.
            </div>
            <div>{formatKst(item.recipientResponse.receivedAt)} 처리 완료</div>
            {item.recipientResponse.reason ? (
              <div className="mt-1 text-neutral-muted">
                사유: {item.recipientResponse.reason}
              </div>
            ) : null}
          </div>
        ) : null}

        {(item.canCancel || item.canSendNow) && (onCancel || onSendNow) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.canCancel && onCancel ? (
              <BareButton
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-bg-weak px-3 text-xs font-medium text-neutral-muted transition hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUpdating}
                onClick={() => {
                  if (
                    !window.confirm(
                      "대기 중인 연결 확정 안내 메일을 발송하지 않을까요?"
                    )
                  ) {
                    return;
                  }
                  onCancel();
                }}
                type="button"
              >
                {pendingAction === "cancel" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                메일 발송하지 않기
              </BareButton>
            ) : null}
            {item.canSendNow && onSendNow ? (
              <BareButton
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-black px-3 text-xs font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUpdating}
                onClick={() => {
                  if (
                    !window.confirm(
                      "자동 발송 일정을 기다리지 않고 지금 발송할까요?"
                    )
                  ) {
                    return;
                  }
                  onSendNow();
                }}
                type="button"
              >
                {pendingAction === "send_now" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                바로 보내기
              </BareButton>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  );
}
