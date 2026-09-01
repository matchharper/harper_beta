import { CalendarClock } from "lucide-react";
import type { CareerOpportunityUpcomingMeeting } from "../types";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerMeetingDateTimeRange } from "@/lib/career/meetingDisplay";
import { cn } from "@/lib/utils";

export default function UpcomingMeetingStrip({
  className,
  meeting,
}: {
  className?: string;
  meeting?: CareerOpportunityUpcomingMeeting | null;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  if (!meeting) return null;

  const dateTime = formatCareerMeetingDateTimeRange({
    endAt: meeting.endAt,
    locale,
    startAt: meeting.startAt,
  });
  if (!dateTime) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md bg-action px-3 py-1.5 text-[12px] font-medium leading-5 text-neutral-00",
        className
      )}
    >
      <span className="min-w-0">
        {t(
          "career.history.upcoming_meeting_strip.label",
          "다음 미팅 · {dateTime}",
          { values: { dateTime } }
        )}
      </span>
    </div>
  );
}
