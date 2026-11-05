import { useCareerT } from "@/i18n/useCareerT";
import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import { useCareerOpenForms } from "@/hooks/career/useCareerOpenForms";
import type { CareerWorkActivity as WorkActivity } from "@/lib/career/work/activity";

export function CareerWorkActivityStatus({
  activities = [],
  admitting = false,
  className,
}: {
  activities?: WorkActivity[];
  admitting?: boolean;
  className?: string;
}) {
  if (!admitting && activities.length === 0) return null;
  const logs = activities.flatMap((activity) =>
    activity.logs.map((label, index) => ({
      id: `${activity.id}:${index}`,
      label,
      status:
        index === activity.logs.length - 1
          ? ("running" as const)
          : ("done" as const),
    }))
  );
  const startedAt = activities
    .map((activity) => activity.startedAt)
    .filter(Boolean)
    .sort()[0];
  return (
    <ChatThinkingLogPanel
      active
      className={className}
      hasToolWork={logs.length > 0}
      liveLine
      logs={logs}
      startedAt={startedAt}
    />
  );
}

export function CareerWorkActivity({
  conversationId,
  admitting,
  visibleReplyIds = [],
  className,
}: {
  conversationId?: string | null;
  admitting?: boolean;
  visibleReplyIds?: string[];
  className?: string;
}) {
  const { data, isError } = useCareerOpenForms(conversationId);
  const t = useCareerT();
  return (
    <>
      {isError && !admitting && (
        <div role="status" className="text-sm text-neutral-muted">
          {t(
            "career.chat.work_status_unavailable",
            "작업 상태를 확인하지 못했어요. 다시 연결하고 있어요."
          )}
        </div>
      )}
      <CareerWorkActivityStatus
        className={className}
        activities={data?.activities?.filter(
          (activity) => !visibleReplyIds.includes(`invocation:${activity.id}`)
        )}
        admitting={admitting}
      />
    </>
  );
}
