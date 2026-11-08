import Link from "next/link";
import { useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { useOrgRoleActions } from "@/hooks/org/useOrgRoleActions";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { billingErrorCopy } from "@/lib/org/billing/types";
import { buildOrgHref } from "@/lib/org/routes";
import {
  getOrgRoleStatusPresentation,
  isOrgRoleCountedAsActive,
} from "@/lib/org/roleStatus";
import type { OrgRole } from "@/lib/org/server";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";

/**
 * A paused or closed role says so at the top of its right column, in the
 * candidate side's card style. When the workspace already runs as many roles
 * as it can, the card says that instead (today the same message shows only
 * after 다시 진행하기 fails) and offers slots and the role that is running.
 */
export function OrgRoleStatusCard({ role }: { role: OrgRole }) {
  const { c, locale } = useOrgLocale();
  const { permissions, roles, workspace } = useOrgWorkspace();
  const status = getOrgRoleStatusPresentation(role.status).status;
  const paused = status === "paused";
  const ended = status === "ended";
  const [confirmResume, setConfirmResume] = useState(false);
  const entitlements = useOrgEntitlements(paused || ended ? workspace.workspaceId : "");
  const { resumeRole, roleActionPending } = useOrgRoleActions({
    canManageCandidates: permissions.canManageCandidates,
    workspaceId: workspace.workspaceId,
  });
  if (!paused && !ended) return null;
  const capacity = entitlements.data?.capacity ?? null;
  const full =
    capacity !== null && (entitlements.data?.activeRoles ?? 0) >= capacity;
  const running = roles.filter(
    (item) => item.roleId !== role.roleId && isOrgRoleCountedAsActive(item.status)
  );

  if (full) {
    return (
      <article
        className="career-followup-card career-glass org-role-status-card"
        data-org-role-status="capacity"
      >
        <span className="career-followup-title">
          {paused
            ? ct(c, COMPANY_TERMS.roleStatus.paused)
            : ct(c, COMPANY_TERMS.roleStatus.ended)}
        </span>
        <span className="career-followup-description">
          {billingErrorCopy("role_capacity_exceeded", locale)}
        </span>
        <div className="org-todo-card-actions">
          <div className="flex flex-wrap items-center gap-1.5">
            {permissions.canManageWorkspace ? (
              <MuteButton asChild size="sm" variant="dark">
                <Link
                  href={`${buildOrgHref({ orgId: workspace.workspaceId, page: "billing" })}&section=slots`}
                >
                  {c("슬롯 추가", "Add a slot")}
                </Link>
              </MuteButton>
            ) : null}
            {running.length === 1 ? (
              <MuteButton asChild size="sm" variant="transparent">
                <Link
                  href={buildOrgHref({
                    orgId: workspace.workspaceId,
                    page: "role",
                    roleId: running[0].roleId,
                  })}
                >
                  {c("{p0} 보기", "Open {p0}", { p0: running[0].name })}
                </Link>
              </MuteButton>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className="career-followup-card career-glass org-role-status-card"
      data-org-role-status={paused ? "paused" : "ended"}
    >
      <span className="career-followup-title">
        {paused
          ? ct(c, COMPANY_TERMS.roleStatus.paused)
          : ct(c, COMPANY_TERMS.roleStatus.ended)}
      </span>
      <span className="career-followup-description">
        {paused
          ? c(
              "역할이 잠시 멈춰서 새 후보 추천도 쉬고 있어요. 다시 진행하면 추천도 이어져요.",
              "New candidate recommendations are paused with this role. They'll resume when the role is active again."
            )
          : c(
              "이 역할의 채용이 종료되어 새로운 후보자를 추천하지 않아요.",
              "Hiring for this role has ended, so Harper is no longer recommending new candidates."
            )}
      </span>
      {permissions.canManageCandidates ? (
        <div className="org-todo-card-actions">
          <MuteButton
            disabled={roleActionPending || entitlements.isLoading}
            onClick={() => setConfirmResume(true)}
            size="sm"
            variant="dark"
          >
            {ct(c, COMPANY_TERMS.roleStatusAction.resume)}
          </MuteButton>
        </div>
      ) : null}
      {/* Same question the role menu asks before resuming (M4). */}
      <TalentCareerModal
        open={confirmResume}
        onClose={() => setConfirmResume(false)}
        mobileBottomSheet
        title={c("역할 {action}", "{action} role", {
          action: ct(c, COMPANY_TERMS.roleStatusAction.resume),
        })}
        description={c(
          "“{p0}” 역할의 후보자 연결을 다시 시작할까요?",
          'Resume recommendations for "{p0}"?',
          { p0: role.name }
        )}
        panelClassName="max-w-sm"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              onClick={() => setConfirmResume(false)}
              size="md"
              type="button"
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={roleActionPending}
              onClick={() => {
                setConfirmResume(false);
                resumeRole(role);
              }}
              size="md"
              type="button"
              variant="dark"
            >
              {ct(c, COMPANY_TERMS.roleStatusAction.resume)}
            </MuteButton>
          </div>
        }
      >
        {null}
      </TalentCareerModal>
    </article>
  );
}
