import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { roleMatchingBriefQueryOptions } from "@/hooks/org/roleMatchingBriefQuery";
import type { OrgRoleSection } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { OrgRoleDetailsContent } from "./OrgRoleDetailsContent";
import { OrgRoleMatchingContent } from "./OrgRoleMatchingContent";
import { OrgRoleMatchingHistory } from "./OrgRoleMatchingHistory";

/**
 * 역할 정보: 역할 설명 (candidates see it), 찾는 사람 (only Harper), 확인할 기준
 * (`id="criteria"`, shown on cards), then the history button. Each editor
 * keeps its own draft and unsaved-changes guard; the guards share one prompt.
 */
export function OrgRoleInfoContent({
  role,
  section,
  visible,
  workspaceId,
}: {
  role: OrgRole;
  section: OrgRoleSection | null;
  /** The tab is on screen. The history button opens a dialog, so it renders only then. */
  visible: boolean;
  workspaceId: string;
}) {
  // Same cache as the criteria editor: scroll once the criteria are drawn.
  const criteriaReady = Boolean(
    useQuery(roleMatchingBriefQueryOptions(workspaceId, role.roleId)).data
  );
  useEffect(() => {
    if (!visible || section !== "criteria" || !criteriaReady) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("criteria")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [criteriaReady, section, visible]);

  return (
    <div className="space-y-12">
      <OrgRoleDetailsContent role={role} workspaceId={workspaceId} />
      <OrgRoleMatchingContent role={role} workspaceId={workspaceId} />
      {visible ? (
        <div className="flex justify-end">
          <OrgRoleMatchingHistory roleId={role.roleId} workspaceId={workspaceId} />
        </div>
      ) : null}
    </div>
  );
}
