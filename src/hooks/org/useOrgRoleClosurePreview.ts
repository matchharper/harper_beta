import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

export function useOrgRoleClosurePreview(args: { enabled: boolean; roleId?: string; workspaceId?: string }) {
  const { c } = useOrgLocale();
  const query = useQuery({
    queryKey: ["org", "role-closure-preview", args.workspaceId, args.roleId],
    enabled: args.enabled && Boolean(args.workspaceId && args.roleId),
    queryFn: ({ signal }) => fetchWithInternalAuth<{ recipientCount: number }>(
      `/api/org/role?${new URLSearchParams({ workspaceId: args.workspaceId!, roleId: args.roleId! })}`,
      { signal },
    ),
    staleTime: 0,
    retry: 1,
  });
  const count = query.data?.recipientCount;
  const ready = query.isSuccess && !query.isFetching;
  const description = query.isError
    ? c("안내 대상 인원을 불러오지 못했습니다. 다시 시도해 주세요.", "We couldn’t load the notification count. Try again.")
    : !ready || count === undefined
      ? c("안내 대상 인원을 확인하고 있습니다.", "Checking how many candidates will be notified.")
      : count === 0
        ? c("후보자 추천을 종료합니다. 채용 종료를 안내할 후보자는 없습니다.", "Stop candidate recommendations. No candidates will receive a hiring closure notice.")
        : c(
          "연결을 수락한 {count}명에게 해당 역할의 채용이 종료되었다는 안내를 하겠습니다. 이미 전달된 안내는 되돌릴 수 없습니다.",
          count === 1
            ? "We’ll notify {count} candidate who accepted the connection that hiring for this role has ended. Sent notifications cannot be undone."
            : "We’ll notify {count} candidates who accepted the connection that hiring for this role has ended. Sent notifications cannot be undone.",
          { count },
        );
  return { ...query, ready, description };
}
