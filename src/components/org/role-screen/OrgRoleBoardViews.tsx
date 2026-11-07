import { Columns3, Rows3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OrgCandidateViewMenu } from "@/components/org/OrgCandidateToolbar";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleInbox } from "@/components/org/OrgRoleInbox";
import { OrgRoleTalentBoard } from "@/components/org/OrgRoleTalentBoard";
import { OrgSearchHistory } from "@/components/org/OrgSearchHistory";
import { useRoleStartQuery } from "@/components/org/role-start/RoleStartOnboarding";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { MuteButton } from "@/components/ui/button";
import { OrgJobsProvider, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

/** The full-width candidate views: the inbox grid, list, card and board, and the pipeline board. */
export type RolePipelineDisplay = "pipeline" | "board";

function OrgRolePipelineWorkspace({
  display,
  mobile = false,
  onDisplayChange,
  toolbarTarget = null,
}: {
  display: RolePipelineDisplay;
  mobile?: boolean;
  onDisplayChange: (display: RolePipelineDisplay) => void;
  toolbarTarget?: HTMLElement | null;
}) {
  const { activeRole, workspaceId } = useOrgJobsNavigation();
  const resolvedDisplay = mobile ? "board" : display;

  const displayMenu = mobile ? null : (
    <RolePipelineDisplayMenu
      display={resolvedDisplay}
      onDisplayChange={onDisplayChange}
    />
  );
  // In the role screen's 전체 화면 the view and the search history sit in the
  // tabs' row, like on the other tabs; elsewhere the view stays in the list.
  const displayControl = toolbarTarget ? null : displayMenu;

  return (
    <>
      {toolbarTarget
        ? createPortal(
            <>
              {displayMenu}
              <OrgSearchHistory workspaceId={workspaceId} roleId={activeRole?.roleId} />
            </>,
            toolbarTarget
          )
        : null}
      {resolvedDisplay === "pipeline" ? (
        <OrgPipeline displayControl={displayControl} />
      ) : (
        <OrgRoleTalentBoard displayControl={displayControl} />
      )}
    </>
  );
}

function RolePipelineDisplayMenu({
  display,
  onDisplayChange,
}: {
  display: RolePipelineDisplay;
  onDisplayChange: (display: RolePipelineDisplay) => void;
}) {
  const { c } = useOrgLocale();
  return (
    <OrgCandidateViewMenu<RolePipelineDisplay>
      onChange={onDisplayChange}
      options={[
        { value: "pipeline", label: c("파이프라인", "Pipeline"), icon: Columns3 },
        { value: "board", label: c("보드", "Board"), icon: Rows3 },
      ]}
      value={display}
    />
  );
}

export function OrgRoleCandidatesTab({
  display,
  mobile = false,
  onDisplayChange,
  stageTabs = true,
  tab,
  toolbarTarget = null,
}: {
  display: RolePipelineDisplay;
  mobile?: boolean;
  onDisplayChange: (display: RolePipelineDisplay) => void;
  /** False where the screen already shows the candidate tabs (the inbox's own sub-tabs go). */
  stageTabs?: boolean;
  tab: "inbox" | "pipeline";
  /** The screen's place for sort, view and search history, when it has one. */
  toolbarTarget?: HTMLElement | null;
}) {
  return (
    <OrgJobsProvider routePage="role" inbox={tab === "inbox"}>
      {tab === "inbox" ? (
        <OrgRoleInbox stageTabs={stageTabs} toolbarTarget={toolbarTarget} />
      ) : (
        <OrgRolePipelineWorkspace
          display={display}
          mobile={mobile}
          onDisplayChange={onDisplayChange}
          toolbarTarget={toolbarTarget}
        />
      )}
      {tab !== "inbox" && <TalentDetailSimpleView />}
    </OrgJobsProvider>
  );
}

const registeredNoticeKey = (roleId: string) => `harper:role-start-registered:${roleId}`;

export function writeRegisteredNotice(roleId: string, open: boolean) {
  try {
    if (open) window.sessionStorage.setItem(registeredNoticeKey(roleId), "1");
    else window.sessionStorage.removeItem(registeredNoticeKey(roleId));
  } catch {}
}

function readRegisteredNotice(roleId: string) {
  try {
    return window.sessionStorage.getItem(registeredNoticeKey(roleId)) === "1";
  } catch {
    return false;
  }
}

/** Right after registration, above the inbox: the Role is on and regular recommendations take over. */
export function RoleStartRegisteredNotice({
  roleId,
  workspaceId,
}: {
  roleId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const [shown, setShown] = useState(false);
  // Cached from the step screens; a reload has no cache and shows nothing.
  const batch = useRoleStartQuery(roleId, workspaceId, false).data?.session?.batch;
  const ready = batch?.status === "done" || batch?.status === "failed";
  // Shown once per registration: this mount keeps it, the flag goes.
  if (ready && !shown && readRegisteredNotice(roleId)) setShown(true);
  useEffect(() => {
    if (shown) writeRegisteredNotice(roleId, false);
  }, [roleId, shown]);
  if (!batch || !ready || !shown) return null;
  const close = () => setShown(false);
  return (
    <div
      className="career-glass mb-4 flex items-start gap-3 px-4 py-3 text-[13px] leading-5"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p>
          {c(
            "역할을 켰어요. 새 후보는 정기 탐색에서 찾아 인박스에 넣어 드릴게요.",
            "The role is on. Regular recommendations will look for new people and add them to the inbox."
          )}
        </p>
      </div>
      <MuteButton
        aria-label={c("안내 닫기", "Close notice")}
        onClick={close}
        size="sm"
        variant="transparent"
      >
        <X aria-hidden className="size-3.5" strokeWidth={1.7} />
      </MuteButton>
    </div>
  );
}
