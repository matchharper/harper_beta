import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Info,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

export function BillingSlots({
  summary,
  locale,
  busy,
  canManage,
  canViewBilling,
  canAssign,
  roles = [],
  preview = false,
  date,
  onAddSlot,
  onCancel,
  onResume,
  onAssign,
  onPortal,
}: {
  summary: BillingSummary;
  locale: "ko" | "en";
  busy: boolean;
  canManage: boolean;
  canViewBilling: boolean;
  canAssign: boolean;
  roles?: BillingAssignmentRole[];
  preview?: boolean;
  date: (value: string | null, time?: boolean) => string;
  onAddSlot: () => void;
  onCancel: (slot: BillingSlot) => void;
  onResume: (slot: BillingSlot) => void;
  onAssign: (slot: BillingAssignmentSlot, roleId: string) => void;
  onPortal: () => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const slots = summary.slots.filter((slot) => !isEndedBillingSlot(slot));
  const free = summary.creditSlots.find((slot) => slot.slotId === null);
  const daysUntil = (value: string) =>
    Math.max(0, Math.ceil((Date.parse(value) - now) / 86_400_000));
  const resetDays = free?.renewsAt ? daysUntil(free.renewsAt) : null;
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
  const roleAssignment = (
    role: Pick<BillingCreditSlot, "roleId" | "roleName">,
    slotId: string
  ) => {
    const target = assignmentSlots.find((slot) => slot.id === slotId);
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {canManage && target ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MuteButton
                  size="sm"
                  className="min-w-0 max-w-full"
                  disabled={busy || !canAssign}
                  aria-label={c(
                    `${target.label} Role 배정`,
                    `Assign a Role to ${target.label}`
                  )}
                >
                  <BriefcaseBusiness
                    className="size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span className="truncate">
                    {role.roleName ?? c("Role 선택", "Select a Role")}
                  </span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </MuteButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 w-72 max-w-[calc(100vw-2rem)]"
              >
                {visibleRoles.map((option) => (
                  <DropdownMenuItem
                    key={option.roleId}
                    variant="sm"
                    selected={option.roleId === role.roleId}
                    disabled={
                      !canAssignRole(option) || option.roleId === role.roleId
                    }
                    onSelect={() => onAssign(target, option.roleId)}
                  >
                    <OrgRoleStatusDot status={option.status} />
                    <span className="min-w-0 flex-1 break-words">
                      {option.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-muted">
                      {slotByRole.get(option.roleId)?.label ??
                        c("미배정", "Unassigned")}
                    </span>
                  </DropdownMenuItem>
                ))}
                {!visibleRoles.length && (
                  <p className="px-3 py-2 text-[12px] text-neutral-muted">
                    {c("배정할 Role이 없어요", "No Roles available")}
                  </p>
                )}
                {!preview &&
                  visibleRoles.some((option) => !canAssignRole(option)) && (
                    <p className="px-3 py-2 text-[11px] text-neutral-muted">
                      {c(
                        "채용 중인 Role을 배정할 수 있어요",
                        "Only active Roles can be assigned"
                      )}
                    </p>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="truncate text-[13px] text-neutral-muted">
              {role.roleName ?? c("미배정", "Unassigned")}
            </span>
          )}
        </div>
      </div>
    );
  };
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
    const days = boundary ? daysUntil(boundary) : null;
    return (
      <div className="mb-3 mt-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-neutral-600">
          <p>
            {boundary ? (
              <time dateTime={boundary} title={date(boundary, true)}>
                {expiresBeforeRenewal
                  ? c(
                      `${days}일 후 만료`,
                      `Expires in ${days} ${days === 1 ? "day" : "days"}`
                    )
                  : c(
                      `${days}일 후 갱신`,
                      `Resets in ${days} ${days === 1 ? "day" : "days"}`
                    )}
              </time>
            ) : (
              c("갱신 예정 없음", "No reset scheduled")
            )}
          </p>
          <p className="ml-auto whitespace-nowrap tabular-nums">
            {c(
              `${remaining ?? "—"}개 남음`,
              `${remaining ?? "—"} credits left`
            )}
          </p>
        </div>
        {remaining !== null ? (
          <div
            className="mt-1.5"
            role="meter"
            aria-label={`${slot?.label} · ${c("남은 크레딧", "Remaining credits")}`}
            aria-valuemin={0}
            aria-valuemax={allowance}
            aria-valuenow={remaining}
            aria-valuetext={c(
              `${allowance}개 중 ${remaining}개 남음`,
              `${remaining} of ${allowance} credits left`
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
            title={c("공용 크레딧", "Shared credits")}
            description={c(
              "매월 제공되는 기본 크레딧입니다. 모든 역할에 공통적으로 사용됩니다.",
              "Provided monthly. Shared across all Roles."
            )}
          />
          <Card className="rounded-[20px] bg-bg-default py-3.5 px-5 shadow-none">
            <p className="text-[14px] font-normal">
              {c("월간 한도", "Monthly limit")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-neutral-600">
              {free.renewsAt ? (
                <p>
                  <time
                    dateTime={free.renewsAt}
                    title={date(free.renewsAt, true)}
                  >
                    {c(
                      `${resetDays}일 후 갱신`,
                      `Resets in ${resetDays} ${resetDays === 1 ? "day" : "days"}`
                    )}
                  </time>
                </p>
              ) : (
                <p>{c("매월 갱신", "Resets monthly")}</p>
              )}
              <p
                className="ml-auto whitespace-nowrap tabular-nums"
                aria-label={c(
                  `공용 크레딧 ${free.remaining}개 남음`,
                  `${free.remaining} shared credits left`
                )}
              >
                {c(
                  `${free.remaining}개 남음`,
                  `${free.remaining} credits left`
                )}
              </p>
            </div>
            <div
              className="mt-1.5"
              role="meter"
              aria-label={c("남은 공용 크레딧", "Shared credits remaining")}
              aria-valuemin={0}
              aria-valuemax={free.allowance}
              aria-valuenow={free.remaining}
              aria-valuetext={c(
                `${free.allowance}개 중 ${free.remaining}개 남음`,
                `${free.remaining} of ${free.allowance} credits left`
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
        title="Slots"
        description={
          summary.model === "scale"
            ? c(
                "Enterprise에서는 Role과 크레딧에 제한이 없어요.",
                "Enterprise includes unlimited Roles and credits."
              )
            : c(
                `슬롯 ${slots.filter((slot) => slot.active).length}개 · 채용 중인 Role ${summary.activeRoles}개`,
                `${slots.filter((slot) => slot.active).length} slots · ${summary.activeRoles} active Roles`
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
              <Plus className="size-4 text-black" aria-hidden />
              <span className="text-[13px] font-medium">
                {c("슬롯 추가", "Add a slot")}
              </span>
            </MuteButton>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-1 xl:grid-cols-1">
        {slots.map((slot) => {
          const credit = creditBySlot.get(slot.id);
          const granted = slot.source === "grant";
          const paymentDue = ["past_due", "unpaid", "incomplete"].includes(
            slot.status
          );
          const subscription = granted
            ? c(
                "Harper 제공 · 자동 결제 없음",
                "Provided by Harper · No automatic charge"
              )
            : slot.cancelAt
              ? c(
                  `${date(slot.cancelAt)} 이용 종료`,
                  `Access ends ${date(slot.cancelAt)}`
                )
              : paymentDue
                ? c("결제 수단을 확인해 주세요", "Review your payment method")
                : `${slot.billingInterval === "year" ? c("연간 구독", "Yearly subscription") : c("월간 구독", "Monthly subscription")} · ${c(`${date(slot.periodEnd)} 자동 갱신`, `Renews ${date(slot.periodEnd)}`)}`;
          return (
            <Card
              key={slot.id}
              className="flex flex-col rounded-[20px] bg-bg-default px-5 py-3.5 shadow-none"
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
                {canManage && !granted && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <MuteButton
                        variant="transparent"
                        size="sm"
                        disabled={busy}
                        aria-label={c(
                          `${slot.label} 관리`,
                          `Manage ${slot.label}`
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </MuteButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!granted && canViewBilling && (
                        <DropdownMenuItem onSelect={onPortal} variant="sm">
                          {c("결제 수단 관리", "Manage payment method")}
                        </DropdownMenuItem>
                      )}
                      {!granted &&
                        (slot.cancelAt ? (
                          <DropdownMenuItem
                            onSelect={() => onResume(slot)}
                            variant="sm"
                          >
                            {c("구독 유지", "Keep subscription")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => onCancel(slot)}
                            variant="sm"
                            className="text-critical focus:text-critical"
                          >
                            {c("구독 취소", "Cancel subscription")}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {slotDetails(
                credit,
                credit?.allowance ?? SLOT_MONTHLY_CREDITS,
                credit?.remaining ?? null
              )}
              <div className="flex flex-row items-center justify-between gap-4">
                <p className="min-w-0 text-right text-[11px] leading-4 text-neutral-600">
                  {subscription}
                </p>
                {roleAssignment(slot, slot.id)}
              </div>
            </Card>
          );
        })}
        <span className="max-w-[230px] text-[12px] font-normal leading-5 text-neutral-muted">
          {!canManage
            ? c("Owner가 추가할 수 있어요", "An Owner can add slots")
            : contactOnly
              ? c(
                  "추가 이용은 Harper 팀에 문의해 주세요",
                  "Contact Harper to expand your plan"
                )
              : ""}
        </span>
      </div>
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
          <span>Roles</span>
          <span className="font-normal text-neutral-muted">
            {visibleRoles.length}
          </span>
          <Tooltips
            text={c(
              "슬롯에 배정되지 않은 채용 중인 Role도 공용 크레딧으로 이용할 수 있어요. 유료 기능이 필요한 Role을 슬롯에 배정하세요.",
              "Active Roles without a slot can use shared credits. Assign a slot to a Role that needs paid features."
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
          aria-label={c("Role별 슬롯 배정", "Slot assignments by Role")}
        >
          {visibleRoles.map((role) => {
            const assigned = slotByRole.get(role.roleId);
            const isAssigned = Boolean(assigned);
            const unassignedLabel =
              free && isOrgRoleCountedAsActive(role.status)
                ? c("공용 크레딧", "Shared credits")
                : c("미배정", "Unassigned");
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
            {c("종료되지 않은 Role이 없어요", "No open Roles")}
          </p>
        )}
      </div>
    </OrgSection>
  );
}
