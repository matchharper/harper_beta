import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { SectionHeader, SectionTitle } from "@/components/ui/section-header";
import { formatCareerMeetingDateTimeRange } from "@/lib/career/meetingDisplay";
import type { TalentMeetingSchedule } from "@/lib/career/meetings/types";
import AppointmentCreateButton from "./AppointmentCreateButton";
import type { CareerOpportunityUpcomingMeeting } from "./types";

type Page = { schedules: TalentMeetingSchedule[]; nextOffset: number | null };
export function AppointmentList({
  schedules,
  onOpenRole,
}: {
  schedules: TalentMeetingSchedule[];
  onOpenRole?: (id: string) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  return (
    <div>
      {schedules.map((meeting, index) => (
        <details
          key={meeting.id}
          open={index === 0}
          className="border-b border-neutral-1000-a05 py-2.5 last:border-0 last:pb-0"
        >
          <summary className="flex cursor-pointer items-start gap-2 text-[13px] text-neutral-primary">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-action" />
            <span>
              <span className="block text-[14px] font-normal leading-5 text-action-strong">
                {formatCareerMeetingDateTimeRange({
                  startAt: meeting.confirmed_start_at ?? "",
                  calendarDate:
                    typeof meeting.source_refs?.calendarDate === "string"
                      ? meeting.source_refs.calendarDate
                      : null,
                  endAt: meeting.confirmed_end_at,
                  locale,
                })}
              </span>
              <span className="mt-0.5 block text-xs font-normal">
                {meeting.title}
              </span>
              {meeting.role && (
                <span className="block text-neutral-muted">
                  {[
                    meeting.role.company_workspace?.company_name,
                    meeting.role.name,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
          </summary>
          <div className="mt-2 space-y-2 pl-[22px] text-[13px]">
            {meeting.content && (
              <RichText typography="body-compact">{meeting.content}</RichText>
            )}
            {meeting.calendar?.conference_url && (
              <RichText>{`[${t("career.meetings.join", "미팅 참여")}](${meeting.calendar.conference_url})`}</RichText>
            )}
            {meeting.role_id && onOpenRole && (
              <MuteButton
                size="sm"
                onClick={() => onOpenRole(meeting.role_id!)}
              >
                {t("career.meetings.open_role", "관련 포지션")}
              </MuteButton>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
export default function UpcomingAppointments({
  roleId,
  enabled = true,
  onOpenRole,
  position,
  fallbackMeeting,
}: {
  roleId?: string;
  enabled?: boolean;
  onOpenRole?: (id: string) => void;
  position?: { title: string; companyName: string };
  fallbackMeeting?: CareerOpportunityUpcomingMeeting | null;
}) {
  const { fetchWithAuth } = useCareerApi();
  const userId = useAuthStore((state) => state.session?.user.id);
  const t = useCareerT();
  const { locale } = useMessages();
  const query = useInfiniteQuery({
    queryKey: ["career-meeting-schedules", userId, roleId],
    enabled: enabled && Boolean(userId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const params = new URLSearchParams({ offset: String(pageParam) });
      if (roleId) params.set("roleId", roleId);
      const response = await fetchWithAuth(
        `/api/talent/meeting-schedules?${params}`
      );
      if (!response.ok) throw new Error("Appointments unavailable");
      return response.json();
    },
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const schedules = query.data?.pages.flatMap((page) => page.schedules) ?? [];
  const pendingMeeting = query.isPending && fallbackMeeting;
  if (!enabled || (!position && !schedules.length && !query.isError))
    return null;
  return (
    <section
      className={position ? "rounded-xl bg-bg-weak/60 p-5 sm:p-6" : "mb-6"}
    >
      <SectionHeader className="flex-row flex-wrap items-center justify-between">
        <SectionTitle as="h2" type="title" className="text-[13px] font-normal">
          {t("career.meetings.upcoming", "다음 일정")}
        </SectionTitle>
        {position && roleId && (
          <AppointmentCreateButton
            roleId={roleId}
            positionTitle={position.title}
            companyName={position.companyName}
          />
        )}
      </SectionHeader>
      {position &&
        !schedules.length &&
        !query.isError &&
        (pendingMeeting ? (
          <div className="pt-2">
            <p className="text-[14px] font-normal leading-5 text-action-strong">
              {formatCareerMeetingDateTimeRange({
                startAt: pendingMeeting.startAt,
                calendarDate: pendingMeeting.calendarDate,
                endAt: pendingMeeting.endAt,
                locale,
              })}
            </p>
            <p className="mt-0.5 text-xs text-neutral-primary">
              {pendingMeeting.title}
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-muted" role="status">
            {query.isFetching
              ? t("career.meetings.loading", "일정을 불러오는 중…")
              : t("career.meetings.none", "예정된 일정 없음")}
          </p>
        ))}
      {query.isError && (
        <p role="status" className="text-sm text-neutral-muted">
          {t("career.meetings.load_error", "일정을 불러오지 못했어요.")}{" "}
          <MuteButton size="sm" onClick={() => void query.refetch()}>
            {t("career.tasks.retry", "다시 불러오기")}
          </MuteButton>
        </p>
      )}
      <AppointmentList schedules={schedules} onOpenRole={onOpenRole} />
      {query.hasNextPage && (
        <MuteButton
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("career.meetings.more", "일정 더 보기")}
        </MuteButton>
      )}
    </section>
  );
}
