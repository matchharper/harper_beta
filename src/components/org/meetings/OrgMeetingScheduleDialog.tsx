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
  useOrgMeetingSchedule,
  useSendOrgMeetingInvitation,
  useUpdateOrgMeetingSchedule,
} from "@/hooks/org/useOrgMeetingSchedules";
import type { MeetingInvitationPreviewResponse } from "@/lib/meetings/invitation";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { formatMeetingAvailabilitySummary } from "@/lib/meetings/availability";
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

function formatScheduleTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ko-KR", {
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
  const schedule = scheduleQuery.data?.schedule ?? null;
  const [editorDraft, setEditorDraft] =
    useState<MeetingScheduleEditorDraft | null>(null);
  const [error, setError] = useState("");
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
    sendInvitation.isPending;

  const toggleAttendee = (email: string) => {
    if (email === organizerEmail || !draft) return;
    updateEditorDraft({
      attendeeEmails: draft.attendeeEmails.includes(email)
        ? draft.attendeeEmails.filter((item) => item !== email)
        : [...draft.attendeeEmails, email],
    });
    setError("");
  };

  const handleClose = () => {
    if (
      isDirty &&
      !window.confirm("저장하지 않은 변경 내용이 있어요. 이대로 닫을까요?")
    ) {
      return;
    }
    setEditorDraft(null);
    setInvitationPreview(null);
    setInvitationSubject("");
    setInvitationBody("");
    setError("");
    onRequestClose();
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
          : "후보자에게 보낼 메일을 준비하지 못했어요."
      );
    }
  };

  const handleSendInvitation = async () => {
    if (!schedule || !invitationSubject.trim() || !invitationBody.trim()) {
      setError("후보자에게 보낼 메일 제목과 본문을 확인해 주세요.");
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
        message:
          "일정 요청 이메일 전달을 시작했어요. 아직 발송 완료는 아니에요.",
        variant: "success",
      });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "일정 요청 전달을 시작하지 못했어요."
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!schedule || !draft || !draft.title.trim()) {
      setError("인터뷰 제목을 입력해 주세요.");
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
        message: "변경한 미팅 정보로 준비해두었어요.",
        variant: "success",
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "미팅 정보를 저장하지 못했어요."
      );
    }
  };

  const openAvailability = () => {
    if (
      isDirty &&
      !window.confirm(
        "가능 시간을 열면 아직 적용하지 않은 변경은 사라져요. 계속할까요?"
      )
    ) {
      return;
    }
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

  return (
    <TalentCareerModal
      bodyClassName="max-h-[calc(100dvh-188px)] overflow-y-auto bg-bg-floating px-5 py-5 sm:px-6"
      closeOnBackdrop={!isBusy}
      description={
        schedule?.status === "confirmed"
          ? "후보자가 제출한 가능 시간 중 하나로 확정된 일정입니다."
          : schedule?.status === "awaiting_talent"
            ? "후보자에게 가능한 시간을 요청했고 답변을 기다리고 있어요."
            : "후보자에게 보낼 일정과 이메일을 확인해 주세요. 아직 후보자에게는 아무것도 보내지 않았어요."
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
                닫기
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
                  돌아가기
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
                  일정 요청 이메일 보내기
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
                  ? "변경사항 저장하기"
                  : "후보자에게 보낼 메일 준비하기"}
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
      title="인터뷰 일정 요청"
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
            {scheduleQuery.error instanceof Error
              ? scheduleQuery.error.message
              : "일정 요청을 불러오지 못했어요."}
          </p>
          <MuteButton
            className="mt-3"
            onClick={() => void scheduleQuery.refetch()}
            size="sm"
            variant="default"
          >
            다시 불러오기
          </MuteButton>
        </div>
      ) : schedule && invitationPreview ? (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg bg-bg-weak p-4 sm:grid-cols-2">
            <div>
              <div className="text-[11px] text-neutral-soft">후보자</div>
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
              <div className="text-[11px] text-neutral-soft">Role</div>
              <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                {schedule.role.name}
              </div>
            </div>
          </div>

          <section className="rounded-lg border border-neutral-1000-a05 p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
              <CalendarClock className="size-4 text-neutral-muted" />
              후보자에게 보여줄 시간
            </div>
            <p className="mt-1.5 text-[12px] leading-5 text-neutral-muted">
              {invitationPreview.slotSummary.slotCount}개의 시간을 제안해요 ·{" "}
              {formatScheduleTime(
                invitationPreview.slotSummary.firstSlotAt,
                invitationPreview.slotSummary.timezone
              )}
              부터 · {invitationPreview.slotSummary.timezone}
            </p>
          </section>

          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
                <Mail className="size-4 text-neutral-muted" />
                후보자에게 보낼 이메일
              </div>
              <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                후보자의 언어에 맞춰 작성했어요. 제목과 본문을 직접 고칠 수
                있어요. 일정 선택 링크는 발송할 때 생성돼요.
              </p>
            </div>
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-primary">
                제목
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
                본문
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
              이메일을 보내면 후보자가 가능한 시간을 고를 수 있어요. 아직 Google
              Calendar 일정이나 Meet 링크는 만들지 않아요.
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
              미팅 시간이 확정됐어요
            </div>
            {schedule.confirmedStartAt ? (
              <p className="mt-2 text-[16px] font-medium text-neutral-primary">
                {formatScheduleTime(
                  schedule.confirmedStartAt,
                  schedule.round.timezone ??
                    schedule.availability?.timezone ??
                    "Asia/Seoul"
                )}
              </p>
            ) : null}
            <p className="mt-1 text-[12px] text-neutral-muted">
              {schedule.config.durationMinutes}분 · {schedule.config.title}
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
                후보자가 제출한 시간
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
                        "Asia/Seoul"
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <p className="rounded-lg bg-bg-weak p-3 text-[12px] leading-5 text-neutral-muted">
            확정된 시간만 저장했어요. Google Calendar 일정과 Meet 링크는 아직
            만들거나 보내지 않았어요.
          </p>
        </div>
      ) : schedule?.status === "awaiting_talent" ? (
        <div className="space-y-5">
          <div className="rounded-lg bg-bg-weak p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
              <Mail className="size-4 text-neutral-muted" />
              후보자 답변 대기 중
            </div>
            <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
              {deliveryStatusCopy(schedule)}
            </p>
            {schedule.round.expiresAt ? (
              <p className="mt-2 text-[11px] text-neutral-soft">
                링크 만료 ·{" "}
                {formatScheduleTime(
                  schedule.round.expiresAt,
                  schedule.round.timezone ??
                    schedule.availability?.timezone ??
                    "Asia/Seoul"
                )}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 rounded-lg border border-neutral-1000-a05 p-4 sm:grid-cols-2">
            <div>
              <div className="text-[11px] text-neutral-soft">후보자</div>
              <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                {schedule.candidate.name}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-soft">미팅</div>
              <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                {schedule.config.title} · {schedule.config.durationMinutes}분
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
              <div className="text-[11px] text-neutral-soft">후보자</div>
              <div className="mt-1 text-[13px] font-medium text-neutral-primary">
                {schedule.candidate.name}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-soft">Role</div>
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
                  제안할 가능 시간
                </div>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {schedule.availability
                    ? `${formatMeetingAvailabilitySummary(schedule.availability)} · 향후 ${schedule.config.offerWindowDays / 7}주`
                    : `${schedule.config.organizer.name}님의 가능 시간이 아직 설정되지 않았어요.`}
                </p>
              </div>
              <MuteButton
                onClick={openAvailability}
                size="sm"
                type="button"
                variant="default"
              >
                가능 시간 열기
              </MuteButton>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-primary">
                인터뷰 제목
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
                길이
              </span>
              <Select
                disabled={updateSchedule.isPending}
                onValueChange={(value) =>
                  updateEditorDraft({ durationMinutes: Number(value) })
                }
                value={String(draft.durationMinutes)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue>{draft.durationMinutes}분</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={duration} value={String(duration)}>
                      {duration}분
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <section>
            <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-primary">
              <Users className="size-4 text-neutral-muted" />
              참석자
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
                        담당자
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
                추가 메시지{" "}
                <span className="font-normal text-neutral-soft">· 선택</span>
              </span>
              <Textarea
                className="mt-1.5 min-h-24 px-3 py-2 text-[13px] leading-5"
                disabled={updateSchedule.isPending}
                maxLength={2000}
                onChange={(event) =>
                  updateEditorDraft({ additionalMessage: event.target.value })
                }
                placeholder="예: 가능하면 가장 빠른 시간으로 부탁드려요."
                value={draft.additionalMessage}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-primary">
                공개 범위
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
                  <SelectItem value="both">회사와 후보자</SelectItem>
                  <SelectItem value="candidate">후보자에게만</SelectItem>
                  <SelectItem value="internal">회사 내부만</SelectItem>
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
  );
}
