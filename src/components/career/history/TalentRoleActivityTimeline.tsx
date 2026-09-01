import {
  ArrowDown,
  ArrowRight,
  CalendarClock,
  Loader2,
  StickyNote,
} from "lucide-react";
import { useState } from "react";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityMeeting,
  CareerTalentRoleActivity,
} from "../types";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import {
  formatCareerActivityRelativeTime,
  formatCareerMeetingDateTimeRange,
} from "@/lib/career/meetingDisplay";
import { cn } from "@/lib/utils";
import { getSavedOpportunityStatusLabel } from "./savedOpportunityStatus";

type TimelineEntry =
  | {
      activity: CareerTalentRoleActivity;
      id: string;
      occurredAt: string;
      type: "activity";
    }
  | {
      id: string;
      meeting: CareerOpportunityMeeting;
      occurredAt: string;
      type: "meeting";
    };

export function buildTimelineEntries(item: CareerHistoryOpportunity) {
  const entries: TimelineEntry[] = [];
  for (const activity of item.talentRoleActivities ?? []) {
    entries.push({
      activity,
      id: `activity-${activity.id}`,
      occurredAt: activity.createdAt,
      type: "activity",
    });
  }
  for (const meeting of item.confirmedMeetings ?? []) {
    entries.push({
      id: `meeting-${meeting.id}`,
      meeting,
      occurredAt: meeting.startAt,
      type: "meeting",
    });
  }
  return entries.sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
}

export default function TalentRoleActivityTimeline({
  item,
  onAddTalentMemo,
  pending,
}: {
  item: CareerHistoryOpportunity;
  onAddTalentMemo?: (
    item: CareerHistoryOpportunity,
    talentMemo: string
  ) => void | Promise<void>;
  pending: boolean;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const [draftState, setDraftState] = useState({ draft: "", itemId: item.id });
  const [renderedAt] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const draft = draftState.itemId === item.id ? draftState.draft : "";
  const disabled = pending || submitting;
  const timelineEntries = buildTimelineEntries(item);

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content || !onAddTalentMemo || disabled) return;

    setSubmitting(true);
    try {
      await onAddTalentMemo(item, content);
      setDraftState({ draft: "", itemId: item.id });
    } catch {
      // The parent surfaces the request error; keep the draft for a retry.
      return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
      <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-neutral-primary">
        <StickyNote className="h-4 w-4" />
        <span>
          {t("career.history.talent_role_activity_timeline.title", "내 활동")}
        </span>
      </div>

      {onAddTalentMemo ? (
        <div className="mt-3">
          <div className="relative">
            <Textarea
              aria-label={t(
                "career.history.talent_role_activity_timeline.add_memo_aria",
                "메모 추가"
              )}
              className="block min-h-[82px] pb-0 pr-12"
              disabled={disabled}
              maxLength={10_000}
              onChange={(event) =>
                setDraftState({ draft: event.target.value, itemId: item.id })
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={t(
                "career.history.feedback_modal.12volkp",
                "이 포지션에 대해 기억해둘 내용이나 확인할 점을 적어주세요."
              )}
              value={draft}
            />
            <MuteButton
              aria-label={t(
                "career.history.talent_role_activity_timeline.add_memo_aria",
                "메모 추가"
              )}
              className="absolute bottom-2 right-2"
              disabled={disabled || !draft.trim()}
              onClick={() => void handleSubmit()}
              size="sm"
              type="button"
              variant="primary"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </MuteButton>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {item.activityTimelineLoaded === false ? (
          <div className="flex items-center gap-2 text-[13px] leading-5 text-neutral-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t(
              "career.history.talent_role_activity_timeline.loading",
              "활동을 불러오는 중입니다."
            )}
          </div>
        ) : timelineEntries.length === 0 ? (
          <div className="text-[13px] leading-5 text-neutral-soft">
            {t(
              "career.history.talent_role_activity_timeline.empty",
              "아직 기록된 활동이 없습니다."
            )}
          </div>
        ) : (
          <ol className="divide-y divide-neutral-1000-a05">
            {timelineEntries.map((entry) => {
              if (entry.type === "meeting") {
                const meetingDateTime = formatCareerMeetingDateTimeRange({
                  endAt: entry.meeting.endAt,
                  locale,
                  startAt: entry.meeting.startAt,
                });
                const confirmedTime = entry.meeting.confirmedAt
                  ? formatCareerActivityRelativeTime(
                      entry.meeting.confirmedAt,
                      locale,
                      new Date(renderedAt)
                    )
                  : null;
                const isPast =
                  new Date(entry.meeting.endAt).getTime() < renderedAt;
                const meetingTitle =
                  entry.meeting.title ??
                  (isPast
                    ? t(
                        "career.history.talent_role_activity_timeline.past_meeting",
                        "지난 미팅"
                      )
                    : t(
                        "career.history.talent_role_activity_timeline.upcoming_meeting",
                        "예정된 미팅"
                      ));

                return (
                  <li
                    className="flex items-start gap-3 py-3 first:pt-0"
                    key={entry.id}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-muted">
                      <CalendarClock className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                          {meetingTitle}
                        </div>
                        {meetingDateTime ? (
                          <div className="mt-0.5 text-[13px] leading-5 text-neutral-muted">
                            {meetingDateTime}
                          </div>
                        ) : null}
                      </div>
                      {confirmedTime ? (
                        <div className="ml-auto shrink-0 text-right text-[12px] leading-5 text-neutral-soft">
                          {confirmedTime}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              }

              const activityTime = formatCareerActivityRelativeTime(
                entry.activity.createdAt,
                locale,
                new Date(renderedAt)
              );
              const isStageChange =
                entry.activity.kind === "saved_stage_changed";
              const isMemo = entry.activity.kind === "memo";
              const previousStage = entry.activity.previousStage
                ? getSavedOpportunityStatusLabel(
                    entry.activity.previousStage,
                    t
                  )
                : null;
              const savedStage = entry.activity.savedStage
                ? getSavedOpportunityStatusLabel(entry.activity.savedStage, t)
                : null;
              const activityLabel = isStageChange
                ? t(
                    "career.history.talent_role_activity_timeline.stage_changed",
                    "단계 변경"
                  )
                : isMemo
                  ? t(
                      "career.history.talent_role_activity_timeline.memo",
                      "메모"
                    )
                  : t(
                      "career.history.talent_role_activity_timeline.activity",
                      "활동"
                    );

              return (
                <li
                  className={cn(
                    "flex gap-3 py-3 first:pt-0",
                    isMemo ? "items-start" : "items-center"
                  )}
                  key={entry.id}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-muted",
                      isMemo && "mt-0.5"
                    )}
                  >
                    {isStageChange ? (
                      <ArrowRight className="h-3.5 w-3.5" />
                    ) : (
                      <StickyNote className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[13px] font-medium leading-5 text-neutral-primary">
                        {activityLabel}
                      </span>
                      {isStageChange && savedStage ? (
                        <span className="flex min-w-0 items-center gap-1 text-[13px] leading-5 text-neutral-muted">
                          {previousStage ? (
                            <span className="truncate">{previousStage}</span>
                          ) : null}
                          {previousStage ? (
                            <ArrowRight className="h-3 w-3 shrink-0" />
                          ) : null}
                          <span className="truncate">{savedStage}</span>
                        </span>
                      ) : !isMemo && entry.activity.content ? (
                        <span className="min-w-0 truncate text-[13px] leading-5 text-neutral-muted">
                          {entry.activity.content}
                        </span>
                      ) : null}
                      {activityTime ? (
                        <span className="ml-auto shrink-0 text-right text-[12px] leading-5 text-neutral-soft">
                          {activityTime}
                        </span>
                      ) : null}
                    </div>
                    {isMemo && entry.activity.content ? (
                      <div className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-neutral-primary">
                        {entry.activity.content}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
