import { Loading } from "@/components/ui/loading";
import { MuteButton } from "@/components/ui/button";
import { useOrgMatchingSearchStatus } from "@/hooks/org/useOrgAgent";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { RoleMatchingActivity } from "@/lib/companyFirstSearch/activity";
import { isOrgQueryAccessError } from "@/lib/org/queryError";

export function RoleSearchActivityLabel({ activity }: { activity: RoleMatchingActivity }) {
  const { c } = useOrgLocale();
  let label: string;
  if (activity.phase === "reviewing") label = c("검색 결과 확인 중", "Reviewing search results");
  else if (activity.phase === "preparing") label = c("후보자 추천 준비 중", "Preparing recommendations");
  else if (activity.phase === "delivering") label = c("후보자 추천 전달 중", "Delivering recommendations");
  else if (activity.trigger === "role_activated") label = activity.phase === "queued"
    ? c("첫 후보자 검색 대기 중", "First candidate search queued")
    : c("첫 후보자 검색 중", "Finding the first candidates");
  else if (activity.trigger === "scheduled") label = activity.phase === "queued"
    ? c("정기 검색 대기 중", "Scheduled search queued")
    : c("정기 후보자 검색 중", "Scheduled candidate search in progress");
  else label = activity.phase === "queued" ? c("후보자 검색 대기 중", "Candidate search queued")
    : c("후보자 검색 중", "Searching for candidates");
  return <Loading className="text-neutral-muted motion-reduce:[&>span:first-child]:animate-none" label={label} size="sm" />;
}

export function OrgRoleSearchActivity({ workspaceId, roleId }: { workspaceId: string; roleId: string }) {
  const { c } = useOrgLocale();
  const query = useOrgMatchingSearchStatus({ workspaceId, roleId, watchAutomatic: true });
  if (!query.data?.activity || isOrgQueryAccessError(query.error)) return null;
  return <div className="shrink-0 border-b border-neutral-1000-a05 px-4 py-2.5 md:px-5">
    {query.isError ? (
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-muted">
        <span>{c("검색 상태를 새로 확인하지 못했어요.", "Couldn’t refresh search status.")}</span>
        <MuteButton size="sm" variant="transparent" onClick={() => void query.refetch()}>
          {c("다시 확인", "Retry")}
        </MuteButton>
      </div>
    ) : <RoleSearchActivityLabel activity={query.data.activity} />}
  </div>;
}
