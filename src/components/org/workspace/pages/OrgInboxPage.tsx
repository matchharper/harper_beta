import { useMemo, useState } from "react";

import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgTalentTable,
  OrgTalentTableLoading,
} from "@/components/org/workspace/OrgTalentTable";
import {
  FilterChipGroup,
  type FilterChipOption,
} from "@/components/ui/filter-chip-group";
import { useOrgInbox } from "@/hooks/org/useOrg";
import { OrgJobsProvider, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";

type InboxFilter = "acceptedWaiting" | "pendingConnection" | "unread";

const INBOX_FILTERS = [
  { label: "미열람", value: "unread" },
  { label: "연결 대기", value: "pendingConnection" },
] as const satisfies readonly FilterChipOption<InboxFilter>[];
const INTERNAL_INBOX_FILTER = {
  label: "수락 후 대기",
  overlay: <InternalOnlyHatch className="opacity-70" />,
  value: "acceptedWaiting",
} as const satisfies FilterChipOption<InboxFilter>;

function OrgInboxMain() {
  const [activeFilters, setActiveFilters] = useState<InboxFilter[]>([]);
  const { changeRole, selectTalent } = useOrgJobsNavigation();
  const { currentUserEmail, internalOpsAccess, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const inboxQuery = useOrgInbox({ workspaceId });
  const { hasHydrated, isViewed, markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
  const items = useMemo(
    () =>
      (inboxQuery.data?.items ?? []).filter(
        (item) => item.stage !== "archived"
      ),
    [inboxQuery.data?.items]
  );
  const unreadOnly = activeFilters.includes("unread");
  const pendingConnectionOnly = activeFilters.includes("pendingConnection");
  const acceptedWaitingOnly = activeFilters.includes("acceptedWaiting");
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (unreadOnly && isViewed(item.recommendationId)) return false;
        if (
          (acceptedWaitingOnly || pendingConnectionOnly) &&
          !(
            (acceptedWaitingOnly && item.stage === "accepted") ||
            (pendingConnectionOnly && item.stage === "pending_connection")
          )
        ) {
          return false;
        }
        return true;
      }),
    [acceptedWaitingOnly, isViewed, items, pendingConnectionOnly, unreadOnly]
  );

  return (
    <div className="space-y-6">
      <OrgPageHeader description="추천된 인재를 확인합니다." title="Inbox" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChipGroup
          aria-label="Inbox 인재 필터"
          label="필터"
          onValueChange={setActiveFilters}
          options={[
            {
              ...INBOX_FILTERS[0],
              disabled: !hasHydrated,
            },
            ...(internalOpsAccess ? [INTERNAL_INBOX_FILTER] : []),
            INBOX_FILTERS[1],
          ]}
          value={activeFilters}
        />
        <div
          aria-live="polite"
          className="text-[12px] font-light tabular-nums text-neutral-muted"
        >
          {visibleItems.length}명 표시 · 전체 {items.length}명
        </div>
      </div>

      {inboxQuery.error instanceof Error ? (
        <OrgErrorState
          message={inboxQuery.error.message}
          onRetry={() => void inboxQuery.refetch()}
        />
      ) : inboxQuery.isLoading ? (
        <OrgTalentTableLoading showCompany={false} />
      ) : visibleItems.length > 0 ? (
        <OrgTalentTable
          companyHeader={null}
          dateHeader="추천일"
          onSelect={(item) => {
            markViewed(item.recommendationId);
            selectTalent(item);
          }}
          onSelectRole={(item) => changeRole(item.roleId)}
          rows={visibleItems.map((item) => ({
            date: item.recommendedAt,
            item,
            key: item.recommendationId,
            name:
              item.talent.name ||
              item.talent.email ||
              item.talent.headline ||
              "이름 없음",
            profilePicture: item.talent.profilePicture,
            roleName: item.roleName,
            statusLabel:
              item.stage === "accepted"
                ? "수락 후 대기"
                : item.stage === "pending_connection"
                  ? "연결 대기"
                  : "결정 완료",
            statusTone:
              item.stage === "accepted" || item.stage === "pending_connection"
                ? "primary"
                : "muted",
            viewed: isViewed(item.recommendationId),
          }))}
          statusHeader="연결 상태"
        />
      ) : (
        <div className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-5 py-14 text-center">
          <div className="text-[14px] font-medium text-neutral-primary">
            {activeFilters.length > 0
              ? "조건에 맞는 인재가 없습니다."
              : "아직 Inbox에 표시할 인재가 없습니다."}
          </div>
          <div className="mt-1 text-[13px] font-light text-neutral-muted">
            {activeFilters.length > 0
              ? "필터를 해제하면 전체 추천 인재를 다시 확인할 수 있습니다."
              : "수락 이후 연결 검토가 시작된 인재가 여기에 표시됩니다."}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgInboxPage() {
  return (
    <OrgJobsProvider includeBoard={false} routePage="inbox">
      <OrgInboxMain />
      <TalentDetailSimpleView />
    </OrgJobsProvider>
  );
}
