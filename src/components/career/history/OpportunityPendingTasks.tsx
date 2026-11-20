import Link from "next/link";
import { ArrowUpRight, CalendarClock, MessageSquare } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import type { CareerPendingCompanyRequestAction } from "@/lib/career/pendingActions";
import { useCareerTasks } from "@/hooks/career/useCareerTasks";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerWorkspaceNavigation } from "../CareerWorkspaceNavigationContext";

export default function OpportunityPendingTasks({
  roleId,
}: {
  roleId: string;
}) {
  const t = useCareerT();
  const navigation = useCareerWorkspaceNavigation();
  const { actions, meetingSchedules, error, refetch } = useCareerTasks();
  const requests = actions.filter(
    (action): action is CareerPendingCompanyRequestAction =>
      action.kind === "company_request" && action.roleId === roleId
  );
  const meetings = meetingSchedules.filter(
    (meeting) => meeting.roleId === roleId
  );
  if (!error && (!navigation || !requests.length) && !meetings.length)
    return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">
        {t("career.tasks.title", "할 일")}
      </h2>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-neutral-muted"
        >
          {t(
            "career.tasks.error",
            "일부 할 일을 불러오지 못했어요. 다시 확인해 주세요."
          )}
          <MuteButton size="sm" onClick={refetch}>
            {t("career.tasks.retry", "다시 불러오기")}
          </MuteButton>
        </div>
      )}
      {(meetings.length > 0 || (navigation && requests.length > 0)) && (
        <div className="divide-y divide-stroke-subtle rounded-xl border border-stroke-subtle bg-bg-floating px-4">
          {navigation &&
            requests.map((action) => (
              <div key={action.id} className="flex items-center gap-3 py-3">
                <MessageSquare
                  className="size-4 shrink-0 text-neutral-muted"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 text-sm">{action.prompt}</p>
                <MuteButton onClick={() => navigation.openChatAction(action)}>
                  {action.requestMode === "resume"
                    ? t("career.tasks.sentence.review_action", "확인하기")
                    : t("career.tasks.answer", "답변하기")}
                </MuteButton>
              </div>
            ))}
          {meetings.map((meeting) => (
            <Link
              key={meeting.scheduleId}
              href={meeting.invitationPath}
              className="flex min-h-12 items-center gap-3 py-3 text-sm hover:text-action"
            >
              <CalendarClock
                aria-hidden
                className="size-4 text-neutral-muted"
              />
              {t("career.tasks.meeting", "인터뷰 가능한 시간을 알려주세요")}
              <ArrowUpRight aria-hidden className="ml-auto size-4" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
