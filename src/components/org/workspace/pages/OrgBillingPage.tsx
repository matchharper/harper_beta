import TalentCareerModal from "@/components/common/TalentCareerModal";
import { isSlotPurchase } from "@/lib/org/billing/compat";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { OrgPageHeader } from "../OrgPageHeader";
import { MuteButton } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { BillingSlots } from "@/components/org/billing/BillingSlots";
import { BillingPlanSummary } from "@/components/org/billing/BillingPlanSummary";
import {
  BillingInvoiceHistory,
  BillingUsageHistory,
} from "@/components/org/billing/BillingHistory";
import { useToastStore } from "@/store/useToastStore";
import { Skeleton } from "@/components/ui/skeleton";
import { SlotPurchaseDialog } from "@/components/org/billing/SlotPurchaseDialog";
import { OrgBillingPreviewNotice } from "@/components/org/internal/OrgBillingDevControls";
import {
  OrgBillingPaymentPreview,
  OrgBillingPortalPreview,
  type PreviewCheckout,
} from "@/components/org/internal/OrgBillingPortalPreview";
import { useOrgBillingPreview } from "@/store/useOrgBillingPreviewStore";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { billingRequest, useOrgBilling } from "@/hooks/org/useOrgBilling";
import {
  BILLING_SUPPORT_HREF,
  type BillingSlot,
  type BillingInterval,
} from "@/lib/org/billing/types";
import { isOrgRoleCountedAsActive } from "@/lib/org/roleStatus";
import {
  billingAssignmentSlots,
  isBillingRoleVisible,
  type BillingAssignmentSlot,
} from "@/lib/org/billing/assignments";
import { previewAssignRole } from "@/lib/org/billing/preview";
import { canUseWorkspaceBilling } from "@/lib/org/billing/rollout";

export function OrgBillingPage({
  section = "billing",
}: {
  section?: "slots" | "billing";
}) {
  const { workspace, permissions } = useOrgWorkspace();
  const { locale } = useOrgLocale();
  const router = useRouter();
  const billingAvailable = canUseWorkspaceBilling(workspace.workspaceId);
  useEffect(() => {
    if (!billingAvailable) {
      void router.replace(`/org/team?orgId=${encodeURIComponent(workspace.workspaceId)}`);
    }
  }, [billingAvailable, router, workspace.workspaceId]);
  if (!billingAvailable) return null;
  if (section === "billing" && permissions.role !== "owner") {
    return (
      <div className="max-w-[1100px] space-y-7 pb-12">
        <OrgPageHeader title="Billing" description={workspace.companyName} />
        <p className="text-[13px] text-neutral-muted">
          {locale === "ko"
            ? "결제 정보는 Owner만 확인할 수 있어요."
            : "Only the Owner can view billing details."}
        </p>
        <MuteButton asChild>
          <Link
            href={`/org/slots?orgId=${encodeURIComponent(workspace.workspaceId)}`}
          >
            Slots
          </Link>
        </MuteButton>
      </div>
    );
  }
  return (
    <WorkspaceBillingContent
      key={`${workspace.workspaceId}:${section}`}
      section={section}
    />
  );
}

function WorkspaceBillingContent({
  section,
}: {
  section: "slots" | "billing";
}) {
  const { locale } = useOrgLocale();
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const router = useRouter();
  const { workspace, permissions, roles } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const canManage = permissions.canManageWorkspace;
  const canViewBilling = permissions.role === "owner";
  const billing = useOrgBilling(workspaceId, true);
  const { setPreview } = useOrgBillingPreview(workspaceId);
  const [portalPreviewOpen, setPortalPreviewOpen] = useState(false);
  const [previewCheckout, setPreviewCheckout] =
    useState<PreviewCheckout | null>(null);
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.add);
  const summary = billing.data?.summary;
  const catalog = billing.data?.catalog;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addSlotRequested, setAddSlotRequested] = useState(false);
  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval | null>(null);
  const interval =
    selectedInterval ?? (router.query.interval === "month" ? "month" : "year");
  const [purchaseDismissed, setPurchaseDismissed] = useState(false);
  const addSlotOpen =
    addSlotRequested ||
    (canManage && isSlotPurchase(router.query.purchase) && !purchaseDismissed);
  const setAddSlotOpen = (open: boolean) => {
    setAddSlotRequested(open);
    if (!open) setPurchaseDismissed(true);
  };
  const [cancelSlot, setCancelSlot] = useState<BillingSlot | null>(null);
  const [assignSlot, setAssignSlot] = useState<BillingAssignmentSlot | null>(
    null
  );
  const [assignedRole, setAssignedRole] = useState("");
  const assignmentSlots = summary ? billingAssignmentSlots(summary) : [];
  const assignmentRole = roles.find((role) => role.roleId === assignedRole);
  const previousSlot = assignmentSlots.find(
    (slot) => slot.roleId === assignedRole && slot.id !== assignSlot?.id
  );
  const checkoutRun = useRef("");
  const date = (value: string | null, time = false) =>
    value
      ? new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...(time
            ? ({
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              } as const)
            : {}),
        }).format(new Date(value))
      : "—";
  const invalidateHistory = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["org", "billing", "invoices", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["org", "billing", "usage", workspaceId],
      }),
    ]);
  const run = async (action: string, values: Record<string, unknown> = {}) => {
    if (billing.preview) {
      setError("");
      if (action === "portal" || action === "checkout") {
        if (action === "checkout") {
          const quantity = Number(values.quantity);
          if (
            quantity +
              (billing.preview.subscription === "ended"
                ? 0
                : billing.preview.slotCount) >
            100
          ) {
            const message = c(
              "미리보기는 최대 100개 슬롯까지 표시할 수 있어요.",
              "Preview supports up to 100 slots."
            );
            setError(message);
            throw new Error(message);
          }
          setPreviewCheckout({
            quantity,
            interval: values.interval as BillingInterval,
          });
          setAddSlotOpen(false);
        } else setPreviewCheckout(null);
        setPortalPreviewOpen(true);
      } else if (
        (action === "cancel" || action === "resume") &&
        summary?.slots.some((slot) => slot.id === values.slotId)
      ) {
        setPreview({
          ...billing.preview,
          slotRenewals: {
            ...billing.preview.slotRenewals,
            [String(values.slotId)]: action === "cancel" ? "ending" : "active",
          },
        });
      } else if (action === "assign" && summary) {
        const role = roles.find((role) => role.roleId === values.roleId);
        if (!role) throw new Error("Invalid preview Role");
        setPreview(
          previewAssignRole(
            billing.preview,
            summary,
            String(values.slotId),
            role
          )
        );
      } else {
        throw new Error("Unsupported preview action");
      }
      return { confirmed: false };
    }
    setBusy(true);
    setError("");
    try {
      const result = await billingRequest<{
        url?: string;
        confirmed?: boolean;
      }>(workspaceId, action, values);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await Promise.all([billing.refetch(), billing.invalidateDependents()]);
      if (action === "refresh" || action === "confirm")
        await invalidateHistory();
      return result;
    } catch (e) {
      setError(
        localizedOrgErrorMessage(
          e,
          locale,
          c(
            "요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
            "We couldn’t complete this request. Please try again."
          )
        )
      );
      const latest = await billing.refetch();
      if (cancelSlot)
        setCancelSlot(
          latest.data?.summary.slots.find(
            (slot) => slot.id === cancelSlot.id
          ) ?? null
        );
      if (assignSlot)
        setAssignSlot(
          latest.data?.summary.slots.find(
            (slot) => slot.id === assignSlot.id
          ) ?? null
        );
      throw e;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const sessionId =
      typeof router.query.session_id === "string"
        ? router.query.session_id
        : "";
    if (
      billing.preview ||
      !canManage ||
      !sessionId ||
      router.query.checkout !== "success"
    )
      return;
    const key = `${workspaceId}:${sessionId}`;
    if (checkoutRun.current === key) return;
    checkoutRun.current = key;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const confirm = async (attempt = 0) => {
      try {
        const result = await billingRequest<{
          confirmed: boolean;
          transferredRoleName?: string | null;
        }>(workspaceId, "confirm", { sessionId });
        if (disposed) return;
        await Promise.all([
          billing.refetch(),
          billing.invalidateDependents(),
          invalidateHistory(),
        ]);
        if (disposed) return;
        if (result.confirmed) {
          setNotice("");
          addToast({
            message: result.transferredRoleName
              ? c(
                  `슬롯이 추가됐어요. ${result.transferredRoleName} Role에 새 슬롯을 연결했어요.`,
                  `Your purchased slots are ready. ${result.transferredRoleName} is assigned to a new paid slot.`
                )
              : c(
                  "구매한 슬롯이 추가됐어요.",
                  "Your purchased slots are ready."
                ),
            variant: "success",
            duration: 6000,
          });
          void router.replace(
            {
              pathname: "/org/slots",
              query: { orgId: workspaceId },
            },
            undefined,
            { shallow: true }
          );
        } else {
          setNotice(
            c(
              "결제 확인 중이에요. 확인이 끝나면 구독에 반영돼요.",
              "Your payment is being confirmed. Your subscription will update when it’s ready."
            )
          );
          if (attempt < 5)
            timer = setTimeout(() => void confirm(attempt + 1), 5000);
        }
      } catch (e) {
        if (!disposed)
          setError(
            localizedOrgErrorMessage(
              e,
              locale,
              c(
                "결제 확인이 지연되고 있어요. 잠시 후에도 반영되지 않으면 Harper 팀에 문의해 주세요.",
                "Payment confirmation is delayed. Contact Harper if it still hasn’t appeared after a few minutes."
              )
            )
          );
      }
    };
    void confirm();
    return () => {
      disposed = true;
      clearTimeout(timer);
      checkoutRun.current = "";
    };
    // The session/workspace is the identity of this verification, not query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    billing.preview,
    canManage,
    workspaceId,
    router.query.session_id,
    router.query.checkout,
    locale,
  ]);

  const handle = (
    action: string,
    values?: Record<string, unknown>,
    done?: () => void
  ) => {
    void run(action, values)
      .then(() => {
        done?.();
        const message = {
          cancel: c(
            "이 슬롯의 자동 갱신을 취소했어요. 현재 이용 기간 끝까지 사용할 수 있어요.",
            "Renewal cancelled. You can use this slot until its current period ends."
          ),
          resume: c(
            "이 슬롯은 다음 결제일에 자동 갱신돼요.",
            "Subscription kept. It will renew at the next billing date."
          ),
          assign: c(
            "슬롯의 담당 Role을 변경했어요.",
            "The slot’s assigned Role has been updated."
          ),
        }[action];
        if (message)
          addToast({
            message: billing.preview
              ? `${c("미리보기", "Preview")}: ${message}`
              : message,
            variant: "success",
          });
      })
      .catch(() => {});
  };
  const openAddSlot = () => {
    setError("");
    if (
      summary?.model === "scale" ||
      (summary?.model === "legacy" && summary.activeRoles > 1)
    ) {
      window.location.assign(BILLING_SUPPORT_HREF);
      return;
    }
    setAddSlotOpen(true);
  };
  const requestAssignment = (slot: BillingAssignmentSlot, roleId: string) => {
    if (!canManage || busy || slot.roleId === roleId) return;
    setError("");
    const alreadyAssigned = assignmentSlots.some(
      (other) => other.roleId === roleId
    );
    if (slot.roleId || alreadyAssigned) {
      setAssignSlot(slot);
      setAssignedRole(roleId);
    } else {
      handle("assign", { slotId: slot.id, revision: slot.revision, roleId });
    }
  };
  return (
    <div className="max-w-[1100px] space-y-7 pb-12">
      <OrgPageHeader
        title={section === "slots" ? "Slots" : "Billing"}
        actions={
          canManage &&
          catalog?.testMode && (
            <Badge variant="outline" size="sm">
              {c("테스트 모드", "Test mode")}
            </Badge>
          )
        }
      />
      <OrgBillingPreviewNotice
        workspaceId={workspaceId}
        onRestore={() => {
          setError("");
          setNotice("");
          setPortalPreviewOpen(false);
          setPreviewCheckout(null);
          setCancelSlot(null);
          setAssignSlot(null);
          setAddSlotOpen(false);
        }}
      />
      {notice && (
        <p role="status" className="text-[13px] text-neutral-muted">
          {notice}
        </p>
      )}
      {router.query.checkout === "cancelled" && (
        <p role="status" className="text-[13px] text-neutral-muted">
          {c(
            "결제를 진행하지 않았어요. 필요할 때 슬롯을 다시 추가할 수 있어요.",
            "Checkout was closed. You can add a slot whenever you’re ready."
          )}
        </p>
      )}
      {(billing.isError ||
        (error && !addSlotOpen && !cancelSlot && !assignSlot)) && (
        <div
          role="alert"
          className="rounded-lg border border-critical/20 p-4 text-[13px] leading-6"
        >
          <p>
            {error ||
              c(
                "슬롯 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
                "Slot details couldn’t be loaded. Please try again."
              )}
          </p>
          <div className="mt-2 flex gap-2">
            <MuteButton
              disabled={billing.isFetching}
              onClick={() =>
                void billing.refetch().then((result) => {
                  if (!result.isError) setError("");
                })
              }
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
            <MuteButton asChild variant="transparent">
              <a href={BILLING_SUPPORT_HREF}>
                {c("Harper 팀에 문의", "Contact Harper")}
              </a>
            </MuteButton>
          </div>
        </div>
      )}
      {billing.isPending && (
        <div className="space-y-7" aria-label={c("불러오는 중", "Loading")}>
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {summary && (
        <div className="space-y-10">
          {summary.slots.some((slot) =>
            ["past_due", "unpaid", "incomplete"].includes(slot.status)
          ) && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info-faded px-4 py-3 text-[13px]"
            >
              <p>
                {c(
                  "결제 확인이 필요한 슬롯이 있어요.",
                  "A slot needs payment attention."
                )}
                {!canViewBilling &&
                  c(
                    " Owner에게 결제 수단 확인을 요청해 주세요.",
                    " Ask your Owner to review the payment method."
                  )}
              </p>
              {canViewBilling && (
                <MuteButton disabled={busy} onClick={() => handle("portal")}>
                  {c("결제 확인", "Review payment")}
                </MuteButton>
              )}
            </div>
          )}
          {section === "slots" ? (
            <>
              <BillingSlots
                summary={summary}
                locale={locale}
                busy={busy}
                date={date}
                canManage={canManage}
                canViewBilling={canViewBilling}
                roles={roles}
                preview={!!billing.preview}
                canAssign={roles.some(
                  (role) =>
                    isBillingRoleVisible(role) &&
                    (billing.preview || isOrgRoleCountedAsActive(role.status))
                )}
                onAddSlot={openAddSlot}
                onCancel={(slot) => {
                  setError("");
                  setCancelSlot(slot);
                }}
                onResume={(slot) =>
                  handle("resume", { slotId: slot.id, revision: slot.revision })
                }
                onAssign={requestAssignment}
                onPortal={() => handle("portal")}
              />
              <BillingUsageHistory
                key={`usage:${billing.preview?.history ?? "actual"}:${billing.preview?.slotCount ?? "actual"}`}
                workspaceId={workspaceId}
                locale={locale}
                date={date}
              />
            </>
          ) : (
            <>
              <BillingPlanSummary
                summary={summary}
                locale={locale}
                busy={busy}
                date={date}
                onPortal={() => handle("portal")}
                onAddSlot={openAddSlot}
              />
              <OrgBillingPaymentPreview
                workspaceId={workspaceId}
                onOpen={() => handle("portal")}
              />
              <BillingInvoiceHistory
                key={`invoices:${billing.preview?.history ?? "actual"}:${billing.preview?.slotCount ?? "actual"}`}
                workspaceId={workspaceId}
                locale={locale}
                date={date}
              />
            </>
          )}
        </div>
      )}
      {billing.preview && (
        <OrgBillingPortalPreview
          workspaceId={workspaceId}
          open={portalPreviewOpen}
          onClose={() => {
            setPortalPreviewOpen(false);
            setPreviewCheckout(null);
          }}
          checkout={previewCheckout}
          catalog={catalog}
          onComplete={() => {
            setPortalPreviewOpen(false);
            setPreviewCheckout(null);
            setNotice(
              c(
                "미리보기 결제를 완료했어요. 추가된 슬롯을 Slots에서 확인할 수 있어요. 실제 청구는 없어요.",
                "Preview payment completed. View the added slots in Slots. No payment was taken."
              )
            );
          }}
        />
      )}
      <SlotPurchaseDialog
        open={addSlotOpen}
        onOpenChange={setAddSlotOpen}
        locale={locale}
        catalog={catalog}
        initialInterval={interval}
        initialQuantity={Number(router.query.quantity ?? 1)}
        busy={busy}
        error={error}
        onCheckout={(selected, quantity) => {
          setSelectedInterval(selected);
          void handle("checkout", { locale, interval: selected, quantity });
        }}
      />
      <TalentCareerModal
        open={!!cancelSlot}
        onClose={() => !busy && setCancelSlot(null)}
        mobileBottomSheet
        title={
          <>
            {c(
              "이 슬롯의 구독을 취소할까요?",
              "Cancel this slot’s subscription?"
            )}
          </>
        }
        description={
          <>
            {billing.preview ? c("UI 미리보기 · ", "UI preview · ") : ""}
            {cancelSlot?.label} ·{" "}
            {cancelSlot?.roleName ?? c("담당 Role 없음", "No Role assigned")}
          </>
        }
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton disabled={busy} onClick={() => setCancelSlot(null)}>
              {c("돌아가기", "Go back")}
            </MuteButton>
            <MuteButton
              variant="warn"
              disabled={busy}
              onClick={() =>
                cancelSlot &&
                handle(
                  "cancel",
                  { slotId: cancelSlot.id, revision: cancelSlot.revision },
                  () => setCancelSlot(null)
                )
              }
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {c("구독 취소", "Cancel subscription")}
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-3 py-3 text-sm leading-6">
          <p>
            {c(
              `${date(cancelSlot?.periodEnd ?? null, true)}까지 이용할 수 있어요. 다음 갱신부터 이 슬롯의 요금은 청구되지 않아요.`,
              `Access continues until ${date(cancelSlot?.periodEnd ?? null, true)}. This slot will no longer be charged from the next renewal.`
            )}
          </p>
          <p>
            {c(
              "슬롯이 종료돼도 모든 Role은 계속 유지돼요. 다른 빈 슬롯이 있으면 자동 이동하고, 없으면 공용 크레딧을 사용해요. 유료 기능은 이용 중인 슬롯에 연결된 Role에서 사용할 수 있어요.",
              "All Roles stay active when a slot ends. Its Role moves to another available slot, or uses shared credits. Paid features require an active slot assignment."
            )}
          </p>
          {cancelSlot?.roleId && (
            <p className="text-neutral-muted">
              {c(
                "취소 후에도 담당 Role을 변경할 수 있어요. 종료 시점의 배정에 따라 영향이 달라져요.",
                "You can change the assigned Role after cancelling. The assignment at the end of the period determines the impact."
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="text-critical">
              {error}
            </p>
          )}
        </div>
      </TalentCareerModal>
      <TalentCareerModal
        open={!!assignSlot}
        onClose={() => !busy && setAssignSlot(null)}
        mobileBottomSheet
        title={<>{c("슬롯 배정을 변경할까요?", "Change slot assignments?")}</>}
        description={
          <>
            {c(
              "기존 배정이 아래와 같이 바뀌어요. 크레딧과 갱신일은 각 슬롯에 그대로 남아요.",
              "The existing assignments will change as shown below. Each slot keeps its credits and renewal date."
            )}
          </>
        }
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton disabled={busy} onClick={() => setAssignSlot(null)}>
              {c("돌아가기", "Go back")}
            </MuteButton>
            <MuteButton
              variant="primary"
              disabled={
                busy || !assignedRole || assignedRole === assignSlot?.roleId
              }
              onClick={() =>
                assignSlot &&
                handle(
                  "assign",
                  {
                    slotId: assignSlot.id,
                    revision: assignSlot.revision,
                    roleId: assignedRole,
                  },
                  () => setAssignSlot(null)
                )
              }
            >
              {c("변경하기", "Save assignment")}
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-2 py-3 text-[13px]">
          {[
            {
              label: assignSlot?.label,
              before: assignSlot?.roleName,
              after: assignmentRole?.name,
            },
            ...(previousSlot
              ? [
                  {
                    label: previousSlot.label,
                    before: previousSlot.roleName,
                    after: assignSlot?.roleName,
                  },
                ]
              : []),
          ].map((change) => (
            <div key={change.label} className="rounded-lg bg-bg-weak p-3">
              <p className="mb-2 text-[12px] font-medium">{change.label}</p>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 break-words text-neutral-muted">
                  {change.before ?? c("미배정", "Unassigned")}
                </span>
                <ArrowRight
                  className="size-3.5 shrink-0 text-neutral-soft"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 break-words">
                  {change.after ?? c("미배정", "Unassigned")}
                </span>
              </div>
            </div>
          ))}
          {!previousSlot && assignSlot?.roleName && (
            <p className="pt-1 text-[12px] text-neutral-muted">
              {c(
                `${assignSlot.roleName} Role의 기존 슬롯 배정은 해제돼요.`,
                `${assignSlot.roleName} will no longer be assigned to this slot.`
              )}
            </p>
          )}
          {billing.preview && (
            <p className="pt-1 text-[12px] text-neutral-muted">
              {c(
                "UI 미리보기에만 반영돼요. Role의 실제 채용 상태는 바뀌지 않아요.",
                "Only the UI preview changes. The Role’s actual hiring status stays the same."
              )}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
      </TalentCareerModal>
    </div>
  );
}
