import { LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatKstDateOnly } from "@/components/ops/dateUtils";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useOrgAcceptedTalents } from "@/hooks/org/useOrg";
import { OrgJobsProvider, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgAcceptedTalentItem } from "@/lib/org/server";
import { cn } from "@/lib/utils";

function formatAcceptedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatKstDateOnly(date).slice(2);
}

function AcceptedTalentAvatar({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  const profilePicture = getDisplayableProfileImageUrl(src);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  if (profilePicture && failedImageSrc !== profilePicture) {
    return (
      <Image
        alt=""
        className="size-7 rounded-full object-cover"
        height={28}
        onError={() => setFailedImageSrc(profilePicture)}
        src={profilePicture}
        unoptimized
        width={28}
      />
    );
  }

  return (
    <span className="flex size-9 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusLabel({
  children,
  tone,
}: {
  children: string;
  tone: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]",
        tone === "primary"
          ? "font-medium text-primary"
          : "font-light text-neutral-muted"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "primary" ? "bg-primary" : "bg-neutral-400"
        )}
      />
      {children}
    </span>
  );
}

function AcceptedTalentRow({
  item,
  onSelect,
  viewed,
}: {
  item: OrgAcceptedTalentItem;
  onSelect: () => void;
  viewed: boolean;
}) {
  const name = item.talent.name || item.talent.headline || "이름 없음";

  return (
    <tr
      aria-label={`${name} 상세 열기`}
      className="group cursor-pointer border-b border-neutral-1000-a05 outline-none transition last:border-b-0 hover:bg-neutral-1000-a03 focus-visible:bg-neutral-1000-a05"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <td className="w-16 py-3 pl-4 pr-2">
        <AcceptedTalentAvatar name={name} src={item.talent.profilePicture} />
      </td>
      <td className="min-w-44 px-3 py-3">
        <span className="block truncate text-[14px] font-medium text-neutral-primary">
          {name}
        </span>
      </td>
      <td className="min-w-52 px-3 py-3 text-[13px] font-normal text-neutral-primary">
        <span className="line-clamp-2">{item.roleName || "Role"}</span>
      </td>
      <td className="min-w-44 px-3 py-3 text-[13px] font-light text-neutral-muted">
        <span className="line-clamp-2">{item.companyName}</span>
      </td>
      <td className="w-28 px-3 py-3">
        <StatusLabel tone={viewed ? "muted" : "primary"}>
          {viewed ? "열람" : "미열람"}
        </StatusLabel>
      </td>
      <td className="w-36 px-3 py-3">
        <StatusLabel tone={item.isAwaitingStageMove ? "primary" : "muted"}>
          {item.isAwaitingStageMove ? "수락 후 대기" : "단계 이동됨"}
        </StatusLabel>
      </td>
      <td className="w-28 px-3 py-3 pr-4 text-right text-[13px] tabular-nums text-neutral-muted">
        {formatAcceptedDate(item.acceptedAt)}
      </td>
    </tr>
  );
}

function AcceptedTalentsLoading() {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="flex items-center gap-4 border-b border-neutral-1000-a05 px-4 py-3 last:border-b-0"
          key={index}
        >
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="ml-8 h-4 w-48" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function OrgAllAcceptedMain() {
  const router = useRouter();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
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

      <div className="flex flex-col gap-3 rounded-lg border border-neutral-1000-a05 bg-bg-floating px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <label className="flex items-center gap-2.5 text-[13px] text-neutral-primary">
            <Switch
              aria-label="열람하지 않은 사람만 보기"
              checked={unreadOnly}
              disabled={!hasHydrated}
              onCheckedChange={setUnreadOnly}
            />
            열람하지 않은 사람만 보기
          </label>
          <label className="flex items-center gap-2.5 text-[13px] text-neutral-primary">
            <Switch
              aria-label="수락 후 대기 상태만 보기"
              checked={waitingOnly}
              onCheckedChange={setWaitingOnly}
            />
            수락 후 대기 상태만 보기
          </label>
        </div>
        <div className="text-[12px] font-light tabular-nums text-neutral-muted">
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
        <AcceptedTalentsLoading />
      ) : visibleItems.length > 0 ? (
        <div className="overflow-x-auto rounded-sm border border-neutral-1000-a05 bg-bg-floating">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="bg-neutral-200/35">
              <tr className="border-b border-neutral-1000-a05 text-[12px] font-light text-neutral-soft">
                <th className="w-16 py-2.5 pl-4 pr-2 font-normal">사진</th>
                <th className="px-3 py-2.5 font-normal">이름</th>
                <th className="px-3 py-2.5 font-normal">수락 Role</th>
                <th className="px-3 py-2.5 font-normal">회사</th>
                <th className="w-28 px-3 py-2.5 font-normal">열람 여부</th>
                <th className="w-36 px-3 py-2.5 font-normal">단계 이동</th>
                <th className="w-28 px-3 py-2.5 pr-4 text-right font-normal">
                  수락일
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <AcceptedTalentRow
                  item={item}
                  key={item.recommendationId}
                  onSelect={() => {
                    markViewed(item.recommendationId);
                    selectTalent(item);
                  }}
                  viewed={isViewed(item.recommendationId)}
                />
              ))}
            </tbody>
          </table>
        </div>
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
