import {
  useOrgLocale,
  useOrgSourceT,
  useOrgT,
} from "@/i18n/org/OrgLocaleProvider";
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
  const t = useOrgT();
  const sourceT = useOrgSourceT();
  const { locale } = useOrgLocale();
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
          : t(
              "meetings.OrgMeetingScheduleDialog.3ef97382",
              "후보자에게 보낼 메일을 준비하지 못했어요."
            )
      );
    }
  };

  const handleSendInvitation = async () => {
    if (!schedule || !invitationSubject.trim() || !invitationBody.trim()) {
      setError(
        t(
          "meetings.OrgMeetingScheduleDialog.5aadb613",
          "후보자에게 보낼 메일 제목과 본문을 확인해 주세요."
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
        message: t(
          "meetings.OrgMeetingScheduleDialog.7d8911ae",
          "일정 요청 이메일 전달을 시작했어요. 아직 발송 완료는 아니에요."
        ),
        variant: "success",
      });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : t(
              "meetings.OrgMeetingScheduleDialog.d4259ebb",
              "일정 요청 전달을 시작하지 못했어요."
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
            ? t(
                "meetings.OrgMeetingScheduleDialog.426e8fc1",
                "Calendar 초대와 Google Meet 링크를 만들었어요."
              )
            : result.calendar.status === "created_without_meet"
              ? t(
                  "meetings.OrgMeetingScheduleDialog.fe036c5b",
                  "Calendar 초대는 보냈지만 Google Meet 링크는 만들지 못했어요."
                )
              : t(
                  "meetings.OrgMeetingScheduleDialog.c697ab23",
                  "Calendar 초대 전달 상태를 다시 확인하고 있어요."
                ),
        variant: result.calendar.status === "created" ? "success" : "default",
      });
    } catch (retryError) {
      addToast({
        message:
          retryError instanceof Error
            ? retryError.message
            : t(
                "meetings.OrgMeetingScheduleDialog.cf4c2819",
                "Calendar 초대를 다시 만들지 못했어요."
              ),
        variant: "error",
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!schedule || !draft || !draft.title.trim()) {
      setError(
        t(
          "meetings.OrgMeetingScheduleDialog.54056198",
          "인터뷰 제목을 입력해 주세요."
        )
      );
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
        message: t(
          "meetings.OrgMeetingScheduleDialog.fa25f65b",
          "변경한 미팅 정보로 준비해두었어요."
        ),
        variant: "success",
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t(
              "meetings.OrgMeetingScheduleDialog.c06754b0",
              "미팅 정보를 저장하지 못했어요."
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
            ? t(
                "meetings.OrgMeetingScheduleDialog.0a7d2554",
                "후보자가 제출한 가능 시간 중 하나로 확정된 일정입니다."
              )
            : schedule?.status === "awaiting_talent"
              ? t(
                  "meetings.OrgMeetingScheduleDialog.bab473f6",
                  "후보자에게 가능한 시간을 요청했고 답변을 기다리고 있어요."
                )
              : t(
                  "meetings.OrgMeetingScheduleDialog.dc182940",
                  "후보자에게 보낼 일정과 이메일을 확인해 주세요. 아직 후보자에게는 아무것도 보내지 않았어요."
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
                  {t("meetings.OrgMeetingScheduleDialog.89e435b3", "닫기")}
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
                    {t(
                      "meetings.OrgMeetingScheduleDialog.b0612e1d",
                      "돌아가기"
                    )}
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
                    {t(
                      "meetings.OrgMeetingScheduleDialog.9a3bf75c",
                      "일정 요청 이메일 보내기"
                    )}
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
                    ? t(
                        "meetings.OrgMeetingScheduleDialog.b5e3cc85",
                        "변경사항 저장하기"
                      )
                    : t(
                        "meetings.OrgMeetingScheduleDialog.36a5735c",
                        "후보자에게 보낼 메일 준비하기"
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
        title={t(
          "meetings.OrgMeetingScheduleDialog.c738ea8a",
          "인터뷰 일정 요청"
        )}
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
                t(
                  "meetings.OrgMeetingScheduleDialog.e6cba348",
                  "일정 요청을 불러오지 못했어요."
                )
              )}
            </p>
            <MuteButton
              className="mt-3"
              onClick={() => void scheduleQuery.refetch()}
              size="sm"
              variant="default"
            >
              {t("meetings.OrgMeetingScheduleDialog.5137bfdc", "다시 불러오기")}
            </MuteButton>
          </div>
        ) : schedule && invitationPreview ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg bg-bg-weak p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {t("meetings.OrgMeetingScheduleDialog.bae5b97e", "후보자")}
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
                  {t("meetings.OrgMeetingScheduleDialog.3de052c6", "Role")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.role.name}
                </div>
              </div>
            </div>

            <section className="rounded-lg border border-neutral-1000-a05 p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                <CalendarClock className="size-4 text-neutral-muted" />
                {t(
                  "meetings.OrgMeetingScheduleDialog.82424454",
                  "후보자에게 보여줄 시간"
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
                {invitationPreview.slotSummary.slotCount}
                {t(
                  "meetings.OrgMeetingScheduleDialog.bc52e602",
                  "개의 시간을 제안해요 ·"
                )}{" "}
                {formatScheduleTime(
                  invitationPreview.slotSummary.firstSlotAt,
                  invitationPreview.slotSummary.timezone,
                  locale
                )}
                {t("meetings.OrgMeetingScheduleDialog.c649491e", "부터 ·")}
                {invitationPreview.slotSummary.timezone}
              </p>
            </section>

            <section className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                  <Mail className="size-4 text-neutral-muted" />
                  {t(
                    "meetings.OrgMeetingScheduleDialog.1b046400",
                    "후보자에게 보낼 이메일"
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {t(
                    "meetings.OrgMeetingScheduleDialog.59b68c60",
                    "후보자의 언어에 맞춰 작성했어요. 제목과 본문을 직접 고칠 수 있어요. 일정 선택 링크는 발송할 때 생성돼요."
                  )}
                </p>
              </div>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {t("meetings.OrgMeetingScheduleDialog.bf6ccadb", "제목")}
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
                  {t("meetings.OrgMeetingScheduleDialog.c8d337b1", "본문")}
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
                {t(
                  "meetings.OrgMeetingScheduleDialog.54a2d2da",
                  "이메일을 보내면 후보자가 가능한 시간을 고를 수 있어요. 후보자가 시간을 제출해 확정되면 담당자의 Google Calendar에서 양측 초대와 Google Meet 링크를 만들어요."
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
                {t(
                  "meetings.OrgMeetingScheduleDialog.5d5c76d2",
                  "미팅 시간이 확정됐어요"
                )}
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
                {t("meetings.OrgMeetingScheduleDialog.b510ca9f", "분 · ")}
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
                  {t(
                    "meetings.OrgMeetingScheduleDialog.30dfc264",
                    "후보자가 제출한 시간"
                  )}
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
                {t(
                  "meetings.OrgMeetingScheduleDialog.aeba19db",
                  "후보자와 회사 참석자에게 Calendar 초대를 보냈고 Google Meet 링크를 만들었어요."
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  {schedule.calendar.meetUrl ? (
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.meetUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t(
                        "meetings.OrgMeetingScheduleDialog.ea527744",
                        "Google Meet 열기"
                      )}
                    </a>
                  ) : null}
                  {schedule.calendar.calendarUrl ? (
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.calendarUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t(
                        "meetings.OrgMeetingScheduleDialog.e7005a94",
                        "Calendar 일정 열기"
                      )}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : schedule.calendar?.status === "created_without_meet" ? (
              <div className="rounded-lg bg-info-faded p-3 text-[12px] leading-5 text-neutral-muted">
                {t(
                  "meetings.OrgMeetingScheduleDialog.2e255651",
                  "Calendar 초대는 보냈지만 연결된 Google 계정에서 Meet 링크를 만들지 못했어요. Calendar 일정에서 화상회의 링크를 직접 추가해 주세요."
                )}
                {schedule.calendar.calendarUrl ? (
                  <div className="mt-2">
                    <a
                      className="text-link underline underline-offset-2"
                      href={schedule.calendar.calendarUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t(
                        "meetings.OrgMeetingScheduleDialog.e7005a94",
                        "Calendar 일정 열기"
                      )}
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg bg-bg-weak p-3 text-[12px] leading-5 text-neutral-muted">
                <p>
                  {schedule.calendar?.status === "creating"
                    ? t(
                        "meetings.OrgMeetingScheduleDialog.42b86f9b",
                        "미팅 시간은 확정되어 있고, Calendar 초대와 Google Meet 링크를 만들고 있어요."
                      )
                    : t(
                        "meetings.OrgMeetingScheduleDialog.f4d45ba8",
                        "미팅 시간은 그대로 확정되어 있어요. {p0}",
                        {
                          p0:
                            schedule.calendar?.error ??
                            t(
                              "meetings.OrgMeetingScheduleDialog.61665e52",
                              "Calendar 초대와 Google Meet 링크를 아직 만들지 못했어요."
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
                      ? t(
                          "meetings.OrgMeetingScheduleDialog.be617d7e",
                          "전달 상태 다시 확인"
                        )
                      : t(
                          "meetings.OrgMeetingScheduleDialog.95e59a9c",
                          "Calendar 초대 다시 만들기"
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
                {t(
                  "meetings.OrgMeetingScheduleDialog.31afca01",
                  "후보자 답변 대기 중"
                )}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
                {sourceT(deliveryStatusCopy(schedule))}
              </p>
              {schedule.round.expiresAt ? (
                <p className="mt-2 text-[11px] text-neutral-soft">
                  {t(
                    "meetings.OrgMeetingScheduleDialog.a1445753",
                    "링크 만료 ·"
                  )}{" "}
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
                  {t("meetings.OrgMeetingScheduleDialog.bae5b97e", "후보자")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.candidate.name}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {t("meetings.OrgMeetingScheduleDialog.9bf8cbe2", "미팅")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.config.title} · {schedule.config.durationMinutes}
                  {t("meetings.OrgMeetingScheduleDialog.dbb9748d", "분")}
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
                  {t("meetings.OrgMeetingScheduleDialog.bae5b97e", "후보자")}
                </div>
                <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                  {schedule.candidate.name}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-soft">
                  {t("meetings.OrgMeetingScheduleDialog.3de052c6", "Role")}
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
                    {t(
                      "meetings.OrgMeetingScheduleDialog.5a0c38be",
                      "제안할 가능 시간"
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                    {schedule.availability
                      ? t(
                          "meetings.OrgMeetingScheduleDialog.d740017d",
                          "{p0} · 향후 {p1}주",
                          {
                            p0: formatOrgMeetingAvailabilitySummary(
                              schedule.availability,
                              t
                            ),
                            p1: schedule.config.offerWindowDays / 7,
                          }
                        )
                      : t(
                          "meetings.OrgMeetingScheduleDialog.589ed8fb",
                          "{p0}님의 가능 시간이 아직 설정되지 않았어요.",
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
                  {t(
                    "meetings.OrgMeetingScheduleDialog.589b708b",
                    "가능 시간 열기"
                  )}
                </MuteButton>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {t(
                    "meetings.OrgMeetingScheduleDialog.a9f5012f",
                    "인터뷰 제목"
                  )}
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
                  {t("meetings.OrgMeetingScheduleDialog.f143e804", "길이")}
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
                      {t("meetings.OrgMeetingScheduleDialog.dbb9748d", "분")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {DURATION_OPTIONS.map((duration) => (
                      <SelectItem key={duration} value={String(duration)}>
                        {duration}
                        {t("meetings.OrgMeetingScheduleDialog.dbb9748d", "분")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <section>
              <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-primary">
                <Users className="size-4 text-neutral-muted" />
                {t("meetings.OrgMeetingScheduleDialog.3141ecfd", "참석자")}
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
                          {t(
                            "meetings.OrgMeetingScheduleDialog.a92b5c71",
                            "담당자"
                          )}
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
                  {t(
                    "meetings.OrgMeetingScheduleDialog.995af5ef",
                    "추가 메시지"
                  )}{" "}
                  <span className="font-normal text-neutral-soft">
                    {t("meetings.OrgMeetingScheduleDialog.fc8336dc", "· 선택")}
                  </span>
                </span>
                <Textarea
                  className="mt-1.5 min-h-24 px-3 py-2 text-[13px] leading-5"
                  disabled={updateSchedule.isPending}
                  maxLength={2000}
                  onChange={(event) =>
                    updateEditorDraft({ additionalMessage: event.target.value })
                  }
                  placeholder={t(
                    "meetings.OrgMeetingScheduleDialog.5d4744dd",
                    "예: 가능하면 가장 빠른 시간으로 부탁드려요."
                  )}
                  value={draft.additionalMessage}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-neutral-primary">
                  {t("meetings.OrgMeetingScheduleDialog.1743f372", "공개 범위")}
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
                      {t(
                        "meetings.OrgMeetingScheduleDialog.53111d24",
                        "회사와 후보자"
                      )}
                    </SelectItem>
                    <SelectItem value="candidate">
                      {t(
                        "meetings.OrgMeetingScheduleDialog.76d2aad1",
                        "후보자에게만"
                      )}
                    </SelectItem>
                    <SelectItem value="internal">
                      {t(
                        "meetings.OrgMeetingScheduleDialog.d1a1dda5",
                        "회사 내부만"
                      )}
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
            ? t(
                "meetings.OrgMeetingScheduleDialog.5d65b6b0",
                "가능 시간을 열면 아직 적용하지 않은 변경은 사라져요. 계속할까요?"
              )
            : t(
                "meetings.OrgMeetingScheduleDialog.ac854694",
                "저장하지 않은 변경 내용이 있어요. 이대로 닫을까요?"
              )
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <MuteButton onClick={() => setDiscardAction(null)}>
              {t(
                "meetings.OrgInterviewAvailabilityDialog.e8136d58",
                "계속 편집"
              )}
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
                ? t(
                    "meetings.OrgMeetingScheduleDialog.589b708b",
                    "가능 시간 열기"
                  )
                : t(
                    "meetings.OrgInterviewAvailabilityDialog.350f4173",
                    "저장하지 않고 닫기"
                  )}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>
    </>
  );
}
