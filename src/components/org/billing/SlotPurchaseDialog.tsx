import { useId, useState } from "react";
import { CircleCheck, Layers, LoaderCircle, Minus, Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { BillingIntervalTabs } from "./BillingIntervalTabs";
import {
  BILLING_SUPPORT_HREF,
  MAX_SLOT_PURCHASE_QUANTITY,
  formatBillingMoney,
  isSlotPurchaseQuantity,
  type BillingCatalog,
  type BillingInterval,
} from "@/lib/org/billing/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: "ko" | "en";
  catalog?: BillingCatalog;
  initialInterval: BillingInterval;
  initialQuantity?: number;
  busy: boolean;
  error: string;
  onCheckout: (interval: BillingInterval, quantity: number) => void;
};

export function SlotPurchaseDialog(props: Props) {
  return props.open ? <SlotPurchaseForm {...props} /> : null;
}

function SlotPurchaseForm({
  open,
  locale,
  catalog,
  initialInterval,
  initialQuantity = 1,
  busy,
  error,
  onCheckout,
  onOpenChange,
}: Props) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const id = useId();
  const [interval, setInterval] = useState(initialInterval);
  const [input, setInput] = useState(
    String(isSlotPurchaseQuantity(initialQuantity) ? initialQuantity : 1)
  );
  const quantity = Number(input);
  const valid = isSlotPurchaseQuantity(quantity);
  const amount = interval === "year" ? catalog?.annualAmount : catalog?.amount;
  const available = catalog?.available && amount != null && catalog.currency;
  const formId = `${id}-form`;
  const money = (value: number) =>
    formatBillingMoney(value, catalog?.currency ?? "usd", locale, {
      currencyDisplay: "narrowSymbol",
    });
  const features = [
    c("한 슬롯당 하나의 Role을 배정할 수 있어요.", ""),
    c(
      "배정된 Role은 직접 intro 요청을 보내지 않아도 Harper가 먼저 후보자에게 역할을 추천하고, 만나보겠다고 한 사람을 소개해드릴 수 있어요. 월 50크레딧을 제공합니다.",
      ""
    ),
    c(
      "전체 Role 공용 월 10크레딧은 별도로 유지돼요. 모든 크레딧은 이월되지 않아요.",
      ""
    ),
    c(
      "슬롯별로 갱신을 취소할 수 있고, 결제한 기간 끝까지 이용할 수 있어요.",
      "Cancel renewal for individual slots anytime and keep access through the paid period."
    ),
  ];
  return (
    <TalentCareerModal
      open={open}
      onClose={() => !busy && onOpenChange(false)}
      title={c("슬롯 추가하기", "Add slots")}
      headerActions={
        <BillingIntervalTabs
          locale={locale}
          value={interval}
          onChange={setInterval}
          disabled={busy}
          annualDiscountLabel="20% OFF"
        />
      }
      mobileBottomSheet
      closeOnBackdrop={!busy}
      showCloseButton={false}
      panelClassName="max-w-lg"
      bodyClassName="px-4 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            type="button"
            size="md"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {c("닫기", "Close")}
          </MuteButton>
          {available ? (
            <MuteButton
              form={formId}
              type="submit"
              variant="dark"
              size="md"
              disabled={busy || !valid}
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {c("결제하러 가기", "Continue to checkout")}
            </MuteButton>
          ) : (
            <MuteButton asChild variant="primary" size="md">
              <a href={BILLING_SUPPORT_HREF}>
                {c("Harper 팀에 문의", "Contact Harper")}
              </a>
            </MuteButton>
          )}
        </div>
      }
    >
      <form
        id={formId}
        className="py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && available && !busy) onCheckout(interval, quantity);
        }}
      >
        <div className="space-y-6 rounded-[20px] border-2 border-action bg-action-faded p-4 sm:p-5">
          <div aria-live="polite" aria-atomic="true">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[22px] font-medium leading-tight tracking-tight tabular-nums">
                {valid
                  ? `${quantity} ${quantity === 1 ? "Slot" : "Slots"}`
                  : "—"}
              </p>
              <p className="ml-auto text-right text-[24px] font-medium leading-tight tracking-tight tabular-nums">
                {available && valid ? money(amount * quantity) : "—"}
              </p>
            </div>
            {interval === "year" && available && valid && (
              <p className="mt-3 text-[13px] leading-6 text-neutral-muted">
                {c(
                  `슬롯당 월 ${money(amount / 12)} · 1년 이용료를 한 번에 결제합니다.`,
                  `${money(amount / 12)} per slot / month, billed upfront for one year.`
                )}
              </p>
            )}
            {/* {available && catalog.taxBehavior !== "inclusive" && (
              <p className="mt-2 text-xs text-neutral-muted">
                {c(
                  "세금은 결제 시 적용돼요.",
                  "Applicable taxes are calculated at checkout."
                )}
              </p>
            )} */}
          </div>
          <ul
            role="list"
            className="space-y-3 text-[13px] leading-5 text-neutral-primary"
          >
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 size-[18px] shrink-0 text-action"
                />
                <span className="min-w-0 break-keep">{feature}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Layers
                  aria-hidden="true"
                  className="size-4 shrink-0 text-neutral-primary"
                />
                <div className="min-w-0">
                  <label htmlFor={id} className="block text-sm font-medium">
                    {c("슬롯 수", "Number of slots")}
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 items-center rounded-lg bg-bg-floating p-1 focus-within:ring-2 focus-within:ring-action/20">
                <MuteButton
                  type="button"
                  size="md"
                  variant="transparent"
                  className="h-7 w-7 p-0 shadow-none"
                  aria-label={c("슬롯 하나 줄이기", "Remove one slot")}
                  disabled={busy || !valid || quantity <= 1}
                  onClick={() => setInput(String(quantity - 1))}
                >
                  <Minus className="size-4" />
                </MuteButton>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SLOT_PURCHASE_QUANTITY}
                  step={1}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={busy}
                  aria-invalid={!valid}
                  aria-describedby={
                    valid ? `${id}-hint` : `${id}-hint ${id}-error`
                  }
                  className="h-8 w-10 border-0 bg-transparent px-0 py-0 text-center text-[15px] font-medium tabular-nums focus:bg-transparent focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <MuteButton
                  type="button"
                  size="md"
                  variant="transparent"
                  className="h-7 w-7 p-0 shadow-none"
                  aria-label={c("슬롯 하나 추가하기", "Add one slot")}
                  disabled={
                    busy || !valid || quantity >= MAX_SLOT_PURCHASE_QUANTITY
                  }
                  onClick={() => setInput(String(quantity + 1))}
                >
                  <Plus className="size-4" />
                </MuteButton>
              </div>
            </div>
            {!valid && (
              <p id={`${id}-error`} className="text-xs text-critical">
                {c(
                  `1~${MAX_SLOT_PURCHASE_QUANTITY} 사이의 정수를 입력해 주세요.`,
                  `Enter a whole number from 1 to ${MAX_SLOT_PURCHASE_QUANTITY}.`
                )}
              </p>
            )}
          </div>
        </div>
      </form>
    </TalentCareerModal>
  );
}
