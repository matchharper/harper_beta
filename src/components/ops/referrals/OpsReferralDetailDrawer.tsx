import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsReferralItem,
  OpsReferralPayoutRequestResponse,
} from "@/lib/ops/referrals";
import { CheckCircle2, Clock3, LoaderCircle, Mail, X } from "lucide-react";
import { memo, type ReactNode, useEffect, useState } from "react";
import {
  OpsReferralAmountDropdown,
  OpsReferralDateDropdown,
  OpsReferralRewardPaidDropdown,
  OpsReferralStageDropdown,
} from "./OpsReferralEditors";
import {
  formatReferralDateOnly,
  formatReferralDateTime,
  getOpsReferralSavingKey,
  getReferralPersonLabel,
  OpsReferralPersonCell,
} from "./shared";
import type {
  OpsReferralPayoutInformationUpdatedHandler,
  OpsReferralUiField,
  OpsReferralUpdateHandler,
} from "./types";

function DetailField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-neutral-1000-a05 pb-4">
      <div className="text-[13px] font-medium text-neutral-soft">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function MemoEditor({
  item,
  onSave,
  saving,
}: {
  item: OpsReferralItem;
  onSave: (value: string | null) => Promise<boolean>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(item.memo ?? "");
  const changed = draft.trim() !== (item.memo ?? "").trim();
  return (
    <div>
      <textarea
        value={draft}
        maxLength={10_000}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="레퍼럴 application 관련 메모를 남겨 주세요."
        className="min-h-[140px] w-full resize-y rounded-md border border-neutral-1000-a10 bg-bg-default px-3 py-2.5 text-sm font-normal text-neutral-primary outline-none transition placeholder:text-neutral-soft focus:border-neutral-1000-a20"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-normal text-neutral-soft">
          {draft.length.toLocaleString()} / 10,000
        </span>
        <BareButton
          type="button"
          disabled={!changed || saving}
          onClick={() => void onSave(draft.trim() || null)}
          className={cx(opsTheme.buttonPrimary, "h-8 px-3 text-[13px]")}
        >
          {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          메모 저장
        </BareButton>
      </div>
    </div>
  );
}

export const OpsReferralDetailDrawer = memo(function OpsReferralDetailDrawer({
  error,
  item,
  onClose,
  onPayoutInformationUpdated,
  onUpdate,
  savingKeys,
}: {
  error: string;
  item: OpsReferralItem;
  onClose: () => void;
  onPayoutInformationUpdated: OpsReferralPayoutInformationUpdatedHandler;
  onUpdate: OpsReferralUpdateHandler;
  savingKeys: ReadonlySet<string>;
}) {
  const [sendingPayoutRequest, setSendingPayoutRequest] = useState(false);
  const [payoutRequestError, setPayoutRequestError] = useState("");
  const [payoutRequestNotice, setPayoutRequestNotice] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isSaving = (field: OpsReferralUiField) =>
    savingKeys.has(getOpsReferralSavingKey(item, field));
  const payoutInformation = item.payoutInformation;
  const hasSentPayoutRequest = payoutInformation.notificationHistory.length > 0;
  const payoutSubmitted = Boolean(payoutInformation.submittedAt);
  const payoutEvents = [
    ...payoutInformation.notificationHistory.map((entry) => ({
      at: entry.sentAt,
      description: entry.sentByEmail
        ? `${entry.sentByEmail} 발송`
        : "안내 메일 발송",
      label: "안내 메일 발송",
      type: "sent" as const,
    })),
    ...(payoutInformation.submittedAt
      ? [
          {
            at: payoutInformation.submittedAt,
            description: "추천인이 지급정보 제출을 완료했습니다.",
            label: "지급정보 제출 완료",
            type: "submitted" as const,
          },
        ]
      : []),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

  const sendPayoutInformationRequest = async () => {
    if (sendingPayoutRequest || payoutSubmitted) return;
    setSendingPayoutRequest(true);
    setPayoutRequestError("");
    setPayoutRequestNotice("");
    try {
      const payload =
        await fetchWithInternalAuth<OpsReferralPayoutRequestResponse>(
          "/api/internal/referrals/payout-request",
          {
            body: JSON.stringify({
              recommendationId: item.recommendationId,
              referredUserId: item.referred.userId,
              roleId: item.roleId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
      onPayoutInformationUpdated(item, payload.payoutInformation);
      setPayoutRequestNotice(
        `${item.referrer.email ?? "초대한 사람"}에게 안내 메일을 보냈습니다.`
      );
    } catch (sendError) {
      setPayoutRequestError(
        sendError instanceof Error
          ? sendError.message
          : "지급정보 안내 메일을 보내지 못했습니다."
      );
    } finally {
      setSendingPayoutRequest(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] font-normal">
      <BareButton
        type="button"
        aria-label="상세 닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ops-referral-detail-title"
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-[580px] flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-1000-a05 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="ops-referral-detail-title"
              className="truncate text-base font-medium text-neutral-primary"
            >
              {getReferralPersonLabel(item.referred)} · {item.roleName}
            </h2>
            <div className="mt-1 truncate text-[13px] font-normal text-neutral-muted">
              {item.companyName}
            </div>
          </div>
          <BareButton
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" aria-hidden />
          </BareButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error && (
            <div className={cx(opsTheme.errorNotice, "mb-4")}>{error}</div>
          )}
          <div className="flex flex-col gap-4">
            <DetailField label="가입한 사람">
              <OpsReferralPersonCell person={item.referred} />
            </DetailField>
            <DetailField label="초대한 사람">
              <OpsReferralPersonCell person={item.referrer} />
            </DetailField>
            <DetailField label="Role at company">
              <div className="text-sm font-medium text-neutral-primary">
                {item.roleName}
              </div>
              <div className="mt-1 text-[13px] font-normal text-neutral-muted">
                {item.companyName}
              </div>
            </DetailField>
            <DetailField label="Status">
              <OpsReferralStageDropdown
                className="w-full"
                item={item}
                saving={isSaving("stage")}
                onChange={(value) => onUpdate(item, "stage", value)}
              />
            </DetailField>
            <DetailField label="추천 날짜">
              <div className="text-sm font-normal text-neutral-primary">
                {formatReferralDateTime(item.recommendedAt)}
              </div>
            </DetailField>
            <DetailField label="입사일">
              <OpsReferralDateDropdown
                buttonClassName="w-full"
                label="입사일"
                value={item.hiredAt}
                saving={isSaving("hiredAt")}
                onChange={(value) => onUpdate(item, "hiredAt", value)}
              />
            </DetailField>
            <DetailField label="정산완료일">
              <OpsReferralDateDropdown
                buttonClassName="w-full"
                label="정산완료일"
                value={item.settlementCompletedAt}
                saving={isSaving("settlementCompletedAt")}
                onChange={(value) =>
                  onUpdate(item, "settlementCompletedAt", value)
                }
              />
            </DetailField>
            <DetailField label="보상지급 예정일">
              <div className="text-sm font-normal text-neutral-primary">
                {formatReferralDateOnly(item.rewardDueAt)}
              </div>
              <p className="mt-1 text-[13px] font-light text-neutral-soft">
                입사일과 정산완료일 중 늦은 날짜로부터 90일 뒤에 자동
                계산됩니다.
              </p>
            </DetailField>
            <DetailField label="보상지급완료여부">
              <OpsReferralRewardPaidDropdown
                buttonClassName="w-full"
                value={item.rewardPaid}
                saving={isSaving("rewardPaid")}
                onChange={(value) => onUpdate(item, "rewardPaid", value)}
              />
            </DetailField>
            <DetailField label="보상지급일">
              <OpsReferralDateDropdown
                buttonClassName="w-full"
                label="보상지급일"
                value={item.rewardPaidAt}
                saving={isSaving("rewardPaidAt")}
                onChange={(value) => onUpdate(item, "rewardPaidAt", value)}
              />
            </DetailField>
            <DetailField label="금액">
              <OpsReferralAmountDropdown
                buttonClassName="w-full max-w-none"
                value={item.amount}
                saving={isSaving("amount")}
                onChange={(value) => onUpdate(item, "amount", value)}
              />
            </DetailField>
            <DetailField label="메모">
              <MemoEditor
                key={item.recommendationId}
                item={item}
                saving={isSaving("memo")}
                onSave={(value) => onUpdate(item, "memo", value)}
              />
            </DetailField>
            <section className="pt-1">
              <div className="rounded-md shadow-sm border border-neutral-1000-a05 bg-bg-floating p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-primary">
                    지급정보 요청
                  </div>
                  <p className="mt-1 text-[13px] font-light leading-5 text-neutral-muted">
                    초대한 사람에게 본인·세무·계좌정보 입력 링크를 보냅니다.
                    후보자와 채용 회사 정보는 메일에 포함하지 않습니다.
                  </p>
                </div>

                <BareButton
                  type="button"
                  disabled={
                    sendingPayoutRequest ||
                    payoutSubmitted ||
                    !item.referrer.email
                  }
                  onClick={() => void sendPayoutInformationRequest()}
                  className={cx(
                    opsTheme.buttonPrimary,
                    "mt-4 h-9 w-full px-3 text-[13px]"
                  )}
                >
                  {sendingPayoutRequest && (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {payoutSubmitted
                    ? "지급정보 제출 완료"
                    : hasSentPayoutRequest
                      ? "지급정보 안내 메일 다시 보내기"
                      : "지급정보 안내 메일 보내기"}
                </BareButton>
                {!item.referrer.email && (
                  <p className="mt-2 text-[13px] text-critical">
                    초대한 사람의 이메일이 없어 발송할 수 없습니다.
                  </p>
                )}
                {payoutRequestError && (
                  <div className={cx(opsTheme.errorNotice, "mt-3 text-[13px]")}>
                    {payoutRequestError}
                  </div>
                )}
                {payoutRequestNotice && (
                  <div className="mt-3 rounded-md border border-positive/20 bg-positive/5 px-3 py-2 text-[13px] text-positive">
                    {payoutRequestNotice}
                  </div>
                )}

                <div className="mt-5 border-t border-neutral-1000-a10 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-neutral-soft">
                      발송·제출 이력
                    </span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-1 text-[13px] font-medium",
                        payoutSubmitted
                          ? "bg-positive/10 text-positive"
                          : hasSentPayoutRequest
                            ? "bg-bg-weak text-neutral-secondary"
                            : "bg-bg-weak text-neutral-muted"
                      )}
                    >
                      {payoutSubmitted
                        ? "제출 완료"
                        : hasSentPayoutRequest
                          ? "제출 대기"
                          : "미발송"}
                    </span>
                  </div>
                  {payoutEvents.length === 0 ? (
                    <p className="mt-3 text-[13px] font-light text-neutral-muted">
                      아직 안내 메일을 보내지 않았습니다.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {payoutEvents.map((event, index) => (
                        <div
                          key={`${event.type}:${event.at}:${index}`}
                          className="flex items-start gap-3"
                        >
                          <div
                            className={cx(
                              "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                              event.type === "submitted"
                                ? "bg-positive/10 text-positive"
                                : "bg-bg-weak text-neutral-muted"
                            )}
                          >
                            {event.type === "submitted" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Clock3 className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-neutral-primary">
                              {event.label}
                            </div>
                            <div className="mt-0.5 text-[13px] font-light text-neutral-muted">
                              {formatReferralDateTime(event.at)} ·{" "}
                              {event.description}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
});
