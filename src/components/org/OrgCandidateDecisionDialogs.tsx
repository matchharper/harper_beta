import {
  InternalOnlyHatch,
  InternalOnlySurface,
} from "@/components/org/internal/InternalOnlySurface";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { FormEvent, useEffect, useId, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { Radio } from "@/components/ui/radio";
import { useOrgGoogleCalendar } from "@/hooks/org/useOrgGoogleCalendar";
import { OrgInterviewAvailabilityDialog } from "@/components/org/meetings/OrgInterviewAvailabilityDialog";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgMeetingAvailability } from "@/hooks/org/useOrgMeetingAvailability";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  buildDefaultInterviewTitle,
  DEFAULT_INTERVIEW_DURATION_MINUTES,
} from "@/lib/meetings/scheduleDraft";
import { formatOrgMeetingAvailabilitySummary } from "@/i18n/org/meetingSummary";
import type { OrgMember } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ORG_STOP_REASONS,
  extractCustomOrgStopReasons,
  useOrgStopReasonStore,
} from "@/store/useOrgStopReasonStore";

function parseEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

type ConnectionMode = "direct_contact" | "intro_email" | "interview";

type AcceptIntroSubmitResult = {
  meetingSchedule?: { detailPath: string; scheduleId: string } | null;
} | void;

export function AcceptIntroDialog({
  allowContactDirectly = false,
  candidateEmail,
  candidateName,
  companyContactName,
  defaultContactDirectly = false,
  defaultEmail,
  destinationLabel,
  members = [],
  onClose,
  onSubmit,
  open,
  pending,
  roleTitle,
}: {
  allowContactDirectly?: boolean;
  candidateEmail?: string | null;
  candidateName: string;
  companyContactName?: string | null;
  defaultContactDirectly?: boolean;
  defaultEmail?: string | null;
  destinationLabel?: string;
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
  onClose: () => void;
  onSubmit: (args: {
    acceptReason: string | null;
    additionalMessage: string | null;
    additionalMessageVisibility: "both";
    attendeeEmails: string[];
    contactDirectly: boolean;
    durationMinutes: number;
    introEmails: string[];
    meetingCandidateMessage: string | null;
    meetingPurpose: string;
    scheduleInterview: boolean;
    title: string;
  }) => AcceptIntroSubmitResult | Promise<AcceptIntroSubmitResult>;
  open: boolean;
  pending?: boolean;
  roleTitle: string;
}) {
  const { locale, c } = useOrgLocale();
  const router = useRouter();
  const { currentUser, workspace } = useOrgWorkspace();
  const acceptFormId = useId();
  const emailPreviewId = useId();
  const normalizedCandidateEmail = candidateEmail?.trim().toLowerCase() ?? "";
  const getDefaultEmailText = () => {
    const email = defaultEmail?.trim().toLowerCase() ?? "";
    return email === normalizedCandidateEmail ? "" : email;
  };
  const getDefaultConnectionMode = (): ConnectionMode =>
    allowContactDirectly && defaultContactDirectly
      ? "direct_contact"
      : "intro_email";
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    getDefaultConnectionMode
  );
  const usesDirectContact = connectionMode === "direct_contact";
  const schedulesInterview = connectionMode === "interview";
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const { statusQuery: calendarQuery } = useOrgGoogleCalendar({
    enabled: open && schedulesInterview,
    userId: currentUser?.userId ?? "",
    workspaceId: workspace.workspaceId,
  });
  const calendarConnected = calendarQuery.data?.status === "active";
  const processDestinationLabel = destinationLabel ?? c("연결됨", "Connected");
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: open && schedulesInterview,
    workspaceId: workspace.workspaceId,
  });
  const availability = availabilityQuery.data?.availability ?? null;
  const setupLoading = availabilityQuery.isPending || calendarQuery.isPending;
  const setupError = availabilityQuery.isError || calendarQuery.isError;
  const interviewReady =
    !setupLoading && !setupError && calendarConnected && Boolean(availability);
  const refreshCalendar = calendarQuery.refetch;
  const refreshAvailability = availabilityQuery.refetch;
  useEffect(() => {
    if (!open || !schedulesInterview) return;
    const refresh = () => {
      void refreshCalendar();
      void refreshAvailability();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [open, schedulesInterview, refreshCalendar, refreshAvailability]);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [introEmailText, setIntroEmailText] = useState(getDefaultEmailText);
  const [meetingTitle, setMeetingTitle] = useState(() =>
    buildDefaultInterviewTitle({
      candidateName,
      companyName: workspace.companyName,
    })
  );
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_INTERVIEW_DURATION_MINUTES
  );
  const [meetingPurpose, setMeetingPurpose] = useState("");
  const [meetingCandidateMessage, setMeetingCandidateMessage] = useState("");
  const [meetingAttendeeEmails, setMeetingAttendeeEmails] = useState(() =>
    getDefaultEmailText() ? [getDefaultEmailText()] : []
  );
  const introEmails = parseEmailList(introEmailText);
  const selectedEmailSet = new Set(introEmails);
  const selectableMembers = members.filter(
    (member): member is typeof member & { email: string } => {
      const email = member.email?.trim().toLowerCase();
      return Boolean(email && email !== normalizedCandidateEmail);
    }
  );
  const memberNameByEmail = new Map(
    selectableMembers.map((member) => [
      member.email.trim().toLowerCase(),
      member.name?.trim() || null,
    ])
  );
  const normalizedCompanyContactName =
    companyContactName?.trim() ||
    defaultEmail?.trim().split("@")[0] ||
    "Company contact";
  const introSubject = `${
    roleTitle.trim() || "Role"
  } — Introduction: ${candidateName} & ${normalizedCompanyContactName}`;

  const resetForm = () => {
    setAvailabilityOpen(false);
    setConnectionMode(getDefaultConnectionMode());
    setEmailPreviewOpen(false);
    setError("");
    setIntroEmailText(getDefaultEmailText());
    setMeetingTitle(
      buildDefaultInterviewTitle({
        candidateName,
        companyName: workspace.companyName,
      })
    );
    setDurationMinutes(DEFAULT_INTERVIEW_DURATION_MINUTES);
    setMeetingPurpose("");
    setMeetingCandidateMessage("");
    setMeetingAttendeeEmails(
      getDefaultEmailText() ? [getDefaultEmailText()] : []
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const acceptReason =
      String(formData.get("acceptReason") ?? "").trim() || null;
    if (!usesDirectContact && !normalizedCandidateEmail) {
      setError(
        schedulesInterview
          ? c(
              "후보자 이메일이 없어 일정 요청을 준비할 수 없어요.",
              "Unable to prepare schedule request: candidate has no email."
            )
          : c(
              "후보자 이메일이 없어 소개 이메일을 보낼 수 없어요.",
              "Unable to send intro email: candidate has no email."
            )
      );
      return;
    }
    if (!usesDirectContact && !schedulesInterview && introEmails.length === 0) {
      setError(
        c(
          "Email intro에는 회사 담당자 이메일이 1개 이상 필요해요.",
          "Email intro requires at least one company contact email."
        )
      );
      return;
    }
    if (schedulesInterview && !interviewReady) {
      setError(
        c(
          "Google Calendar 연결과 인터뷰 가능 시간 설정을 확인해 주세요.",
          "Check your Google Calendar connection and interview availability."
        )
      );
      return;
    }
    if (schedulesInterview && !meetingTitle.trim()) {
      setError(c("인터뷰 제목을 입력해 주세요.", "Enter interview title."));
      return;
    }
    if (schedulesInterview && !meetingPurpose.trim()) {
      setError(
        c(
          "미팅에서 나눌 주제를 알려주세요.",
          "Add topics to discuss during the meeting."
        )
      );
      return;
    }
    setError("");
    try {
      const result = await onSubmit({
        acceptReason,
        additionalMessage: null,
        additionalMessageVisibility: "both",
        attendeeEmails: schedulesInterview ? meetingAttendeeEmails : [],
        contactDirectly: usesDirectContact,
        durationMinutes,
        introEmails: usesDirectContact || schedulesInterview ? [] : introEmails,
        meetingCandidateMessage: schedulesInterview
          ? meetingCandidateMessage.trim() || null
          : null,
        meetingPurpose: schedulesInterview ? meetingPurpose.trim() : "",
        scheduleInterview: schedulesInterview,
        title: meetingTitle.trim(),
      });
      resetForm();
      if (result?.meetingSchedule?.detailPath) {
        void router.push(result.meetingSchedule.detailPath);
      }
    } catch (submitError) {
      setError(
        localizedOrgErrorMessage(
          submitError,
          locale,
          c(
            "후보자 연결 결과를 확인하지 못했어요. 바로 다시 시도하지 말고 현재 상태와 메일을 먼저 확인해 주세요.",
            "Could not confirm candidate connection. Don't retry immediately; check current status and email first."
          )
        )
      );
    }
  };
  const handleClose = () => {
    resetForm();
    onClose();
  };
  const updateIntroEmails = (emails: string[]) => {
    setIntroEmailText(emails.join("\n"));
    if (error) setError("");
  };
  const toggleMemberEmail = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const nextEmails = selectedEmailSet.has(normalizedEmail)
      ? introEmails.filter((item) => item !== normalizedEmail)
      : [...introEmails, normalizedEmail];
    updateIntroEmails(nextEmails);
  };
  const selectConnectionMode = (mode: ConnectionMode) => {
    if (mode === "direct_contact" && !allowContactDirectly) return;
    setConnectionMode(mode);
    if (mode !== "intro_email") setEmailPreviewOpen(false);
    if (error) setError("");
  };

  const toggleMeetingAttendee = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === defaultEmail?.trim().toLowerCase()) return;
    setMeetingAttendeeEmails((current) =>
      current.includes(normalizedEmail)
        ? current.filter((item) => item !== normalizedEmail)
        : [...current, normalizedEmail]
    );
  };

  return (
    <>
      <TalentCareerModal
        bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto px-5 pb-5 sm:px-6"
        closeOnBackdrop={!pending}
        description={
          <span className="block truncate text-[13px] text-neutral-muted">
            {candidateName}
            {roleTitle ? ` · ${roleTitle}` : ""}
          </span>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <MuteButton
              type="button"
              variant="default"
              onClick={handleClose}
              disabled={pending}
            >
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={
                pending ||
                (schedulesInterview &&
                  (!normalizedCandidateEmail ||
                    !interviewReady ||
                    !meetingTitle.trim() ||
                    !meetingPurpose.trim())) ||
                (!usesDirectContact &&
                  !schedulesInterview &&
                  (!normalizedCandidateEmail || introEmails.length === 0))
              }
              form={acceptFormId}
              type="submit"
              variant="positive"
            >
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              {schedulesInterview
                ? c("인터뷰 요청하고 연결하기", "Send intro & connect")
                : usesDirectContact
                  ? "Mark as connected"
                  : "Send intro & connect"}
            </MuteButton>
          </div>
        }
        footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
        headerClassName="bg-bg-floating px-5 pb-5 pt-6 sm:px-6"
        mobileBottomSheet
        onClose={() => {
          if (!pending) handleClose();
        }}
        open={open}
        panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
        showCloseButton={!pending}
        title={c("후보자 연결 수락", "Connect candidate")}
      >
        <form
          className="mt-0 space-y-5"
          id={acceptFormId}
          onSubmit={handleSubmit}
        >
          <fieldset className="space-y-1" disabled={pending}>
            {(
              [
                [
                  "intro_email",
                  c("이메일로 연결받기", "Email introduction"),
                  c(
                    "서로 소개받고 이메일로 다음 단계를 이야기해요.",
                    "Get introduced and discuss next steps over email."
                  ),
                ],
                [
                  "interview",
                  c("바로 인터뷰 요청", "Request an interview"),
                  c(
                    "후보자가 가능한 시간을 고를 수 있도록 일정 선택 링크를 보내요.",
                    "Send a scheduling link so the candidate can choose a time."
                  ),
                ],
                ...(allowContactDirectly
                  ? [
                      [
                        "direct_contact",
                        c("직접 연락하기", "Direct contact"),
                        c(
                          "Harper 메일 없이 연결 상태만 변경해요.",
                          "Mark as connected without an email from Harper."
                        ),
                      ],
                    ]
                  : []),
              ] as [ConnectionMode, string, string][]
            ).map(([mode, label, description]) => (
              <label
                key={mode}
                className={cn(
                  "relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-lg px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-neutral-1000-a10 motion-reduce:transition-none",
                  connectionMode === mode
                    ? "bg-bg-weak"
                    : "bg-bg-floating hover:bg-bg-weak",
                  pending && "cursor-not-allowed opacity-60"
                )}
              >
                {mode === "direct_contact" ? <InternalOnlyHatch /> : null}
                <Radio
                  name={`${acceptFormId}-connection`}
                  value={mode}
                  checked={connectionMode === mode}
                  onChange={() => selectConnectionMode(mode)}
                  size="medium"
                  className="mt-[2px] checked:border-positive checked:bg-[radial-gradient(circle,var(--color-neutral-00)_0_35%,var(--color-positive)_38%)]"
                />
                <span className="relative min-w-0">
                  <span className="block text-[13px] font-medium text-neutral-primary">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-neutral-muted">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {usesDirectContact ? (
            <InternalOnlySurface
              showLabel={false}
              className="rounded-md bg-bg-weak p-3"
              role="tabpanel"
            >
              <div className="text-[13px] font-medium text-neutral-primary">
                {c("Direct contact", "Direct contact")}
              </div>
              <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                {processDestinationLabel}{" "}
                {c(
                  "상태만 저장하고 Harper는 소개 이메일을 보내지 않아요. 회사 담당자가 후보자에게 직접 연락해 다음 단계를 진행해 주세요.",
                  "Save the status without sending an intro email. Your team must contact the candidate to move forward."
                )}
              </p>
            </InternalOnlySurface>
          ) : schedulesInterview ? (
            <section
              aria-label={c("인터뷰 일정 조율", "Schedule interview")}
              className="space-y-4 border-t border-neutral-1000-a05 pt-5"
              role="tabpanel"
            >
              <div
                className="flex items-start gap-3 rounded-lg bg-bg-weak p-3.5"
                aria-live="polite"
              >
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-neutral-muted" />
                <div className="min-w-0 flex-1 space-y-2 text-[12px] leading-5 text-neutral-muted">
                  {setupLoading ? (
                    <p>
                      {c(
                        "캘린더와 가능 시간을 확인하고 있어요.",
                        "Checking your calendar and availability…"
                      )}
                    </p>
                  ) : setupError ? (
                    <>
                      <p>
                        {c(
                          "인터뷰 설정을 불러오지 못했어요.",
                          "Couldn't load your interview settings."
                        )}
                      </p>
                      <MuteButton
                        type="button"
                        size="sm"
                        onClick={() => {
                          void calendarQuery.refetch();
                          void availabilityQuery.refetch();
                        }}
                      >
                        {c("다시 확인", "Try again")}
                      </MuteButton>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-neutral-primary">
                        {interviewReady
                          ? c(
                              "인터뷰를 요청할 준비가 되었어요",
                              "Ready to request an interview"
                            )
                          : c(
                              "인터뷰 요청 전에 설정을 완료해 주세요",
                              "Complete your interview setup"
                            )}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span>
                          {calendarConnected
                            ? c(
                                "Google Calendar 연결됨",
                                "Google Calendar connected"
                              )
                            : c(
                                "Google Calendar 연결 필요",
                                "Connect Google Calendar"
                              )}
                        </span>
                        {!calendarConnected ? (
                          <MuteButton asChild size="sm">
                            <a
                              href={`/org/settings?tab=calendar&orgId=${encodeURIComponent(workspace.workspaceId)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c("새 탭에서 연결", "Connect in new tab")}
                            </a>
                          </MuteButton>
                        ) : (
                          <Check className="size-3 text-positive" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span>
                          {availability
                            ? formatOrgMeetingAvailabilitySummary(
                                availability,
                                c
                              )
                            : c(
                                "인터뷰 가능 시간 설정 필요",
                                "Set your interview availability"
                              )}
                        </span>
                        <MuteButton
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => setAvailabilityOpen(true)}
                        >
                          {availability
                            ? c("수정", "Edit")
                            : c("가능 시간 설정", "Set availability")}
                        </MuteButton>
                      </div>
                      {!calendarConnected ? (
                        <p>
                          {c(
                            "연결을 마친 뒤 이 창으로 돌아오면 설정을 다시 확인해요.",
                            "Return to this window after connecting to refresh your settings."
                          )}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {!normalizedCandidateEmail ? (
                <p role="alert" className="text-[12px] text-critical">
                  {c(
                    "후보자 이메일이 없어 인터뷰 요청을 보낼 수 없어요.",
                    "This candidate has no email address for an interview invitation."
                  )}
                </p>
              ) : null}
              {interviewReady ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <label className="block">
                      <span className="text-[12px] font-medium text-neutral-muted">
                        {c("제목", "Title")}
                      </span>
                      <Input
                        className="mt-1.5 text-[13px]"
                        disabled={pending}
                        maxLength={200}
                        onChange={(event) =>
                          setMeetingTitle(event.target.value)
                        }
                        value={meetingTitle}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[12px] font-medium text-neutral-muted">
                        {c("길이", "Length")}
                      </span>
                      <Select
                        disabled={pending}
                        onValueChange={(value) =>
                          setDurationMinutes(Number(value))
                        }
                        value={String(durationMinutes)}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue>
                            {durationMinutes}
                            {c("분", "min")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start">
                          {[30, 45, 60, 90, 120].map((duration) => (
                            <SelectItem key={duration} value={String(duration)}>
                              {duration}
                              {c("분", "min")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[12px] font-medium text-neutral-muted">
                      {c("미팅 주제", "Meeting topic")}
                    </span>
                    <Input
                      className="mt-1.5 text-[13px]"
                      disabled={pending}
                      maxLength={600}
                      onChange={(event) =>
                        setMeetingPurpose(event.target.value)
                      }
                      placeholder={c(
                        "예: 가벼운 기술적인 이야기와 서로의 기대 확인",
                        "e.g. a short technical chat to align expectations"
                      )}
                      value={meetingPurpose}
                    />
                    <span className="mt-1 block text-[12px] leading-5 text-neutral-soft">
                      {c(
                        "후보자에게도 이 내용과 미팅 길이를 함께 안내해요.",
                        "This will be shared with the candidate along with the meeting length."
                      )}
                    </span>
                  </label>

                  <label className="block">
                    <span className="text-[12px] font-medium text-neutral-muted">
                      {c("함께 전할 내용", "Details to share")}
                      <span className="font-normal">
                        {c("· 선택", "· optional")}
                      </span>
                    </span>
                    <Textarea
                      className="mt-1.5 min-h-[88px] text-[13px]"
                      disabled={pending}
                      maxLength={2000}
                      onChange={(event) =>
                        setMeetingCandidateMessage(event.target.value)
                      }
                      placeholder={c(
                        "예: 팀과 현재 풀고 있는 문제를 가볍게 소개드리고 싶어요.",
                        "e.g. briefly introduce the team and the problems you're solving"
                      )}
                      rows={3}
                      value={meetingCandidateMessage}
                    />
                  </label>

                  <div>
                    <div className="text-[12px] font-medium text-neutral-muted">
                      {c("참석자", "Attendees")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectableMembers.map((member) => {
                        const email = member.email.trim().toLowerCase();
                        const selected = meetingAttendeeEmails.includes(email);
                        const organizer =
                          email === defaultEmail?.trim().toLowerCase();
                        return (
                          <MuteButton
                            aria-pressed={selected}
                            disabled={pending || organizer}
                            key={member.userId}
                            onClick={() => toggleMeetingAttendee(email)}
                            size="sm"
                            type="button"
                            variant={selected ? "neutral" : "default"}
                          >
                            {selected ? <Check className="size-3" /> : null}
                            {member.name || email.split("@")[0]}
                          </MuteButton>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </section>
          ) : (
            <section
              aria-label={c("Email intro", "Email intro")}
              className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-default"
              role="tabpanel"
            >
              <div className="border-b border-neutral-1000-a05 px-4 py-3 text-[13px] font-medium text-neutral-primary">
                {c("Email intro", "Email intro")}
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <div className="text-neutral-soft">
                    {c("받는 사람", "Recipients")}
                  </div>
                  <div className="min-w-0 text-neutral-primary">
                    {normalizedCandidateEmail ? (
                      <>
                        <span>{candidateName}</span>{" "}
                        <span className="break-all text-neutral-muted">
                          {c("<{email}>", "<{email}>", {
                            email: normalizedCandidateEmail,
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="text-critical">
                        {c("후보자 이메일 없음", "No candidate email")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <div className="text-neutral-soft">
                    {c("Recipients", "Recipients")}
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {introEmails.map((email) => (
                      <MuteButton
                        aria-label={c(
                          "{p0} 소개 메일에서 제외",
                          "Exclude {p0} from intro email",
                          {
                            p0: memberNameByEmail.get(email) || email,
                          }
                        )}
                        className="h-7 max-w-full gap-1 rounded-full"
                        disabled={pending}
                        key={email}
                        onClick={() => toggleMemberEmail(email)}
                        size="sm"
                        title={`${memberNameByEmail.get(email) || email} · ${email}`}
                        variant="default"
                      >
                        <span className="max-w-24 truncate">
                          {memberNameByEmail.get(email) || email.split("@")[0]}
                        </span>
                        <span className="hidden max-w-40 truncate text-[11px] text-neutral-soft sm:inline">
                          {email}
                        </span>
                        <X className="size-3" />
                      </MuteButton>
                    ))}
                    {selectableMembers
                      .filter(
                        (member) =>
                          !selectedEmailSet.has(
                            member.email.trim().toLowerCase()
                          )
                      )
                      .map((member) => {
                        const email = member.email.trim().toLowerCase();
                        return (
                          <MuteButton
                            aria-label={c(
                              "{p0} 소개 메일에 추가",
                              "Include {p0} in intro email",
                              { p0: member.name || email }
                            )}
                            className="h-7 max-w-full gap-1 rounded-full border-dashed text-neutral-muted"
                            disabled={pending}
                            key={member.userId}
                            onClick={() => toggleMemberEmail(email)}
                            size="sm"
                            title={`${member.name || email} · ${email}`}
                            variant="default"
                          >
                            <Plus className="size-3" />
                            <span className="max-w-24 truncate">
                              {member.name || email.split("@")[0]}
                            </span>
                          </MuteButton>
                        );
                      })}
                    {introEmails.length === 0 ? (
                      <span className="text-critical">
                        {c(
                          "담당자를 1명 이상 선택해 주세요.",
                          "Select at least one company contact."
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <div className="text-neutral-soft">{c("제목", "Title")}</div>
                  <div
                    className="line-clamp-2 min-w-0 text-neutral-primary"
                    title={introSubject}
                  >
                    {introSubject}
                  </div>
                </div>
              </div>
            </section>
          )}

          {!schedulesInterview ? (
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-primary">
                {c("연결 메모", "Connection note")}{" "}
                <span className="font-normal text-neutral-soft">
                  {c("· 선택", "· optional")}
                </span>
              </span>
              <Textarea
                key={`${open}:acceptReason`}
                name="acceptReason"
                rows={3}
                className="mt-1.5 min-h-24"
                disabled={pending}
              />
              <p className="text-[12px] font-medium text-neutral-muted">
                {c(
                  "후보자에게 공유되지 않으며, 이후 후보 추천에 참고해요.",
                  "Private to your team and used to inform future recommendations."
                )}
              </p>
            </label>
          ) : null}
          {error ? (
            <div className="text-[12px] text-critical" role="alert">
              {error}
            </div>
          ) : null}
        </form>
      </TalentCareerModal>
      {availabilityOpen ? (
        <OrgInterviewAvailabilityDialog
          open
          onRequestClose={() => setAvailabilityOpen(false)}
          userId={currentUser?.userId ?? ""}
          workspaceId={workspace.workspaceId}
        />
      ) : null}
    </>
  );
}

export function StopCandidateDialog({
  candidateName,
  connectionStarted = false,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  connectionStarted?: boolean;
  onClose: () => void;
  onSubmit: (args: {
    note: string | null;
    notifyCandidateOnClosure: boolean;
  }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
}) {
  const { locale, c } = useOrgLocale();
  const stopNoteId = useId();
  const stopNoteHelpId = useId();
  const stopReasonLabelId = useId();
  const stopFormId = useId();
  const [error, setError] = useState("");
  const [stopNote, setStopNote] = useState("");
  const [notifyCandidateOnClosure, setNotifyCandidateOnClosure] =
    useState(true);
  const savedReasons = useOrgStopReasonStore((state) => state.savedReasons);
  const rememberReasons = useOrgStopReasonStore(
    (state) => state.rememberReasons
  );
  const stopReasonOptions = [...DEFAULT_ORG_STOP_REASONS, ...savedReasons];
  const selectedStopReasonSet = new Set(
    stopNote
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const normalizedCandidateName =
    candidateName.trim() || c("후보자", "candidate");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNote = stopNote.trim();
    const customReasons = extractCustomOrgStopReasons(
      trimmedNote,
      stopReasonOptions
    );
    setError("");
    try {
      await onSubmit({ note: trimmedNote || null, notifyCandidateOnClosure });
      setNotifyCandidateOnClosure(true);
      rememberReasons(customReasons);
      setStopNote("");
    } catch (submitError) {
      setError(
        localizedOrgErrorMessage(
          submitError,
          locale,
          c(
            "종료 결과를 확인하지 못했어요. 바로 다시 시도하지 말고 후보자의 현재 상태를 먼저 확인해 주세요.",
            "Couldn't confirm the closure result. Don't retry immediately; check the candidate's current status first."
          )
        )
      );
    }
  };
  const handleClose = () => {
    setError("");
    setStopNote("");
    setNotifyCandidateOnClosure(true);
    onClose();
  };
  const toggleStopReason = (reason: string) => {
    setStopNote((currentNote) => {
      const lines = currentNote.split(/\r?\n/);
      const selected = lines.some((line) => line.trim() === reason);

      if (selected) {
        return lines.filter((line) => line.trim() !== reason).join("\n");
      }

      const separator =
        currentNote.length === 0 || currentNote.endsWith("\n") ? "" : "\n";
      return `${currentNote}${separator}${reason}\n`;
    });
    if (error) setError("");
  };

  return (
    <TalentCareerModal
      bodyClassName="bg-bg-floating px-5 py-5 sm:px-6"
      closeOnBackdrop={!pending}
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton disabled={pending} onClick={handleClose} type="button">
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            form={stopFormId}
            type="submit"
            variant={connectionStarted ? "warn" : "critical"}
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {connectionStarted ? "End connection" : "Reject candidate"}
          </MuteButton>
        </div>
      }
      mobileBottomSheet
      onClose={() => {
        if (!pending) handleClose();
      }}
      open={open}
      panelClassName="max-w-md border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title={connectionStarted ? "End connection" : "Reject candidate"}
    >
      <form className="space-y-4" id={stopFormId} onSubmit={handleSubmit}>
        <div className="space-y-2 text-[13px] leading-5 text-neutral-primary">
          <div className="font-medium">{normalizedCandidateName}</div>
          <div className="text-neutral-muted">
            {c(
              "종료 상태는 후보자 화면에도 표시돼요. 이미 보낸 소개 이메일이나 연락은 회수할 수 없어요.",
              "The closed status will also appear to the candidate. Emails and messages already sent cannot be recalled."
            )}
          </div>
        </div>
        <Checkbox
          checked={notifyCandidateOnClosure}
          disabled={pending}
          onChange={(event) =>
            setNotifyCandidateOnClosure(event.target.checked)
          }
          label={c(
            "Harper가 후보자에게 종료 안내 보내기",
            "Have Harper notify the candidate of the closure"
          )}
          helperText={c(
            "해제하면 별도 종료 안내 메일을 보내지 않아요.",
            "Uncheck to skip Harper's separate closure email."
          )}
        />
        <div className="space-y-2">
          <div
            className="text-[12px] font-medium text-neutral-primary"
            id={stopReasonLabelId}
          >
            {c("연결을 거절하는 이유", "Reason for declining the connection")}{" "}
            <span className="font-normal text-neutral-soft">
              {c("· 선택", "· optional")}
            </span>
          </div>
          <div
            aria-labelledby={stopReasonLabelId}
            className="flex flex-wrap gap-1.5"
            role="group"
          >
            {stopReasonOptions.map((reason) => {
              const selected = selectedStopReasonSet.has(reason);

              return (
                <MuteButton
                  aria-pressed={selected}
                  className={cn(
                    "text-[12px]",
                    selected && "border-neutral-800"
                  )}
                  disabled={pending}
                  key={reason}
                  onClick={() => toggleStopReason(reason)}
                  size="sm"
                  variant={selected ? "neutral" : "default"}
                >
                  {reason}
                </MuteButton>
              );
            })}
          </div>
          <Textarea
            aria-describedby={stopNoteHelpId}
            aria-labelledby={stopReasonLabelId}
            id={stopNoteId}
            name="stopNote"
            value={stopNote}
            onChange={(event) => {
              setStopNote(event.target.value);
              if (error) setError("");
            }}
            rows={4}
            placeholder={c(
              "예: 현재 찾는 역할보다 경력이 조금 주니어해요.",
              "e.g. slightly junior for the role"
            )}
            className="min-h-24 px-3 py-2 text-[13px] leading-5"
            disabled={pending}
          />
          <p
            className="text-[12px] leading-5 text-neutral-soft"
            id={stopNoteHelpId}
          >
            {c(
              "다음 추천을 개선하는 데 참고합니다. 후보자에게는 공유되지 않습니다.",
              "Used to improve future recommendations. Not shared with the candidate."
            )}
          </p>
        </div>
        {error ? (
          <div className="text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
