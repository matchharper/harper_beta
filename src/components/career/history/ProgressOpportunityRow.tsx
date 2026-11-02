import { useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, ArrowUpRight } from "lucide-react";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { formatCareerMeetingDateTimeRange } from "@/lib/career/meetingDisplay";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "../watchlist/CompanyLogo";
import AppointmentCreateButton from "../AppointmentCreateButton";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityUpcomingMeeting,
} from "../types";

export default function ProgressOpportunityRow({
  item,
  statusLabel,
  pending,
  actions,
  onOpenDetail,
}: {
  item: CareerHistoryOpportunity;
  statusLabel: string;
  pending: boolean;
  actions: ReactNode;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const [expanded, setExpanded] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<{
    item: CareerHistoryOpportunity;
    meeting: CareerOpportunityUpcomingMeeting;
  } | null>(null);
  const [renderedAt] = useState(Date.now);
  const candidates = [
    item.upcomingMeeting,
    createdMeeting?.item === item ? createdMeeting.meeting : null,
  ].filter((m): m is CareerOpportunityUpcomingMeeting =>
    Boolean(m && Date.parse(m.startAt) >= renderedAt)
  );
  const meeting = candidates.sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)
  )[0];
  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-start gap-1 px-3 pt-3">
        <ClickablePanel
          aria-expanded={expanded}
          aria-label={`${item.title} · ${item.companyName}`}
          onActivate={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md pb-2.5"
        >
          <CompanyLogo
            logoUrl={item.companyLogoUrl}
            name={item.companyName}
            size="xm"
          />
          <div className="min-w-0 flex-1">
            <h3 className="wrap-break-word text-[14px] font-normal leading-5 text-neutral-primary">
              {item.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[11px] leading-4 text-neutral-muted">
                {[item.companyName, formatCareerLocation(item.location, locale)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-action-strong">
                <span className="size-1 rounded-full bg-action" />
                {statusLabel}
              </span>
            </div>
          </div>
          <ChevronDown
            aria-hidden
            strokeWidth={1.5}
            className={cn(
              "mt-1 size-4 shrink-0 text-neutral-soft transition-transform",
              expanded && "rotate-180"
            )}
          />
        </ClickablePanel>
        {actions}
      </div>
      <div
        className={cn(
          "mx-3 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md px-2.5 py-2",
          meeting ? "bg-action-faded/50" : "bg-bg-weak/60"
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <CalendarClock
            aria-hidden
            strokeWidth={1.5}
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              meeting ? "text-action-strong" : "text-neutral-muted"
            )}
          />
          {meeting ? (
            <div>
              <p className="text-[13px] font-normal leading-5 text-action-strong">
                {formatCareerMeetingDateTimeRange({
                  startAt: meeting.startAt,
                  endAt: meeting.endAt,
                  locale,
                })}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-neutral-muted">
                {meeting.title || t("career.meetings.upcoming", "다음 일정")}
              </p>
            </div>
          ) : (
            <p className="text-[12px] leading-5 text-neutral-muted">
              {t("career.meetings.none", "예정된 일정 없음")}
            </p>
          )}
        </div>
        <AppointmentCreateButton
          roleId={item.roleId}
          positionTitle={item.title}
          companyName={item.companyName}
          onCreated={(schedule) => {
            if (schedule.confirmed_start_at)
              setCreatedMeeting({
                item,
                meeting: {
                  startAt: schedule.confirmed_start_at,
                  endAt: schedule.confirmed_end_at,
                  title: schedule.title,
                },
              });
          }}
        />
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-neutral-1000-a05 px-3 py-3">
          {item.talentMemo && (
            <RichText variant="career" typography="body-compact">
              {item.talentMemo}
            </RichText>
          )}
          <div className="flex justify-end">
            <MuteButton size="sm" onClick={() => onOpenDetail(item)}>
              {t("career.history.progress.open", "진행 상황 · 준비 내용")}
              <ArrowUpRight className="size-3.5" />
            </MuteButton>
          </div>
        </div>
      )}
    </article>
  );
}
