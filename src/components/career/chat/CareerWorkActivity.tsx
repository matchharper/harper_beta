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
  const { data } = useCareerOpenForms(conversationId);
  return (
    <CareerWorkActivityStatus
      activities={data?.activities}
      admitting={admitting}
    />
  );
}
