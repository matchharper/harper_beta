// career-i18n-skip-file: Internal administrator correspondence inspector.
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { canInspectCareerAgentMessages } from "@/lib/internalAccess";
import type { AdminAgentHistory } from "@/lib/agentContacts/adminHistory";
import { useOptionalCareerSidebarContext } from "../CareerSidebarContext";
import type { CareerHistoryOpportunity } from "../types";

export default function OpportunityAgentMessages({ item }: { item: CareerHistoryOpportunity }) {
  const user = useOptionalCareerSidebarContext()?.user;
  if (item.sourceType !== "internal" || !user || !canInspectCareerAgentMessages(user.email)) return null;
  return <AgentMessages key={`${user.id}:${item.roleId}`} item={item} userId={user.id} />;
}

function AgentMessages({ item, userId }: { item: CareerHistoryOpportunity; userId: string }) {
  const [open, setOpen] = useState(false);
  const { fetchWithAuth } = useCareerApi();
  const history = useInfiniteQuery({
    queryKey: ["career-admin-agent-messages", userId, item.roleId],
    enabled: open,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<AdminAgentHistory> => {
      const response = await fetchWithAuth(`/api/talent/agent-messages?roleId=${encodeURIComponent(item.roleId)}&offset=${pageParam}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "관리자 계정만 볼 수 있습니다." : "대화를 불러오지 못했습니다.");
      return response.json();
    },
    getNextPageParam: page => page.nextOffset ?? undefined,
    retry: false,
    staleTime: 0,
  });
  const messages = history.data?.pages.flatMap(page => page.messages) ?? [];
  return <>
    <MuteButton size="sm" variant="transparent" onClick={() => setOpen(true)}>
      <MessagesSquare aria-hidden className="size-3.5" />
      에이전트 대화
    </MuteButton>
    <TalentCareerModal open={open} onClose={() => setOpen(false)} title="에이전트 대화"
      description={<span>{item.companyName} · {item.title}</span>}
      bodyClassName="px-4 pb-5 sm:px-5" panelClassName="max-w-2xl"
      headerActions={<MuteButton size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}>새로고침</MuteButton>}>
      {history.isPending && <div role="status" aria-label="대화 불러오는 중" className="space-y-3"><Skeleton className="h-24 w-4/5" /><Skeleton className="ml-auto h-24 w-4/5" /></div>}
      {history.isError && <div role="alert" className="mb-3 text-sm text-critical">{history.error.message}</div>}
      {!history.isPending && !history.isError && messages.length === 0 && <p className="py-6 text-sm text-neutral-muted">아직 주고받은 에이전트 메시지가 없습니다.</p>}
      <ol className="space-y-4">
        {messages.map(message => <li key={message.id} className="rounded-card bg-bg-weak p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-muted">
            <span>{message.direction === "to_company" ? "후보자 에이전트 → 회사 에이전트" : "회사 에이전트 → 후보자 에이전트"}</span>
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ko-KR")}</time>
          </div>
          <div className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-primary">{message.body}</div>
        </li>)}
      </ol>
      {history.hasNextPage && <MuteButton className="mt-4 w-full" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "불러오는 중…" : "다음 메시지 보기"}</MuteButton>}
    </TalentCareerModal>
  </>;
}
