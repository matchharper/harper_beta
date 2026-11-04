import { useCareerT } from "@/i18n/useCareerT";
import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import { useCareerOpenForms } from "@/hooks/career/useCareerOpenForms";
import type { CareerWorkActivity as WorkActivity } from "@/lib/career/work/activity";

export function CareerWorkActivityStatus({
  activities = [],
  admitting = false,
}: {
  activities?: WorkActivity[];
  admitting?: boolean;
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
  return logs.length ? (
    <ChatThinkingLogPanel active hasToolWork logs={logs} />
  ) : (
    <div role="status" className="text-neutral-muted">
      <span className="career-thinking-shimmer inline-block text-sm font-medium">
        Thinking...
      </span>
    </div>
  );
}

export function CareerWorkActivity({
  conversationId,
  admitting,
}: {
  conversationId?: string | null;
  admitting?: boolean;
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
        activities={data?.activities}
        admitting={admitting}
      />
    </>
  );
}
