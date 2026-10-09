import Link from "next/link";
import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PREVIEW_CARDS,
  PREVIEW_SUBSCRIPTIONS,
  previewCard,
  type OrgBillingPreview,
} from "@/lib/org/billing/preview";
import { BillingIntervalTabs } from "@/components/org/billing/BillingIntervalTabs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgBillingPreview } from "@/store/useOrgBillingPreviewStore";
import {
  MAX_SLOT_PURCHASE_QUANTITY,
  isSlotPurchaseQuantity,
  type BillingInterval,
} from "@/lib/org/billing/types";
import { buildOrgHref } from "@/lib/org/routes";

export function OrgBillingDevControls({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { locale } = useOrgLocale();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const { available, preview, setPreview, userId } =
    useOrgBillingPreview(workspaceId);
  const inputId = useId();
  const [input, setInput] = useState<string | null>(null);
  if (!available || !userId) return null;
  const select = (
    slotCount: number,
    interval: BillingInterval = preview?.interval ?? "month"
  ) => {
    setInput(null);
    setPreview({
      ...preview,
      userId,
      slotCount,
      interval,
      subscription: slotCount === 0 ? "active" : preview?.subscription,
      slotRenewals: undefined,
      startedAt: preview?.startedAt ?? new Date().toISOString(),
    });
  };
  const update = (patch: Partial<OrgBillingPreview>) =>
    setPreview({
      userId,
      slotCount: 2,
      interval: "month",
      startedAt: new Date().toISOString(),
      ...preview,
      ...patch,
    });
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-neutral-1000-a10 pt-4">
      <legend className="text-[13px] font-medium text-neutral-primary">
        {c("플랜 · 슬롯 미리보기", "Plan & slot preview")}
      </legend>
      <div className="flex flex-wrap gap-2">
        <MuteButton
          aria-pressed={!preview}
          variant={!preview ? "dark" : "default"}
          onClick={() => {
            setInput(null);
            setPreview(null);
          }}
        >
          {c("실제 상태", "Actual plan")}
        </MuteButton>
        {[0, 1, 2, 3, 5].map((count) => (
          <MuteButton
            key={count}
            aria-pressed={preview?.slotCount === count}
            variant={preview?.slotCount === count ? "dark" : "default"}
            onClick={() => select(count)}
          >
            {count === 0
              ? "Free"
              : c(
                  `슬롯 ${count}개`,
                  `${count} ${count === 1 ? "slot" : "slots"}`
                )}
          </MuteButton>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PreviewSelect
          label={c("결제 카드", "Payment card")}
          value={preview ? previewCard(preview) : "none"}
          options={Object.entries(PREVIEW_CARDS).map(([value, card]) => ({
            value,
            label: card[locale],
          }))}
          onChange={(card) =>
            update({ card: card as OrgBillingPreview["card"] })
          }
        />
        <PreviewSelect
          label={c("구독 상태", "Subscription state")}
          value={preview?.subscription ?? "active"}
          options={Object.entries(PREVIEW_SUBSCRIPTIONS).map(
            ([value, labels]) => ({
              value,
              label: labels[locale === "ko" ? 0 : 1],
            })
          )}
          onChange={(subscription) =>
            update({
              subscription: subscription as OrgBillingPreview["subscription"],
              slotCount:
                subscription === "mixed"
                  ? Math.max(5, preview?.slotCount ?? 0)
                  : Math.max(1, preview?.slotCount ?? 0),
              slotRenewals: undefined,
            })
          }
        />
        <PreviewSelect
          label={c("남은 크레딧", "Credit balance")}
          value={preview?.credits ?? "full"}
          options={[
            { value: "full", label: c("전부 남음", "Full") },
            { value: "low", label: c("3개 남음", "3 remaining") },
            { value: "empty", label: c("소진 · 0개", "Exhausted · 0") },
          ]}
          onChange={(credits) =>
            update({ credits: credits as OrgBillingPreview["credits"] })
          }
        />
        <PreviewSelect
          label={c("결제·사용 내역", "Invoice & usage history")}
          value={preview?.history ?? "empty"}
          options={[
            { value: "empty", label: c("내역 없음", "Empty") },
            {
              value: "sample",
              label: c(
                "예시 내역 · 여러 페이지",
                "Sample history · multiple pages"
              ),
            },
          ]}
          onChange={(history) =>
            update({ history: history as OrgBillingPreview["history"] })
          }
        />
        <PreviewSelect
          label={c("결제 시도 결과", "Checkout result")}
          value={preview?.checkoutOutcome ?? "success"}
          options={[
            { value: "success", label: c("결제 성공", "Success") },
            { value: "declined", label: c("카드 거절", "Card declined") },
            {
              value: "authentication",
              label: c("추가 인증 필요", "Authentication required"),
            },
          ]}
          onChange={(checkoutOutcome) =>
            update({
              checkoutOutcome:
                checkoutOutcome as OrgBillingPreview["checkoutOutcome"],
            })
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="text-[12px] text-neutral-muted">
          {c("유료 슬롯 수", "Paid slots")}
        </label>
        <div className="flex items-center gap-2">
          <MuteButton
            aria-label={c("미리보기 슬롯 줄이기", "Fewer preview slots")}
            disabled={!preview || preview.slotCount <= 1}
            onClick={() => preview && select(preview.slotCount - 1)}
          >
            <Minus aria-hidden className="size-4" />
          </MuteButton>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            className="w-20"
            min={1}
            max={MAX_SLOT_PURCHASE_QUANTITY}
            step={1}
            placeholder="1–100"
            value={
              input ??
              (preview && preview.slotCount > 0 ? preview.slotCount : "")
            }
            onBlur={() => setInput(null)}
            onChange={(event) => {
              setInput(event.target.value);
              const count = Number(event.target.value);
              if (isSlotPurchaseQuantity(count)) select(count);
            }}
          />
          <MuteButton
            aria-label={c("미리보기 슬롯 늘리기", "More preview slots")}
            disabled={(preview?.slotCount ?? 0) >= MAX_SLOT_PURCHASE_QUANTITY}
            onClick={() => select((preview?.slotCount ?? 0) + 1)}
          >
            <Plus aria-hidden className="size-4" />
          </MuteButton>
        </div>
        {preview && preview.slotCount > 0 && (
          <BillingIntervalTabs
            locale={locale}
            value={preview.interval}
            onChange={(interval) => select(preview.slotCount, interval)}
          />
        )}
      </div>
      <p
        aria-live="polite"
        className="text-[12px] leading-5 text-neutral-muted"
      >
        {preview
          ? c(
              `${preview.slotCount === 0 ? "Free · 공용 10크레딧" : `유료 슬롯 ${preview.slotCount}개`} 미리보기 중이에요.`,
              `Previewing ${preview.slotCount === 0 ? "Free · 10 shared credits" : `${preview.slotCount} paid ${preview.slotCount === 1 ? "slot" : "slots"}`}.`
            )
          : c("실제 플랜을 표시하고 있어요.", "Showing the actual plan.")}{" "}
        {c(
          "이 브라우저의 Harper Workspace에만 적용돼요. 실제 구독·결제·Role은 바뀌지 않아요.",
          "Applies only to Harper in this browser. Actual subscriptions, payments and Roles stay unchanged."
        )}
      </p>
      <div className="flex gap-2">
        {(["slots", "billing"] as const).map((page) => (
          <MuteButton asChild key={page}>
            <Link href={buildOrgHref({ orgId: workspaceId, page })}>
              {page === "slots"
                ? c("Slots 보기", "View Slots")
                : c("Billing 보기", "View Billing")}
            </Link>
          </MuteButton>
        ))}
      </div>
    </fieldset>
  );
}

function PreviewSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5 text-[12px] text-neutral-muted">
      <label htmlFor={id}>{label}</label>
      <Select
        value={value}
        items={options}
        onValueChange={(value) => {
          if (value && options.some((option) => option.value === value))
            onChange(value);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function OrgBillingPreviewNotice({
  workspaceId,
  onRestore,
}: {
  workspaceId: string;
  onRestore?: () => void;
}) {
  const { locale } = useOrgLocale();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const { preview, setPreview } = useOrgBillingPreview(workspaceId);
  if (!preview) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info-faded px-4 py-3 text-[12px]">
      <p role="status">
        {c(
          `UI 미리보기 · ${preview.slotCount === 0 ? "Free" : `슬롯 ${preview.slotCount}개`}. 실제 구독은 변경되지 않아요.`,
          `UI preview · ${preview.slotCount === 0 ? "Free" : `${preview.slotCount} ${preview.slotCount === 1 ? "slot" : "slots"}`}. Actual subscriptions stay unchanged.`
        )}
      </p>
      <div className="flex gap-2">
        <MuteButton asChild size="sm">
          <Link href={buildOrgHref({ orgId: workspaceId, page: "home" })}>
            {c("미리보기 설정", "Preview settings")}
          </Link>
        </MuteButton>
        <MuteButton
          size="sm"
          onClick={() => {
            setPreview(null);
            onRestore?.();
          }}
        >
          {c("실제 상태로 복원", "Show actual plan")}
        </MuteButton>
      </div>
      <details className="w-full">
        <summary className="cursor-pointer text-neutral-muted">
          {c("미리보기 상태 바꾸기", "Change preview state")}
        </summary>
        <div className="pt-4">
          <OrgBillingDevControls workspaceId={workspaceId} />
        </div>
      </details>
    </div>
  );
}
