import { useState } from "react";
import { CreditCard, ArrowLeft, Check } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgBillingPreview } from "@/store/useOrgBillingPreviewStore";
import {
  PREVIEW_CARDS,
  previewCard,
  previewCatalog,
} from "@/lib/org/billing/preview";
import {
  formatBillingMoney,
  type BillingCatalog,
  type BillingInterval,
} from "@/lib/org/billing/types";

export type PreviewCheckout = { quantity: number; interval: BillingInterval };

export function OrgBillingPaymentPreview({
  workspaceId,
  onOpen,
}: {
  workspaceId: string;
  onOpen: () => void;
}) {
  const { preview } = useOrgBillingPreview(workspaceId);
  const { locale } = useOrgLocale();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  if (!preview) return null;
  const card = previewCard(preview);
  return (
    <section className="space-y-3">
      <h2 className="text-base">
        {c("결제 수단 · 미리보기", "Payment method · preview")}
      </h2>
      <Card className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-bg-default px-5 py-4 shadow-none">
        <div className="flex items-center gap-3">
          <CreditCard aria-hidden className="size-5 text-neutral-muted" />
          <div className="text-[13px]">
            <p>
              {card === "none"
                ? c("등록된 카드가 없어요", "No card saved")
                : PREVIEW_CARDS[card].label}
            </p>
            <p
              className={`mt-1 text-[12px] ${card === "expired" ? "text-critical" : "text-neutral-muted"}`}
            >
              {card === "none"
                ? c(
                    "예시 카드를 등록해 볼 수 있어요.",
                    "Try adding a sample card."
                  )
                : card === "expired"
                  ? c(
                      "만료된 카드예요. 결제 수단을 변경해 주세요.",
                      "This card has expired. Update your payment method."
                    )
                  : c(
                      `기본 결제 수단 · 만료 ${PREVIEW_CARDS[card].expiry}`,
                      `Default payment method · expires ${PREVIEW_CARDS[card].expiry}`
                    )}
            </p>
          </div>
        </div>
        <MuteButton onClick={onOpen}>
          {card === "none"
            ? c("카드 등록", "Add a card")
            : c("카드 변경", "Change card")}
        </MuteButton>
      </Card>
      <p className="text-[12px] text-neutral-soft">
        {c(
          "실제 카드 관리는 Stripe에서 열려요. 아래 흐름은 예시 UI이며 Stripe 화면과 다를 수 있어요.",
          "Actual card management opens in Stripe. This sample UI may differ from Stripe’s screens."
        )}
      </p>
    </section>
  );
}

export function OrgBillingPortalPreview({
  workspaceId,
  open,
  onClose,
  checkout,
  catalog,
  onComplete,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  checkout: PreviewCheckout | null;
  catalog?: BillingCatalog;
  onComplete: () => void;
}) {
  return open ? (
    <PortalContent
      workspaceId={workspaceId}
      checkout={checkout}
      catalog={catalog}
      onClose={onClose}
      onComplete={onComplete}
    />
  ) : null;
}

function PortalContent({
  workspaceId,
  checkout,
  catalog,
  onClose,
  onComplete,
}: {
  workspaceId: string;
  checkout: PreviewCheckout | null;
  catalog?: BillingCatalog;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { preview, setPreview } = useOrgBillingPreview(workspaceId);
  const { locale } = useOrgLocale();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<keyof typeof PREVIEW_CARDS>(
    preview ? previewCard(preview) : "none"
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(false);
  const [retry, setRetry] = useState(false);
  if (!preview) return null;
  const card = previewCard(preview);
  const prices = previewCatalog(catalog);
  const failedSlotIds = Array.from(
    { length: preview.slotCount },
    (_, index) => ({
      id: `billing-preview-${index + 1}`,
      index,
    })
  )
    .filter(
      ({ id, index }) =>
        !preview.slotRenewals?.[id] &&
        (preview.subscription === "past_due" ||
          (preview.subscription === "mixed" && index % 5 === 2))
    )
    .map(({ id }) => id);
  const amount =
    checkout?.interval === "year" ? prices.annualAmount : prices.amount;
  const complete = () => {
    if (!checkout) return;
    setPreview({
      ...preview,
      slotCount: Math.min(
        100,
        (preview.subscription === "ended" ? 0 : preview.slotCount) +
          checkout.quantity
      ),
      interval: checkout.interval,
      subscription: "active",
      credits: "full",
      history: "sample",
      slotRenewals: undefined,
    });
    onComplete();
  };
  const pay = () => {
    setError("");
    if (card === "none" || card === "expired") {
      setError(
        c(
          "사용 가능한 예시 카드를 등록해 주세요.",
          "Add a valid sample card to continue."
        )
      );
      return;
    }
    if (preview.checkoutOutcome === "declined" && !retry) {
      setError(
        c(
          "카드 결제가 거절됐어요. 다른 예시 카드로 변경하거나 성공 상태로 다시 시도해 보세요.",
          "The card was declined. Change the sample card or retry with a successful result."
        )
      );
      setRetry(true);
      return;
    }
    if (preview.checkoutOutcome === "authentication") {
      setAuth(true);
      return;
    }
    complete();
  };
  return (
    <TalentCareerModal
      open
      onClose={onClose}
      mobileBottomSheet
      title={
        checkout
          ? c("결제 미리보기", "Checkout preview")
          : c("결제 관리 미리보기", "Billing management preview")
      }
      description={c(
        "Harper 내부 UI 미리보기예요. 예시 카드만 사용하며 실제 등록·청구는 일어나지 않아요. Stripe의 실제 화면과는 다를 수 있어요.",
        "Internal UI preview with sample cards only. Nothing is saved to Stripe or charged. Actual Stripe screens may differ."
      )}
      panelClassName="max-w-xl"
      bodyClassName="px-4 pb-5 sm:px-5"
    >
      {editing ? (
        <div className="space-y-4 py-3">
          <MuteButton variant="transparent" onClick={() => setEditing(false)}>
            <ArrowLeft aria-hidden />
            {c("결제 관리로 돌아가기", "Back to billing")}
          </MuteButton>
          <h3 className="text-sm font-medium">
            {c("예시 카드 선택", "Choose a sample card")}
          </h3>
          <div className="grid gap-2">
            {(["visa", "mastercard", "expired"] as const).map((value) => (
              <MuteButton
                key={value}
                aria-pressed={selected === value}
                variant={selected === value ? "neutral" : "default"}
                onClick={() => setSelected(value)}
              >
                <CreditCard aria-hidden />
                {PREVIEW_CARDS[value].label} · {PREVIEW_CARDS[value].expiry}
                {value === "expired" && c(" · 만료", " · Expired")}
                {selected === value && <Check aria-hidden />}
              </MuteButton>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton
              variant="primary"
              disabled={selected === "none"}
              onClick={() => {
                setPreview({ ...preview, card: selected });
                setEditing(false);
                setError("");
                setMessage(
                  c(
                    "예시 카드를 기본 결제 수단으로 변경했어요.",
                    "The sample card is now the default payment method."
                  )
                );
              }}
            >
              {c("기본 카드로 저장", "Save as default card")}
            </MuteButton>
          </div>
        </div>
      ) : auth ? (
        <div className="space-y-4 py-5">
          <h3 className="font-medium">
            {c("추가 카드 인증", "Card authentication")}
          </h3>
          <p className="text-sm text-neutral-muted">
            {c(
              "실제 결제에서는 카드사 인증 화면이 열리는 단계예요. 여기서는 인증 결과를 선택해 보세요.",
              "A real checkout may open the card issuer’s authentication screen here. Choose a simulated result."
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton
              onClick={() => {
                setAuth(false);
                setError(
                  c(
                    "인증을 완료하지 않았어요. 다시 시도할 수 있어요.",
                    "Authentication was not completed. You can try again."
                  )
                );
              }}
            >
              {c("인증 취소", "Cancel authentication")}
            </MuteButton>
            <MuteButton variant="primary" onClick={complete}>
              {c("인증 완료 가정", "Simulate authentication success")}
            </MuteButton>
          </div>
        </div>
      ) : (
        <div className="space-y-5 py-3">
          {checkout && (
            <div className="rounded-lg bg-bg-weak p-4">
              <p className="text-sm">
                {c(
                  `슬롯 ${checkout.quantity}개 추가 · ${checkout.interval === "year" ? "연간" : "월간"}`,
                  `Add ${checkout.quantity} slots · ${checkout.interval === "year" ? "Yearly" : "Monthly"}`
                )}
              </p>
              <p className="mt-2 text-2xl">
                {formatBillingMoney(
                  (amount ?? 0) * checkout.quantity,
                  prices.currency ?? "usd",
                  locale
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-muted">
                {c("예시 결제 금액 · 세금 별도", "Preview amount · before tax")}
              </p>
            </div>
          )}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              {c("기본 결제 수단", "Default payment method")}
            </h3>
            <div className="flex items-center gap-3 rounded-lg border border-neutral-1000-a10 p-4">
              <CreditCard aria-hidden className="size-6 text-neutral-muted" />
              <div className="text-sm">
                <p>
                  {card === "none"
                    ? c("등록된 카드 없음", "No card saved")
                    : PREVIEW_CARDS[card].label}
                </p>
                <p
                  className={`mt-1 text-xs ${card === "expired" ? "text-critical" : "text-neutral-muted"}`}
                >
                  {card === "none"
                    ? c(
                        "카드를 추가해 결제를 진행할 수 있어요.",
                        "Add a card to continue."
                      )
                    : `${PREVIEW_CARDS[card].expiry}${card === "expired" ? c(" · 만료됨", " · Expired") : ""}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <MuteButton
                onClick={() => {
                  setSelected(card === "none" ? "visa" : card);
                  setEditing(true);
                  setMessage("");
                }}
              >
                {card === "none"
                  ? c("카드 추가", "Add a card")
                  : c("카드 변경", "Change card")}
              </MuteButton>
              {card !== "none" && (
                <MuteButton
                  variant="transparent"
                  onClick={() => {
                    setPreview({ ...preview, card: "none" });
                    setMessage(
                      c(
                        "예시 카드를 삭제했어요.",
                        "The sample card was removed."
                      )
                    );
                  }}
                >
                  {c("카드 삭제", "Remove card")}
                </MuteButton>
              )}
            </div>
          </div>
          {!checkout && failedSlotIds.length > 0 && (
            <div className="space-y-3 rounded-lg bg-info-faded p-4 text-sm">
              <p>
                {c(
                  "결제 실패한 구독이 있어요. 카드 변경 후 재결제 결과를 확인해 보세요.",
                  "A subscription payment failed. Update the card and simulate a retry."
                )}
              </p>
              <MuteButton
                disabled={card === "none" || card === "expired"}
                onClick={() => {
                  setPreview({
                    ...preview,
                    slotRenewals: {
                      ...preview.slotRenewals,
                      ...Object.fromEntries(
                        failedSlotIds.map((id) => [id, "active" as const])
                      ),
                    },
                    history: "sample",
                  });
                  setMessage(
                    c(
                      "재결제 성공 상태로 변경했어요.",
                      "Preview updated to a successful payment."
                    )
                  );
                }}
              >
                {c("재결제 성공 가정", "Simulate successful retry")}
              </MuteButton>
            </div>
          )}
          {message && (
            <p role="status" className="text-sm text-positive">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton onClick={onClose}>
              {c("돌아가기", "Go back")}
            </MuteButton>
            {checkout && (
              <MuteButton variant="primary" onClick={pay}>
                {retry
                  ? c("성공 상태로 다시 시도", "Retry with success")
                  : c("예시 결제 진행", "Simulate payment")}
              </MuteButton>
            )}
          </div>
        </div>
      )}
    </TalentCareerModal>
  );
}
