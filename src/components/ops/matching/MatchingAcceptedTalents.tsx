import { Building2, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MatchingTalentDrawer } from "@/components/ops/matching/MatchingTalentDrawer";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  OrgTalentTable,
  OrgTalentTableLoading,
} from "@/components/org/workspace/OrgTalentTable";
import {
  FilterChipGroup,
  type FilterChipOption,
} from "@/components/ui/filter-chip-group";
import { BareButton, MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgAcceptedTalents } from "@/hooks/org/useOrg";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOpsMatchingCompanies } from "@/hooks/ops/useOpsMatching";
import type { OrgAcceptedTalentItem } from "@/lib/org/server";

const ACCEPTED_TALENT_FILTERS = [
  { label: "미검토", value: "unread" },
  { label: "수락 후 대기", value: "waiting" },
] as const satisfies readonly FilterChipOption<"unread" | "waiting">[];

export function MatchingAcceptedTalents({
  canFetchInternal,
  currentUserEmail,
  onSelectRole,
}: {
  canFetchInternal: boolean;
  currentUserEmail?: string | null;
  onSelectRole: (item: OrgAcceptedTalentItem) => void;
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<("unread" | "waiting")[]>(
    []
  );
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>(
    []
  );
  const [selectedTalent, setSelectedTalent] =
    useState<OrgAcceptedTalentItem | null>(null);
  const companiesQuery = useOpsMatchingCompanies({
    enabled: canFetchInternal,
  });
  const workspaceOptions = useMemo(
    () => companiesQuery.data?.items ?? [],
    [companiesQuery.data?.items]
  );
  const acceptedQuery = useOrgAcceptedTalents({
    enabled: canFetchInternal,
    workspaceIds: selectedWorkspaceIds,
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
  const selectedWorkspaceLabel = useMemo(() => {
    if (selectedWorkspaceIds.length === 0) return "Workspace 전체";
    if (selectedWorkspaceIds.length > 1) {
      return `Workspace ${selectedWorkspaceIds.length}개`;
    }
    return (
      workspaceOptions.find(
        (workspace) => workspace.companyWorkspaceId === selectedWorkspaceIds[0]
      )?.companyName ?? "Workspace 1개"
    );
  }, [selectedWorkspaceIds, workspaceOptions]);
  const fetchNextPage = acceptedQuery.fetchNextPage;
  const hasNextPage = acceptedQuery.hasNextPage;
  const isFetchingNextPage = acceptedQuery.isFetchingNextPage;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-neutral-primary">
          Accepted Talents
        </h1>
        <p className="mt-1 text-sm text-neutral-muted">
          모든 기회 제안을 수락한 인재를 수락일 순으로 검토합니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label="내부 Workspace 필터"
                className={cx(
                  "h-8 max-w-60 gap-1.5 text-[13px]",
                  selectedWorkspaceIds.length > 0 &&
                    "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
                )}
                size="sm"
                variant={
                  selectedWorkspaceIds.length > 0 ? "neutral" : "default"
                }
              >
                <Building2 aria-hidden className="size-3.5" />
                <span className="truncate">{selectedWorkspaceLabel}</span>
                <ChevronDown aria-hidden className="size-3.5" />
              </MuteButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 overflow-hidden p-0"
            >
              <div className="max-h-72 overflow-y-auto p-1">
                {companiesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoaderCircle className="size-4 animate-spin text-neutral-soft" />
                  </div>
                ) : companiesQuery.error ? (
                  <div className="px-2 py-3 text-xs leading-5 text-critical">
                    Workspace 목록을 불러오지 못했습니다.
                  </div>
                ) : workspaceOptions.length > 0 ? (
                  workspaceOptions.map((workspace) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedWorkspaceIds.includes(
                        workspace.companyWorkspaceId
                      )}
                      className="gap-2 rounded-[8px] py-1.5 text-[13px]"
                      indicatorPosition="right"
                      key={workspace.companyWorkspaceId}
                      onCheckedChange={(checked) => {
                        setSelectedWorkspaceIds((current) => {
                          if (checked === true) {
                            return current.includes(
                              workspace.companyWorkspaceId
                            )
                              ? current
                              : [...current, workspace.companyWorkspaceId];
                          }
                          return current.filter(
                            (workspaceId) =>
                              workspaceId !== workspace.companyWorkspaceId
                          );
                        });
                      }}
                      onSelect={(event) => event.preventDefault()}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {workspace.companyName}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))
                ) : (
                  <div className="px-2 py-3 text-xs text-neutral-muted">
                    표시할 Workspace가 없습니다.
                  </div>
                )}
              </div>
              <div className="border-t border-neutral-1000-a05 p-1">
                <DropdownMenuItem
                  onSelect={() => setSelectedWorkspaceIds([])}
                  selected={selectedWorkspaceIds.length === 0}
                  variant="sm"
                >
                  전체 보기
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          aria-live="polite"
          className="text-[12px] font-light tabular-nums text-neutral-muted"
        >
          {visibleItems.length}명 표시 · 전체 {totalCount}명
        </div>
      </div>

      {acceptedQuery.error instanceof Error ? (
        <div className={opsTheme.errorNotice}>
          <div>{acceptedQuery.error.message}</div>
          <BareButton
            className="mt-3 h-8 rounded-md px-2.5 text-xs font-medium text-neutral-primary hover:bg-bg-weak"
            onClick={() => void acceptedQuery.refetch()}
            type="button"
          >
            다시 시도
          </BareButton>
        </div>
      ) : null}

      {acceptedQuery.isLoading ? (
        <OrgTalentTableLoading />
      ) : visibleItems.length > 0 ? (
        <OrgTalentTable
          compactRoleCompanyColumns
          dateHeader="수락일"
          middleColumn="memo"
          onSelect={(item) => {
            markViewed(item.recommendationId);
            setSelectedTalent(item);
          }}
          onSelectRole={onSelectRole}
          roleHeader="수락 Role"
          rows={visibleItems.map((item) => ({
            companyName: item.companyName,
            date: item.acceptedAt,
            item,
            key: item.recommendationId,
            memoPreview: item.memoPreview,
            name: item.talent.name || item.talent.headline || "이름 없음",
            profilePicture: item.talent.profilePicture,
            roleName: item.roleName,
            statusLabel: item.currentStageLabel,
            statusTone: item.isAwaitingStageMove ? "primary" : "muted",
            viewed: isViewed(item.recommendationId),
          }))}
          statusHeader="현재 단계"
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

      <MatchingTalentDrawer
        onClose={() => setSelectedTalent(null)}
        role={
          selectedTalent
            ? {
                companyName: selectedTalent.companyName,
                companyWorkspaceId: selectedTalent.workspaceId,
                description: selectedTalent.roleDescription,
                descriptionSummary: selectedTalent.roleDescriptionSummary,
                locationText: selectedTalent.roleLocationText,
                roleId: selectedTalent.roleId,
                roleName: selectedTalent.roleName || "Role",
                sourceType: "internal",
                status: selectedTalent.roleStatus,
                updatedAt: selectedTalent.roleUpdatedAt,
              }
            : null
        }
        talent={
          selectedTalent
            ? {
                email: null,
                fit: null,
                name:
                  selectedTalent.talent.name ||
                  selectedTalent.talent.headline ||
                  null,
                userId: selectedTalent.talent.userId,
              }
            : null
        }
      />
    </div>
  );
}
