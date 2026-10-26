import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { formatOrgMeetingAvailabilitySummary } from "@/i18n/org/meetingSummary";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { CalendarClock, Check, LoaderCircle, Mail, Users } from "lucide-react";
import { useRouter } from "next/router";
import { FormEvent, useMemo, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  usePrepareOrgMeetingInvitation,
  useRetryOrgMeetingCalendar,
  useOrgMeetingSchedule,
  useSendOrgMeetingInvitation,
  useUpdateOrgMeetingSchedule,
} from "@/hooks/org/useOrgMeetingSchedules";
import type { MeetingInvitationPreviewResponse } from "@/lib/meetings/invitation";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { MeetingScheduleDetail } from "@/lib/meetings/scheduleDraft";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

type MessageVisibility = "both" | "candidate" | "internal";

type MeetingScheduleEditorDraft = {
  additionalMessage: string;
  attendeeEmails: string[];
  durationMinutes: number;
  messageVisibility: MessageVisibility;
  scheduleId: string;
  sourceVersion: number;
  title: string;
};

function createEditorDraft(
  schedule: MeetingScheduleDetail
): MeetingScheduleEditorDraft {
  return {
    additionalMessage: schedule.round.additionalMessage?.sourceText ?? "",
    attendeeEmails: schedule.config.companyAttendees.map(
      (attendee) => attendee.email
    ),
    durationMinutes: schedule.config.durationMinutes,
    messageVisibility: schedule.round.additionalMessage?.visibility ?? "both",
    scheduleId: schedule.scheduleId,
    sourceVersion: schedule.version,
    title: schedule.config.title,
  };
}

function formatScheduleTime(
  value: string,
  timezone: string,
  locale: "ko" | "en"
) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function deliveryStatusCopy(schedule: MeetingScheduleDetail) {
  const delivery = schedule.round.delivery;
  if (delivery?.status === "sent") {
    return "후보자에게 일정 선택 이메일을 보냈어요. 후보자가 가능한 시간을 제출하면 그중 하나로 바로 확정돼요.";
  }
  if (delivery?.status === "failed" || delivery?.status === "cancelled") {
    return "일정 선택 이메일을 보내지 못했어요. 후보자에게 전달되지 않았으며 Harper 팀이 발송 상태를 확인해야 해요.";
  }
  if (delivery?.status === "processing") {
    return "후보자에게 일정 선택 이메일을 전달하고 있어요. 아직 발송이 끝난 것은 아니에요.";
  }
  return "후보자에게 보낼 일정 선택 이메일을 준비 중이에요. 아직 발송이 끝난 것은 아니에요.";
}

export function OrgMeetingScheduleDialog({
  onRequestClose,
  open,
  scheduleId,
}: {
  onRequestClose: () => void;
  open: boolean;
  scheduleId: string;
}) {
  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const { bootstrap, permissions, workspace } = useOrgWorkspace();
  const scheduleQuery = useOrgMeetingSchedule({
    enabled: open,
    scheduleId,
    workspaceId: workspace.workspaceId,
  });
  const updateSchedule = useUpdateOrgMeetingSchedule({
    scheduleId,
    workspaceId: workspace.workspaceId,
  });
  const prepareInvitation = usePrepareOrgMeetingInvitation({
    scheduleId,
    workspaceId: workspace.workspaceId,
  });
  const sendInvitation = useSendOrgMeetingInvitation({
    scheduleId,
    workspaceId: workspace.workspaceId,
  });
  const retryCalendar = useRetryOrgMeetingCalendar({
    scheduleId,
    workspaceId: workspace.workspaceId,
  });
  const schedule = scheduleQuery.data?.schedule ?? null;
  const [editorDraft, setEditorDraft] =
    useState<MeetingScheduleEditorDraft | null>(null);
  const [error, setError] = useState("");
  const [discardAction, setDiscardAction] = useState<
    "close" | "availability" | null
  >(null);
  const [invitationPreview, setInvitationPreview] =
    useState<MeetingInvitationPreviewResponse | null>(null);
  const [invitationSubject, setInvitationSubject] = useState("");
  const [invitationBody, setInvitationBody] = useState("");
  const draft =
    schedule &&
    editorDraft?.scheduleId === schedule.scheduleId &&
    editorDraft.sourceVersion === schedule.version
      ? editorDraft
      : schedule
        ? createEditorDraft(schedule)
        : null;
  const updateEditorDraft = (
    update: Partial<
      Pick<
        MeetingScheduleEditorDraft,
        | "additionalMessage"
        | "attendeeEmails"
        | "durationMinutes"
        | "messageVisibility"
        | "title"
      >
    >
  ) => {
    if (!schedule) return;
    setEditorDraft((current) => {
      const base =
        current?.scheduleId === schedule.scheduleId &&
        current.sourceVersion === schedule.version
          ? current
          : createEditorDraft(schedule);
      return { ...base, ...update };
    });
  };

  const members = useMemo(
    () =>
      bootstrap.members.flatMap((member) => {
        const email = member.email?.trim().toLowerCase();
        return email
          ? [
              {
                email,
                name: member.name?.trim() || email.split("@")[0],
                userId: member.userId,
              },
            ]
          : [];
      }),
    [bootstrap.members]
  );
  const organizerEmail = schedule?.config.organizer.email ?? "";
  const isDirty = Boolean(
    schedule &&
    draft &&
    (draft.title.trim() !== schedule.config.title ||
      draft.durationMinutes !== schedule.config.durationMinutes ||
      draft.additionalMessage.trim() !==
        (schedule.round.additionalMessage?.sourceText ?? "") ||
      draft.messageVisibility !==
        (schedule.round.additionalMessage?.visibility ?? "both") ||
      [...draft.attendeeEmails].sort().join("|") !==
        schedule.config.companyAttendees
          .map((attendee) => attendee.email)
          .sort()
          .join("|"))
  );
  const isEditable = schedule?.status === "preparing";
  const isBusy =
    updateSchedule.isPending ||
    prepareInvitation.isPending ||
    sendInvitation.isPending ||
    retryCalendar.isPending;

  const toggleAttendee = (email: string) => {
    if (email === organizerEmail || !draft) return;
    updateEditorDraft({
      attendeeEmails: draft.attendeeEmails.includes(email)
        ? draft.attendeeEmails.filter((item) => item !== email)
        : [...draft.attendeeEmails, email],
    });
    setError("");
  };

  const closeWithoutSaving = () => {
    setEditorDraft(null);
    setInvitationPreview(null);
    setInvitationSubject("");
    setInvitationBody("");
    setError("");
    onRequestClose();
  };

  const handleClose = () => {
    if (isBusy) return;
    if (isDirty) {
      setDiscardAction("close");
      return;
    }
    closeWithoutSaving();
  };

  const handlePrepareInvitation = async () => {
    if (!schedule || isDirty) return;
    setError("");
    try {
      const preview = await prepareInvitation.mutateAsync();
      setInvitationPreview(preview);
      setInvitationSubject(preview.email.subject);
      setInvitationBody(preview.email.body);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : c(
              "후보자에게 보낼 메일을 준비하지 못했어요.",
              "Failed to prepare email for candidate."
            )
      );
    }
  };

  const handleSendInvitation = async () => {
    if (!schedule || !invitationSubject.trim() || !invitationBody.trim()) {
      setError(
        c(
          "후보자에게 보낼 메일 제목과 본문을 확인해 주세요.",
          "Review the email you'll send to the candidate."
        )
      );
      return;
    }
    setError("");
    try {
      await sendInvitation.mutateAsync({
        body: invitationBody.trim(),
        candidateMessage: invitationPreview?.email.candidateMessage ?? null,
        expectedVersion: schedule.version,
        subject: invitationSubject.trim(),
      });
      setInvitationPreview(null);
      setInvitationSubject("");
      setInvitationBody("");
      addToast({
        message: c(
          "일정 요청 이메일 전달을 시작했어요. 아직 발송 완료는 아니에요.",
          "Sending the scheduling email. Delivery hasn't been confirmed yet."
        ),
        variant: "success",
      });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : c(
              "일정 요청 전달을 시작하지 못했어요.",
              "We couldn't send the scheduling request. Try again."
            )
      );
    }
  };

  const handleRetryCalendar = async () => {
    try {
      const result = await retryCalendar.mutateAsync();
      addToast({
        message:
          result.calendar.status === "created"
            ? c(
                "Calendar 초대와 Google Meet 링크를 만들었어요.",
                "Created calendar invite and Google Meet link."
              )
            : result.calendar.status === "created_without_meet"
              ? c(
                  "Calendar 초대는 보냈지만 Google Meet 링크는 만들지 못했어요.",
                  "Sent calendar invite but failed to create Google Meet link."
                )
              : c(
                  "Calendar 초대 전달 상태를 다시 확인하고 있어요.",
                  "Rechecking calendar invite delivery status."
                ),
        variant: result.calendar.status === "created" ? "success" : "default",
      });
    } catch (retryError) {
      addToast({
        message:
          retryError instanceof Error
            ? retryError.message
            : c(
                "Calendar 초대를 다시 만들지 못했어요.",
                "Failed to recreate calendar invite."
              ),
        variant: "error",
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!schedule || !draft || !draft.title.trim()) {
      setError(c("인터뷰 제목을 입력해 주세요.", "Enter interview title"));
      return;
    }
    setError("");
    try {
      await updateSchedule.mutateAsync({
        additionalMessage: draft.additionalMessage.trim() || null,
        additionalMessageVisibility: draft.messageVisibility,
        attendeeEmails: draft.attendeeEmails,
        durationMinutes: draft.durationMinutes,
        expectedVersion: schedule.version,
        title: draft.title.trim(),
      });
      setEditorDraft(null);
      addToast({
        message: c(
          "변경한 미팅 정보로 준비해두었어요.",
          "Email draft updated with the new meeting details."
        ),
        variant: "success",
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : c(
              "미팅 정보를 저장하지 못했어요.",
              "Failed to save meeting details."
            )
      );
    }
  };

  const openAvailabilityWithoutSaving = () => {
    setEditorDraft(null);
    setError("");
    void router.push({
      pathname: "/org/settings",
      query: {
        dialog: "interview-availability",
        orgId: workspace.workspaceId,
        returnScheduleId: scheduleId,
      },
    });
  };

  const openAvailability = () => {
    if (isBusy) return;
    if (isDirty) {
      setDiscardAction("availability");
      return;
    }
    openAvailabilityWithoutSaving();
  };

  return (
    <>
      <TalentCareerModal
        bodyClassName="max-h-[calc(100dvh-188px)] overflow-y-auto bg-bg-floating px-5 py-5 sm:px-6"
        closeOnBackdrop={!isBusy}
        description={
          schedule?.status === "confirmed"
            ? c(
                "후보자가 제출한 가능 시간 중 하나로 확정된 일정입니다.",
                "The interview is confirmed for a time the candidate selected."
              )
            : schedule?.status === "awaiting_talent"
              ? c(
                  "후보자에게 가능한 시간을 요청했고 답변을 기다리고 있어요.",
                  "We've asked the candidate to choose a time and are waiting for their reply."
                )
              : c(
                  "후보자에게 보낼 일정과 이메일을 확인해 주세요. 아직 후보자에게는 아무것도 보내지 않았어요.",
                  "Review the schedule and email for the candidate. Nothing has been sent yet."
                )
        }
        footer={
          schedule ? (
            <div className="flex items-center justify-end gap-2">
              {!invitationPreview ? (
                <MuteButton
                  disabled={isBusy}
                  onClick={handleClose}
                  size="md"
                  type="button"
                  variant="default"
                >
                  {c("닫기", "Close")}
                </MuteButton>
              ) : null}
              {isEditable && invitationPreview ? (
                <>
                  <MuteButton
                    disabled={isBusy}
                    onClick={() => {
                      setInvitationPreview(null);
                      setError("");
                    }}
                    size="md"
                    type="button"
                    variant="default"
                  >
                    {c("돌아가기", "Back")}
                  </MuteButton>
                  <MuteButton
                    disabled={
                      isBusy ||
                      !permissions.canManageCandidates ||
                      !invitationSubject.trim() ||
                      !invitationBody.trim()
                    }
                    onClick={() => void handleSendInvitation()}
                    size="md"
                    type="button"
                    variant="positive"
                  >
                    {sendInvitation.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {c("일정 요청 이메일 보내기", "Send scheduling email")}
                  </MuteButton>
                </>
              ) : isEditable ? (
                <MuteButton
                  disabled={isBusy || !permissions.canManageCandidates}
                  form={isDirty ? "meeting-schedule-draft-form" : undefined}
                  onClick={
                    isDirty ? undefined : () => void handlePrepareInvitation()
                  }
                  size="md"
                  type={isDirty ? "submit" : "button"}
                  variant="positive"
                >
                  {updateSchedule.isPending || prepareInvitation.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {isDirty
                    ? c("변경사항 저장하기", "Save changes")
                    : c(
                        "후보자에게 보낼 메일 준비하기",
                        "Prepare email for candidate"
                      )}
                </MuteButton>
              ) : null}
            </div>
          ) : null
        }
        footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
        headerClassName="bg-bg-floating px-5 py-4 sm:px-6"
        mobileBottomSheet
        onClose={() => {
          if (!isBusy) handleClose();
        }}
        open={open}
        panelClassName="max-w-2xl border-neutral-1000-a05 bg-bg-floating"
        showCloseButton={!isBusy}
        title={c("인터뷰 일정 요청", "Interview scheduling request")}
      >
        {scheduleQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
            <Skeleton className="h-28" />
          </div>
        ) : scheduleQuery.error ? (
          <div className="rounded-lg bg-bg-weak p-4">
            <p className="text-[13px] leading-5 text-critical">
              {localizedOrgErrorMessage(
                scheduleQuery.error,
                locale,
                c(
                  "일정 요청을 불러오지 못했어요.",
                  "Failed to load schedule request."
                )
              )}
            </p>
            <MuteButton
              className="mt-3"
              onClick={() => void scheduleQuery.refetch()}
              size="sm"
              variant="default"
            >
              {c("다시 불러오기", "Reload")}
            </MuteButton>
          </div>
        ) : schedule && invitationPreview ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg bg-bg-weak p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("후보자", "Candidate")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.candidate.name}
                </div>
                {schedule.candidate.email ? (
                  <div className="mt-0.5 text-[11px] text-neutral-soft">
                    {schedule.candidate.email}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("Role", "Role")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.role.name}
                </div>
              </div>
            </div>

            <section className="rounded-lg border border-neutral-1000-a05 p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                <CalendarClock className="size-4 text-neutral-muted" />
                {c("후보자에게 보여줄 시간", "Available times for the candidate")}
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
                {c(
                  "{count}개의 시간을 제안해요 · {firstTime}부터 · {timezone}",
                  invitationPreview.slotSummary.slotCount === 1
                    ? "1 available time · {firstTime} · {timezone}"
                    : "{count} available times · starting {firstTime} · {timezone}",
                  {
                    count: invitationPreview.slotSummary.slotCount,
                    firstTime: formatScheduleTime(
                      invitationPreview.slotSummary.firstSlotAt,
                      invitationPreview.slotSummary.timezone,
                      locale
                    ),
                    timezone: invitationPreview.slotSummary.timezone,
                  }
                )}
              </p>
            </section>

            <section className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                  <Mail className="size-4 text-neutral-muted" />
                  {c("후보자에게 보낼 이메일", "Email to candidate")}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {c(
                    "후보자의 언어에 맞춰 작성했어요. 제목과 본문을 직접 고칠 수 있어요. 일정 선택 링크는 발송할 때 생성돼요.",
                    "This draft uses the candidate's language. You can edit the subject and message. A scheduling link will be added when you send it."
                  )}
                </p>
              </div>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("제목", "Subject")}
                </span>
                <Input
                  className="mt-1.5"
                  disabled={isBusy}
                  maxLength={180}
                  onChange={(event) => setInvitationSubject(event.target.value)}
                  value={invitationSubject}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("본문", "Body")}
                </span>
                <Textarea
                  className="mt-1.5 min-h-64 text-[13px] leading-6"
                  disabled={isBusy}
                  maxLength={5000}
                  onChange={(event) => setInvitationBody(event.target.value)}
                  value={invitationBody}
                />
              </label>
              <p className="rounded-lg bg-bg-weak p-3 text-[12px] leading-5 text-neutral-muted">
                {c(
                  "이메일을 보내면 후보자가 가능한 시간을 고를 수 있어요. 후보자가 시간을 제출해 확정되면 담당자의 Google Calendar에서 양측 초대와 Google Meet 링크를 만들어요.",
                  "The candidate can use the email link to choose a time. Once that time is confirmed, Harper creates the calendar event and Google Meet link in the organizer's Google Calendar."
                )}
              </p>
            </section>
            {error ? (
              <p className="text-[12px] leading-5 text-critical" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : schedule?.status === "confirmed" ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-positive-faded p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-positive">
                <Check className="size-4" />
                {c("미팅 시간이 확정됐어요", "Meeting time confirmed")}
              </div>
              {schedule.confirmedStartAt ? (
                <p className="mt-2 text-[16px] font-medium text-neutral-primary">
                  {formatScheduleTime(
                    schedule.confirmedStartAt,
                    schedule.round.timezone ??
                      schedule.availability?.timezone ??
                      "Asia/Seoul",
                    locale
                  )}
                </p>
              ) : null}
              <p className="mt-1 text-[12px] text-neutral-muted">
                {schedule.config.durationMinutes}
                {c("분 · ", "min · ")}
                {schedule.config.title}
              </p>
            </div>
            {schedule.round.selection?.companyMessage ? (
              <p className="text-[13px] leading-6 text-neutral-primary">
                {schedule.round.selection.companyMessage}
              </p>
            ) : null}
            {schedule.round.candidateOptions.length > 1 ? (
              <section>
                <div className="text-[12px] font-medium text-neutral-primary">
                  {c("후보자가 제출한 시간", "Time selected by the candidate")}
                </div>
                <div className="mt-2 space-y-1.5">
                  {schedule.round.candidateOptions.map((option) => (
                    <div
                      className="rounded-md bg-bg-weak px-3 py-2 text-[12px] text-neutral-muted"
                      key={option.startAt}
                    >
                      {formatScheduleTime(
                        option.startAt,
                        schedule.round.timezone ??
                          schedule.availability?.timezone ??
                          "Asia/Seoul",
                        locale
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {schedule.calendar?.status === "created" ? (
              <div className="rounded-lg bg-positive-faded p-3 text-[12px] leading-5 text-neutral-muted">
                {c(
                  "후보자와 회사 참석자에게 Calendar 초대를 보냈고 Google Meet 링크를 만들었어요.",
                  "Sent calendar invites to candidate and company attendees and created a Google Meet link."
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  {schedule.calendar.meetUrl ? (
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.meetUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {c("Google Meet 열기", "Open Google Meet")}
                    </a>
                  ) : null}
                  {schedule.calendar.calendarUrl ? (
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.calendarUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {c("Calendar 일정 열기", "Open calendar event")}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : schedule.calendar?.status === "created_without_meet" ? (
              <div className="rounded-lg bg-info-faded p-3 text-[12px] leading-5 text-neutral-muted">
                {c(
                  "Calendar 초대는 보냈지만 연결된 Google 계정에서 Meet 링크를 만들지 못했어요. Calendar 일정에서 화상회의 링크를 직접 추가해 주세요.",
                  "Calendar invite sent but couldn't create a Meet link on the connected Google account. Add a video meeting link directly in the calendar event."
                )}
                {schedule.calendar.calendarUrl ? (
                  <div className="mt-2">
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.calendarUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {c("Calendar 일정 열기", "Open calendar event")}
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg bg-bg-weak p-3 text-[12px] leading-5 text-neutral-muted">
                <p>
                  {schedule.calendar?.status === "creating"
                    ? c(
                        "미팅 시간은 확정되어 있고, Calendar 초대와 Google Meet 링크를 만들고 있어요.",
                        "Meeting time confirmed. Creating calendar invite and Google Meet link."
                      )
                    : c(
                        "미팅 시간은 그대로 확정되어 있어요. {p0}",
                        "The meeting time remains confirmed. {p0}",
                        {
                          p0:
                            schedule.calendar?.error ??
                            c(
                              "Calendar 초대와 Google Meet 링크를 아직 만들지 못했어요.",
                              "Calendar invite and Google Meet link not created."
                            ),
                        }
                      )}
                </p>
                {permissions.canManageCandidates ? (
                  <MuteButton
                    className="mt-2"
                    disabled={retryCalendar.isPending}
                    onClick={() => void handleRetryCalendar()}
                    size="sm"
                  >
                    {retryCalendar.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {schedule.calendar?.status === "creating"
                      ? c("전달 상태 다시 확인", "Recheck delivery status")
                      : c(
                          "Calendar 초대 다시 만들기",
                          "Recreate calendar invite"
                        )}
                  </MuteButton>
                ) : null}
              </div>
            )}
          </div>
        ) : schedule?.status === "awaiting_talent" ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-bg-weak p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                <Mail className="size-4 text-neutral-muted" />
                {c("후보자 답변 대기 중", "Awaiting candidate response")}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
                {sourceT(deliveryStatusCopy(schedule))}
              </p>
              {schedule.round.expiresAt ? (
                <p className="mt-2 text-[11px] text-neutral-soft">
                  {c("링크 만료 ·", "Link expired ·")}{" "}
                  {formatScheduleTime(
                    schedule.round.expiresAt,
                    schedule.round.timezone ??
                      schedule.availability?.timezone ??
                      "Asia/Seoul",
                    locale
                  )}
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 rounded-lg border border-neutral-1000-a05 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("후보자", "Candidate")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.candidate.name}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("미팅", "Meeting")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.config.title} · {schedule.config.durationMinutes}
                  {c("분", "min")}
                </div>
              </div>
            </div>
          </div>
        ) : schedule && draft ? (
          <form
            className="space-y-5"
            id="meeting-schedule-draft-form"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-3 rounded-lg bg-bg-weak p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("후보자", "Candidate")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.candidate.name}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {c("Role", "Role")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.role.name}
                </div>
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                    <CalendarClock className="size-4 text-neutral-muted" />
                    {c("제안할 가능 시간", "Times to offer the candidate")}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                    {schedule.availability
                      ? c("{p0} · 향후 {p1}주", "{p0} · next {p1} weeks", {
                          p0: formatOrgMeetingAvailabilitySummary(
                            schedule.availability,
                            c
                          ),
                          p1: schedule.config.offerWindowDays / 7,
                        })
                      : c(
                          "{p0}님의 가능 시간이 아직 설정되지 않았어요.",
                          "{p0} hasn't set availability yet.",
                          {
                            p0: schedule.config.organizer.name,
                          }
                        )}
                  </p>
                </div>
                <MuteButton
                  onClick={openAvailability}
                  size="sm"
                  type="button"
                  variant="default"
                >
                  {c("가능 시간 열기", "Open availability")}
                </MuteButton>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("인터뷰 제목", "Interview title")}
                </span>
                <Input
                  className="mt-1.5 h-10 text-[13px]"
                  disabled={updateSchedule.isPending}
                  maxLength={200}
                  onChange={(event) =>
                    updateEditorDraft({ title: event.target.value })
                  }
                  value={draft.title}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("길이", "Length")}
                </span>
                <Select
                  disabled={updateSchedule.isPending}
                  onValueChange={(value) =>
                    updateEditorDraft({ durationMinutes: Number(value) })
                  }
                  value={String(draft.durationMinutes)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue>
                      {draft.durationMinutes}
                      {c("분", "min")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {DURATION_OPTIONS.map((duration) => (
                      <SelectItem key={duration} value={String(duration)}>
                        {duration}
                        {c("분", "min")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <section>
              <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-primary">
                <Users className="size-4 text-neutral-muted" />
                {c("참석자", "Attendees")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((member) => {
                  const selected = draft.attendeeEmails.includes(member.email);
                  const organizer = member.email === organizerEmail;
                  return (
                    <MuteButton
                      aria-pressed={selected}
                      className={cn(
                        "h-8 rounded-full",
                        selected &&
                          "border-primary/25 bg-primary-faded text-primary"
                      )}
                      disabled={organizer || updateSchedule.isPending}
                      key={member.userId}
                      onClick={() => toggleAttendee(member.email)}
                      size="sm"
                      type="button"
                      variant="default"
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                      {member.name}
                      {organizer ? (
                        <span className="text-[11px] text-neutral-soft">
                          {c("담당자", "Organizer")}
                        </span>
                      ) : null}
                    </MuteButton>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("추가 메시지", "Additional message")}{" "}
                  <span className="font-normal text-neutral-soft">
                    {c("· 선택", "· optional")}
                  </span>
                </span>
                <Textarea
                  className="mt-1.5 min-h-24 px-3 py-2 text-[13px] leading-5"
                  disabled={updateSchedule.isPending}
                  maxLength={2000}
                  onChange={(event) =>
                    updateEditorDraft({ additionalMessage: event.target.value })
                  }
                  placeholder={c(
                    "예: 가능하면 가장 빠른 시간으로 부탁드려요.",
                    "e.g., prefer the earliest possible time."
                  )}
                  value={draft.additionalMessage}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {c("공개 범위", "Visibility")}
                </span>
                <Select
                  disabled={
                    !draft.additionalMessage.trim() || updateSchedule.isPending
                  }
                  onValueChange={(value) =>
                    updateEditorDraft({
                      messageVisibility: value as MessageVisibility,
                    })
                  }
                  value={draft.messageVisibility}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="both">
                      {c("회사와 후보자", "Company and candidate")}
                    </SelectItem>
                    <SelectItem value="candidate">
                      {c("후보자에게만", "Candidate only")}
                    </SelectItem>
                    <SelectItem value="internal">
                      {c("회사 내부만", "Your team only")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </section>

            {error ? (
              <p className="text-[12px] leading-5 text-critical" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        ) : null}
      </TalentCareerModal>
      <TalentCareerModal
        open={discardAction !== null}
        onClose={() => setDiscardAction(null)}
        mobileBottomSheet
        panelClassName="max-w-sm"
        title={
          discardAction === "availability"
            ? c(
                "가능 시간을 열면 아직 적용하지 않은 변경은 사라져요. 계속할까요?",
                "Opening availability will discard unapplied changes. Continue?"
              )
            : c(
                "저장하지 않은 변경 내용이 있어요. 이대로 닫을까요?",
                "There are unsaved changes. Close anyway?"
              )
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton onClick={() => setDiscardAction(null)}>
              {c("계속 편집", "Continue editing")}
            </MuteButton>
            <MuteButton
              disabled={isBusy}
              variant="warn"
              onClick={() => {
                if (isBusy) return;
                const action = discardAction;
                setDiscardAction(null);
                if (action === "availability") openAvailabilityWithoutSaving();
                else if (action === "close") closeWithoutSaving();
              }}
            >
              {discardAction === "availability"
                ? c("가능 시간 열기", "Open availability")
                : c("저장하지 않고 닫기", "Close without saving")}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>
    </>
  );
}
