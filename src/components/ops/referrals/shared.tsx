import type {
  OpsReferralItem,
  OpsReferralPerson,
  OpsReferralUpdateResponse,
} from "@/lib/ops/referrals";
import { parseOpsDateOnly } from "@/components/ops/OpsDateRangeFilter";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatReferralDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : DATE_FORMATTER.format(date);
}

export function formatReferralDateOnly(value: string | null) {
  if (!value) return "없음";
  const date = parseOpsDateOnly(value);
  return date ? DATE_FORMATTER.format(date) : "없음";
}

export function getReferralPersonLabel(person: OpsReferralPerson) {
  return person.name || person.email || "이름 없음";
}

export function getOpsReferralItemKey(item: OpsReferralItem) {
  return `${item.referred.userId}:${item.roleId}`;
}

export function getOpsReferralSavingKey(item: OpsReferralItem, field: string) {
  return `${getOpsReferralItemKey(item)}:${field}`;
}

export function mergeOpsReferralUpdate(
  item: OpsReferralItem,
  payload: OpsReferralUpdateResponse
) {
  const stageOption = payload.currentStage
    ? item.stageOptions.find((option) => option.id === payload.currentStage)
    : undefined;
  return {
    ...item,
    ...(payload.application ?? {}),
    ...(payload.currentStage
      ? {
          currentStage: payload.currentStage,
          currentStageLabel: stageOption?.label ?? item.currentStageLabel,
        }
      : {}),
  };
}

export function OpsReferralPersonCell({
  person,
}: {
  person: OpsReferralPerson;
}) {
  return (
    <div className="min-w-[190px]">
      <Link
        href={{ pathname: "/ops/career", query: { userId: person.userId } }}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-neutral-primary underline decoration-neutral-1000-a10 underline-offset-4 transition hover:decoration-neutral-800"
      >
        <span className="truncate">{getReferralPersonLabel(person)}</span>
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      </Link>
      {person.email && person.email !== person.name && (
        <div className="mt-1 truncate text-[13px] font-normal text-neutral-muted">
          {person.email}
        </div>
      )}
    </div>
  );
}
