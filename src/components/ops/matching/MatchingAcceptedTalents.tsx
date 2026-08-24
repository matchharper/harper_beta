import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TalentDetail } from "@/components/ops/career/TalentDetail";
import { opsTheme } from "@/components/ops/theme";
import {
  OrgTalentTable,
  OrgTalentTableLoading,
} from "@/components/org/workspace/OrgTalentTable";
import {
  FilterChipGroup,
  type FilterChipOption,
} from "@/components/ui/filter-chip-group";
import { BareButton } from "@/components/ui/button";
import { useOrgAcceptedTalents } from "@/hooks/org/useOrg";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import type { OrgAcceptedTalentItem } from "@/lib/org/server";

const ACCEPTED_TALENT_FILTERS = [
  { label: "미열람", value: "unread" },
  { label: "수락 후 대기", value: "waiting" },
] as const satisfies readonly FilterChipOption<"unread" | "waiting">[];

function AcceptedTalentDrawer({
  onClose,
  talent,
}: {
  onClose: () => void;
  talent: OrgAcceptedTalentItem | null;
}) {
  if (!talent) return null;

  const displayName = talent.talent.name || talent.talent.headline || "현재 후보자";

  return (
    <div className="fixed inset-0 z-[70]">
      <BareButton
        aria-label="닫기"
        className="absolute inset-0 h-full w-full cursor-default bg-black/35"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className="absolute bottom-0 right-0 top-0 flex w-[90vw] min-w-0 flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)]"
        role="dialog"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-primary">
              {displayName}
            </div>
            <div className="mt-0.5 truncate text-xs text-neutral-muted">
              {talent.companyName} · {talent.roleName || "Role"}
            </div>
          </div>
          <BareButton
            aria-label="닫기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </BareButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TalentDetail userId={talent.talent.userId} />
        </div>
      </div>
    </div>
  );
}

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
  const [selectedTalent, setSelectedTalent] =
    useState<OrgAcceptedTalentItem | null>(null);
  const acceptedQuery = useOrgAcceptedTalents({ enabled: canFetchInternal });
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
          모든 Workspace와 Role에서 기회 제안을 수락한 인재를 수락일 순으로 검토합니다.
        </p>
      </div>

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
          dateHeader="수락일"
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
            name: item.talent.name || item.talent.headline || "이름 없음",
            profilePicture: item.talent.profilePicture,
            roleName: item.roleName,
            statusLabel: item.isAwaitingStageMove
              ? "수락 후 대기"
              : "단계 이동됨",
            statusTone: item.isAwaitingStageMove ? "primary" : "muted",
            viewed: isViewed(item.recommendationId),
          }))}
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

      <AcceptedTalentDrawer
        onClose={() => setSelectedTalent(null)}
        talent={selectedTalent}
      />
    </div>
  );
}
