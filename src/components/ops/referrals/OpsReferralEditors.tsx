import {
  parseOpsDateOnly,
  toOpsDateOnly,
} from "@/components/ops/OpsDateRangeFilter";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input as UiInput } from "@/components/ui/input";
import {
  type OpsReferralItem,
  type OpsReferralStageOption,
} from "@/lib/ops/referrals";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronDown, LoaderCircle } from "lucide-react";
import { memo, useState } from "react";
import { formatReferralDateOnly } from "./shared";

function getStageClassName(stage: string) {
  if (stage === "pending_connection") {
    return "border-primary/20 bg-primary-faded text-primary";
  }
  if (stage === "final_offer") {
    return "border-black bg-black text-neutral-00";
  }
  if (stage === "process_stopped") {
    return "border-critical/20 bg-critical-faded text-critical";
  }
  return "border-neutral-1000-a10 bg-bg-floating text-neutral-primary";
}

export const OpsReferralStageDropdown = memo(function OpsReferralStageDropdown({
  className,
  item,
  onChange,
  saving,
}: {
  className?: string;
  item: OpsReferralItem;
  onChange: (stage: string) => Promise<boolean>;
  saving: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          onClick={(event) => event.stopPropagation()}
          disabled={saving}
          className={cx(
            "inline-flex h-8 max-w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-[13px] font-medium disabled:opacity-60",
            getStageClassName(item.currentStage),
            className
          )}
        >
          <span className="truncate">{item.currentStageLabel}</span>
          {saving ? (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        {item.stageOptions.map((option) => (
          <DropdownMenuItem
            key={option.id}
            selected={option.id === item.currentStage}
            onSelect={() => {
              if (option.id !== item.currentStage) void onChange(option.id);
            }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export const OpsReferralDateDropdown = memo(function OpsReferralDateDropdown({
  buttonClassName,
  label,
  onChange,
  saving,
  value,
}: {
  buttonClassName?: string;
  label: string;
  onChange: (value: string | null) => Promise<boolean>;
  saving: boolean;
  value: string | null;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseOpsDateOnly(value) : undefined;
  const saveDate = async (nextValue: string | null) => {
    const saved = await onChange(nextValue);
    if (saved) setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <BareButton
          type="button"
          aria-label={`${label} 변경`}
          onClick={(event) => event.stopPropagation()}
          disabled={saving}
          className={cx(
            "inline-flex h-8 min-w-[112px] items-center justify-between gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default px-2.5 text-[13px] font-normal text-neutral-primary transition hover:border-neutral-1000-a10 hover:bg-bg-weak disabled:opacity-60",
            buttonClassName
          )}
        >
          <span className={cx("truncate", !value && "text-neutral-soft")}>
            {formatReferralDateOnly(value)}
          </span>
          {saving ? (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
          )}
        </BareButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          onClick={(event) => event.stopPropagation()}
          className="z-[140] w-[300px] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-2 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] outline-none"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) void saveDate(toOpsDateOnly(date));
            }}
            className="p-2 text-[13px] [--cell-size:1.85rem]"
          />
          <div className="mt-1 flex justify-end border-t border-neutral-1000-a05 pt-2">
            <BareButton
              type="button"
              disabled={!value || saving}
              onClick={() => void saveDate(null)}
              className="h-7 rounded-md px-2 text-[13px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:opacity-40"
            >
              날짜 없음
            </BareButton>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

export const OpsReferralRewardPaidDropdown = memo(
  function OpsReferralRewardPaidDropdown({
    buttonClassName,
    onChange,
    saving,
    value,
  }: {
    buttonClassName?: string;
    onChange: (value: boolean) => Promise<boolean>;
    saving: boolean;
    value: boolean;
  }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BareButton
            type="button"
            onClick={(event) => event.stopPropagation()}
            disabled={saving}
            className={cx(
              "inline-flex h-8 min-w-[96px] items-center justify-between gap-2 rounded-md border px-2.5 text-[13px] font-medium disabled:opacity-60",
              value
                ? "border-positive/25 bg-positive-faded text-positive"
                : "border-neutral-1000-a05 bg-bg-default text-neutral-muted",
              buttonClassName
            )}
          >
            <span>{value ? "true" : "false"}</span>
            {saving ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </BareButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-32"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            selected={value}
            onSelect={() => void onChange(true)}
          >
            true
          </DropdownMenuItem>
          <DropdownMenuItem
            selected={!value}
            onSelect={() => void onChange(false)}
          >
            false
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

export const OpsReferralAmountDropdown = memo(
  function OpsReferralAmountDropdown({
    buttonClassName,
    onChange,
    saving,
    value,
  }: {
    buttonClassName?: string;
    onChange: (value: string | null) => Promise<boolean>;
    saving: boolean;
    value: string | null;
  }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value ?? "");
    const handleOpenChange = (nextOpen: boolean) => {
      if (nextOpen) setDraft(value ?? "");
      setOpen(nextOpen);
    };
    const save = async () => {
      const saved = await onChange(draft.trim() || null);
      if (saved) setOpen(false);
    };

    return (
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>
          <BareButton
            type="button"
            onClick={(event) => event.stopPropagation()}
            disabled={saving}
            className={cx(
              "inline-flex h-8 min-w-[120px] max-w-[180px] items-center justify-between gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default px-2.5 text-[13px] font-normal text-neutral-primary transition hover:bg-bg-weak disabled:opacity-60",
              buttonClassName
            )}
          >
            <span className={cx("truncate", !value && "text-neutral-soft")}>
              {value || "없음"}
            </span>
            {saving ? (
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
            )}
          </BareButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            onClick={(event) => event.stopPropagation()}
            className="z-[140] w-[280px] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] outline-none"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="text-[13px] font-medium text-neutral-primary">
                금액
                <UiInput
                  unstyled
                  autoFocus
                  type="text"
                  value={draft}
                  maxLength={200}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="예: 1,000,000원"
                  className={cx(opsTheme.input, "mt-2 h-9 w-full")}
                />
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <BareButton
                  type="button"
                  onClick={() => setDraft("")}
                  className="h-8 rounded-md px-2.5 text-[13px] font-normal text-neutral-muted hover:bg-bg-weak"
                >
                  비우기
                </BareButton>
                <BareButton
                  type="submit"
                  disabled={saving}
                  className={cx(opsTheme.buttonPrimary, "h-8 px-3 text-[13px]")}
                >
                  저장
                </BareButton>
              </div>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
);

export function OpsReferralFilterDropdown({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly OpsReferralStageOption[];
  value: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BareButton
          type="button"
          className={cx(
            "inline-flex h-9 max-w-[220px] items-center justify-between gap-2 rounded-md border px-3 text-[13px] font-medium transition",
            value
              ? "border-primary/20 bg-primary-faded text-primary"
              : "border-neutral-1000-a05 bg-bg-default text-neutral-muted hover:border-neutral-1000-a10"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BareButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id || "all"}
            selected={option.id === value}
            onSelect={() => onChange(option.id)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
