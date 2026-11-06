import { useOrgBillingFormat } from "@/hooks/org/useOrgBillingFormat";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import Link from "next/link";
import { Check, ChevronDown, Info, Plus } from "lucide-react";
import { Ticket } from "@/components/ui/ticket";
import { MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import { OrgRoleStatusDot } from "../OrgRoleStatusDot";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";
import { isOrgRoleCountedAsActive } from "@/lib/org/roleStatus";
import {
  billingAssignmentSlots,
  isBillingRoleVisible,
  type BillingAssignmentRole,
  type BillingAssignmentSlot,
} from "@/lib/org/billing/assignments";
import {
  BILLING_SUPPORT_HREF,
  isEndedBillingSlot,
  SLOT_MONTHLY_CREDITS,
  type BillingCreditSlot,
  type BillingSlot,
  type BillingSummary,
} from "@/lib/org/billing/types";
import { Tooltips } from "@/components/ui/tooltip";
import { useBillingClock } from "@/hooks/org/useBillingClock";
import { BillingSlotMenu } from "./BillingSlotMenu";

export function BillingSlots({
  summary,
  busy,
  canManage,
  canViewBilling,
  roles = [],
  preview = false,
  onAddSlot,
  onCancel,
  onResume,
  onAssign,
  onPortal,
}: {
  summary: BillingSummary;
  busy: boolean;
  canManage: boolean;
  canViewBilling: boolean;
  roles?: BillingAssignmentRole[];
  preview?: boolean;
  onAddSlot: () => void;
  onCancel: (slot: BillingSlot) => void;
  onResume: (slot: BillingSlot) => void;
  onAssign: (slot: BillingAssignmentSlot, roleId: string) => void;
  onPortal: () => void;
}) {
  const { c } = useOrgLocale();
  const { formatBillingDaysUntil, date, formatIntroCount } =
    useOrgBillingFormat();
  const now = useBillingClock();
  const slots = summary.slots.filter((slot) => !isEndedBillingSlot(slot, now));
  const free = summary.creditSlots.find((slot) => slot.slotId === null);
  const contactOnly =
    summary.model === "scale" ||
    (summary.model === "legacy" && summary.activeRoles > 1);
  const creditBySlot = new Map(
    summary.creditSlots.map((slot) => [slot.slotId, slot])
  );
  const visibleRoles = roles.filter(isBillingRoleVisible);
  const assignmentSlots = billingAssignmentSlots(summary);
  const slotByRole = new Map(
    assignmentSlots
      .filter((slot) => slot.roleId)
      .map((slot) => [slot.roleId, slot])
  );
  const canAssignRole = (role: BillingAssignmentRole) =>
    preview || isOrgRoleCountedAsActive(role.status);
  const roleHref = (roleId: string) =>
    buildOrgHref({ page: "jobs", orgId: summary.workspaceId, roleId });
  const slotDetails = (
    slot: BillingCreditSlot | undefined,
    allowance: number,
    remaining: number | null
  ) => {
    const expiresBeforeRenewal = Boolean(
      slot?.cancelAt &&
      (!slot.renewsAt || Date.parse(slot.cancelAt) <= Date.parse(slot.renewsAt))
    );
    const boundary = expiresBeforeRenewal ? slot?.cancelAt : slot?.renewsAt;
    const relative = formatBillingDaysUntil(boundary, now);
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-neutral-600">
          <p>
            {boundary ? (
              <time dateTime={boundary} title={date(boundary, true)}>
                {expiresBeforeRenewal
                  ? c(`${relative} 만료`, `Expires ${relative}`)
                  : c(`${relative} 갱신`, `Resets ${relative}`)}
              </time>
            ) : (
              c("갱신 예정 없음", "No reset scheduled")
            )}
          </p>
          <p className="ml-auto whitespace-nowrap tabular-nums">
            <span className="sr-only">
              {c(
                `남은 ${formatIntroCount(remaining)}`,
                `${formatIntroCount(remaining)} left`
              )}
            </span>
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              {remaining ?? "—"}
              <Ticket size={12} />
              {c("남음", "left")}
            </span>
          </p>
        </div>
        {remaining !== null ? (
          <div
            className="mt-1.5"
            role="meter"
            aria-label={`${slot?.label} · ${c("남은 연결", "Intros left")}`}
            aria-valuemin={0}
            aria-valuemax={allowance}
            aria-valuenow={remaining}
            aria-valuetext={c(
              `${allowance}회 중 ${remaining}회 남음`,
              `${remaining} of ${allowance} intros left`
            )}
          >
            <ProgressBar
              value={allowance ? (remaining / allowance) * 100 : 0}
              className="h-1.5 border-0 bg-neutral-1000-a10"
            />
          </div>
        ) : (
          <div
            className="mt-1.5 h-1.5 rounded-full bg-neutral-1000-a10"
            aria-hidden
          />
        )}
      </div>
    );
  };
  return (
    <OrgSection className="border-b-0 pb-0">
      {free && (
        <div className="mb-12">
          <OrgSectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                {ct(c, COMPANY_TERMS.usage.included)}
                <Ticket />
              </span>
            }
            description={c(
              "매월 드리는 연결이에요. 모든 역할에서 같이 써요.",
              "Renewed monthly, shared across roles."
            )}
          />
          <Card className="rounded-2xl bg-bg-default py-3.5 px-5 shadow-none">
            <p className="text-[14px] font-normal">
              {c("이번 달", "This month")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-neutral-600">
              {free.renewsAt ? (
                <p>
                  <time
                    dateTime={free.renewsAt}
                    title={date(free.renewsAt, true)}
                  >
                    {c(
                      `${formatBillingDaysUntil(free.renewsAt, now)} 갱신`,
                      `Resets ${formatBillingDaysUntil(free.renewsAt, now)}`
                    )}
                  </time>
                </p>
              ) : (
                <p>{c("매월 갱신", "Resets monthly")}</p>
              )}
              <p className="ml-auto whitespace-nowrap tabular-nums">
                <span className="sr-only">
                  {c(
                    `남은 기본 연결 ${free.remaining}회`,
                    `${free.remaining} included ${free.remaining === 1 ? "intro" : "intros"} left`
                  )}
                </span>
                <span
                  className="inline-flex items-center gap-1"
                  aria-hidden="true"
                >
                  {free.remaining}
                  <Ticket size={12} />
                  {c("남음", "left")}
                </span>
              </p>
            </div>
            <div
              className="mt-1.5"
              role="meter"
              aria-label={c("남은 기본 연결", "Included intros left")}
              aria-valuemin={0}
              aria-valuemax={free.allowance}
              aria-valuenow={free.remaining}
              aria-valuetext={c(
                `${free.allowance}회 중 ${free.remaining}회 남음`,
                `${free.remaining} of ${free.allowance} intros left`
              )}
            >
              <ProgressBar
                value={
                  free.allowance ? (free.remaining / free.allowance) * 100 : 0
                }
                className="h-1.5 border-0 bg-neutral-1000-a10"
              />
            </div>
          </Card>
        </div>
      )}
      <OrgSectionHeader
        title={ct(c, COMPANY_TERMS.nav.slots)}
        description={
          summary.model === "scale"
            ? c(
                "Enterprise에서는 역할과 연결에 제한이 없어요.",
                "Enterprise includes unlimited roles and intros."
              )
            : c(
                `슬롯 ${slots.filter((slot) => slot.active).length}개 · 진행 중인 역할 ${summary.activeRoles}개`,
                `${slots.filter((slot) => slot.active).length} slots · ${summary.activeRoles} active roles`
              )
        }
        actions={
          <div className="">
            <MuteButton
              variant="neutral"
              size="sm"
              className="w-fit py-2 px-3"
              disabled={!canManage || busy}
              onClick={onAddSlot}
            >
              <Plus className="size-4 text-neutral-primary" aria-hidden />
              <span className="text-[13px] font-medium">
                {c("슬롯 추가", "Add a slot")}
              </span>
            </MuteButton>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const credit = creditBySlot.get(slot.id);
          const granted = slot.source === "grant";
          const paymentDue = ["past_due", "unpaid", "incomplete"].includes(
            slot.status
          );
          return (
            <Card
              key={slot.id}
              className="flex min-w-0 flex-col rounded-2xl bg-bg-default px-5 py-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-normal">{slot.label}</h3>
                  {granted ? (
                    <Badge size="sm" variant="outline">
                      {c("제공 슬롯", "Complimentary")}
                    </Badge>
                  ) : slot.cancelAt ? (
                    <Badge size="sm" variant="outline">
                      {c("종료 예정", "Ending")}
                    </Badge>
                  ) : paymentDue ? (
                    <Badge size="sm" tone="warning" variant="faded">
                      {c("결제 확인 필요", "Payment due")}
                    </Badge>
                  ) : (
                    <span
                      className="size-1.5 rounded-full bg-positive"
                      aria-label={c("이용 중", "Active")}
                    />
                  )}
                </div>
                <BillingSlotMenu
                  slot={slot}
                  now={now}
                  busy={busy}
                  canManage={canManage}
                  canViewBilling={canViewBilling}
                  onPortal={onPortal}
                  onCancel={onCancel}
                  onResume={onResume}
                />
              </div>
              {slotDetails(
                credit,
                credit?.allowance ?? SLOT_MONTHLY_CREDITS,
                credit?.remaining ?? null
              )}
            </Card>
          );
        })}
      </div>
      {(!canManage || contactOnly) && (
        <p className="mt-3 max-w-[230px] text-[12px] font-normal leading-5 text-neutral-muted">
          {!canManage
            ? c("소유자가 추가할 수 있어요", "An Owner can add slots")
            : contactOnly
              ? c(
                  "추가 이용은 Harper 팀에 문의해 주세요",
                  "Contact Harper to expand your plan"
                )
              : ""}
        </p>
      )}
      {contactOnly && (
        <div className="mt-4">
          <MuteButton asChild>
            <a href={BILLING_SUPPORT_HREF}>
              {c("Harper 팀에 문의", "Contact Harper")}
            </a>
          </MuteButton>
        </div>
      )}
      <div className="mt-12">
        <h3 className="mb-3 text-[13px] font-medium flex flex-row items-center gap-1">
          <span>{ct(c, COMPANY_TERMS.nav.roles)}</span>
          <span className="font-normal text-neutral-muted">
            {visibleRoles.length}
          </span>
          <Tooltips
            text={c(
              "슬롯 연결을 사용할 역할을 배정하세요. 슬롯이 없는 역할도 기본 연결로 요청과 연결 수락을 진행할 수 있어요.",
              "Assign a role to use the slot’s intros. Roles without a slot use included intros to request intros and connect."
            )}
          >
            <Info
              strokeWidth={2}
              className="ml-0.5 size-3.5 text-neutral-muted"
            />
          </Tooltips>
        </h3>
        <ul
          className="space-y-1.5"
          aria-label={c("역할별 슬롯 배정", "Slot assignments")}
        >
          {visibleRoles.map((role) => {
            const assigned = slotByRole.get(role.roleId);
            const isAssigned = Boolean(assigned);
            const unassignedLabel =
              free && isOrgRoleCountedAsActive(role.status)
                ? ct(c, COMPANY_TERMS.usage.included)
                : c("슬롯 없음", "No slot");
            return (
              <li
                key={role.roleId}
                className={cn(
                  "flex min-w-0 items-center justify-between gap-3 rounded-lg border-l-2 px-3 py-2 transition-colors",
                  isAssigned
                    ? "border-primary/60 bg-primary-faded"
                    : "border-transparent bg-bg-weak"
                )}
              >
                <Link
                  href={roleHref(role.roleId)}
                  className="flex min-w-0 items-center gap-2 text-[13px] hover:text-link"
                >
                  <OrgRoleStatusDot status={role.status} />
                  <span className={cn("truncate", isAssigned && "font-medium")}>
                    {role.name}
                  </span>
                </Link>
                {canManage && assignmentSlots.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <MuteButton
                        size="sm"
                        className={cn(
                          "shrink-0",
                          isAssigned &&
                            "border-primary/20 text-primary hover:border-primary/35 hover:bg-primary/5"
                        )}
                        disabled={
                          busy ||
                          !canAssignRole(role) ||
                          !assignmentSlots.length
                        }
                        aria-label={c(
                          `${role.name} 슬롯 배정`,
                          `Assign a slot to ${role.name}`
                        )}
                      >
                        {isAssigned && <Check className="size-3" aria-hidden />}
                        {assigned?.label ?? unassignedLabel}
                        <ChevronDown className="size-3" aria-hidden />
                      </MuteButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="max-h-80 w-72 max-w-[calc(100vw-2rem)]"
                    >
                      {assignmentSlots.map((slot) => (
                        <DropdownMenuItem
                          key={slot.id}
                          variant="sm"
                          selected={slot.id === assigned?.id}
                          disabled={slot.id === assigned?.id}
                          onSelect={() => onAssign(slot, role.roleId)}
                        >
                          <span className="shrink-0">{slot.label}</span>
                          <span className="ml-auto min-w-0 truncate text-[11px] text-neutral-muted">
                            {slot.roleName ?? c("미배정", "Unassigned")}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-[12px]",
                      isAssigned
                        ? "font-medium text-primary"
                        : "text-neutral-muted"
                    )}
                  >
                    {isAssigned && <Check className="size-3" aria-hidden />}
                    {assigned?.label ?? unassignedLabel}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {!visibleRoles.length && (
          <p className="rounded-lg bg-bg-weak px-3 py-3 text-[12px] text-neutral-muted">
            {c("종료되지 않은 역할이 없어요", "No open roles")}
          </p>
        )}
      </div>
    </OrgSection>
  );
}
