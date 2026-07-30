import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useOrgAcceptedTalents } from "@/hooks/org/useOrg";
import { OrgJobsProvider, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { buildOrgHref } from "@/lib/org/routes";

const ACCEPTED_TALENT_FILTERS = [
  { label: "미열람", value: "unread" },
  { label: "수락 후 대기", value: "waiting" },
] as const satisfies readonly FilterChipOption<"unread" | "waiting">[];

function OrgAllAcceptedMain() {
  const router = useRouter();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<("unread" | "waiting")[]>(
    []
  );
  const { selectTalent } = useOrgJobsNavigation();
  const { currentUserEmail, internalOpsAccess, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const acceptedQuery = useOrgAcceptedTalents({
    enabled: internalOpsAccess,
  });
  const { hasHydrated, isViewed, markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId: "all-workspaces",
  });
  const items = useMemo(
    () => acceptedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [acceptedQuery.data?.pages]
  );
  const unreadOnly = activeFilters.includes("unread");
  const waitingOnly = activeFilters.includes("waiting");
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (unreadOnly && isViewed(item.recommendationId)) return false;
        if (waitingOnly && !item.isAwaitingStageMove) return false;
        return true;
      }),
    [isViewed, items, unreadOnly, waitingOnly]
  );
  const totalCount = acceptedQuery.data?.pages[0]?.totalCount ?? 0;
  const fetchNextPage = acceptedQuery.fetchNextPage;
  const hasNextPage = acceptedQuery.hasNextPage;
  const isFetchingNextPage = acceptedQuery.isFetchingNextPage;

  useEffect(() => {
    if (internalOpsAccess) return;
    void router.replace(buildOrgHref({ orgId: workspaceId, page: "home" }));
  }, [internalOpsAccess, router, workspaceId]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "320px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, visibleItems.length]);

  if (!internalOpsAccess) return null;

  return (
    <div className="space-y-6">
      <OrgPageHeader
        description="모든 Workspace와 Role에서 기회 제안을 수락한 인재를 수락일 순으로 검토합니다."
        title="All"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChipGroup
          aria-label="수락 인재 필터"
          label="필터"
          onValueChange={setActiveFilters}
          options={ACCEPTED_TALENT_FILTERS.map((option) => ({
            ...option,
            disabled: option.value === "unread" && !hasHydrated,
          }))}
          value={activeFilters}
        />
        <div
          aria-live="polite"
          className="text-[12px] font-light tabular-nums text-neutral-muted"
        >
          {visibleItems.length}명 표시 · 전체 {totalCount}명
        </div>
      </div>

      {acceptedQuery.error instanceof Error ? (
        <OrgErrorState
          message={acceptedQuery.error.message}
          onRetry={() => void acceptedQuery.refetch()}
        />
      ) : null}

      {acceptedQuery.isLoading ? (
        <OrgTalentTableLoading />
      ) : visibleItems.length > 0 ? (
        <OrgTalentTable
          dateHeader="수락일"
          onSelect={(item) => {
            markViewed(item.recommendationId);
            selectTalent(item);
          }}
          onSelectRole={(item) => {
            void router.push(
              buildOrgHref({
                orgId: item.workspaceId,
                page: "jobs",
                roleId: item.roleId,
              })
            );
          }}
          rows={visibleItems.map((item) => ({
            companyName: item.companyName,
            date: item.acceptedAt,
            item,
            key: item.recommendationId,
            name: item.talent.name || item.talent.headline || "이름 없음",
            profilePicture: item.talent.profilePicture,
            roleName: item.roleName,
            statusLabel: item.isAwaitingStageMove
              ? "수락 후 대기"
              : "단계 이동됨",
            statusTone: item.isAwaitingStageMove ? "primary" : "muted",
            viewed: isViewed(item.recommendationId),
          }))}
          roleHeader="수락 Role"
          statusHeader="단계 이동"
        />
      ) : !hasNextPage ? (
        <div className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-5 py-14 text-center">
          <div className="text-[14px] font-medium text-neutral-primary">
            조건에 맞는 인재가 없습니다.
          </div>
          <div className="mt-1 text-[13px] font-light text-neutral-muted">
            필터를 끄면 전체 수락자를 다시 확인할 수 있습니다.
          </div>
        </div>
      ) : null}

      <div
        aria-hidden
        className="flex h-12 items-center justify-center text-[12px] text-neutral-muted"
        ref={loadMoreRef}
      >
        {isFetchingNextPage ? (
          <>
            <LoaderCircle className="mr-2 size-3.5 animate-spin" />
            다음 20명을 불러오는 중
          </>
        ) : null}
      </div>
    </div>
  );
}

export function OrgAllAcceptedPage() {
  return (
    <OrgJobsProvider includeBoard={false} routePage="all">
      <OrgAllAcceptedMain />
      <TalentDetailSimpleView />
    </OrgJobsProvider>
  );
}
