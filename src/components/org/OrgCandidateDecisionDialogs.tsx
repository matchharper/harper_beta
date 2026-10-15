import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { FormEvent, useId, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { motion } from "motion/react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

type ConnectionMode = "direct_contact" | "intro_email";

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
  // Meeting scheduling is intentionally chat-only. This dialog only covers
  // direct contact and the existing email-introduction flow.
  const schedulesInterview = false;
  const processDestinationLabel = destinationLabel ?? c("연결됨", "Connected");
  const processDestinationDirection = c("{p0} 단계로", "Move to {p0} stage", {
    p0: processDestinationLabel,
  });
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: open && schedulesInterview,
    workspaceId: workspace.workspaceId,
  });
  const availability = availabilityQuery.data?.availability ?? null;
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
    if (schedulesInterview && !availability) {
      setError(
        c(
          "인터뷰 가능 시간을 먼저 설정해 주세요.",
          "Set available interview times first."
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
        additionalMessage: schedulesInterview ? acceptReason : null,
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
    <TalentCareerModal
      bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto bg-bg-floating px-5 py-4 sm:px-6"
      closeOnBackdrop={!pending}
      description={
        schedulesInterview
          ? c(
              "{p0} 옮기기 전에 미팅의 시간과 참석자를 확인해 주세요. 아직 후보자에게는 메일을 보내지 않아요.",
              "Before moving to {p0}, confirm meeting time and attendees. We won't email the candidate yet.",
              {
                p0: processDestinationDirection,
              }
            )
          : usesDirectContact
            ? c(
                "후보자를 {p0} 표시하지만 Harper는 이메일을 보내지 않아요. 회사가 후보자에게 직접 연락해야 해요.",
                "Mark candidate as {p0}, but Harper won't send an email. Your company must contact the candidate directly.",
                {
                  p0: processDestinationDirection,
                }
              )
            : c(
                "이메일로 바로 연결해드려요.",
                "Harper will connect with the candidate via an intro email."
              )
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton
            type="button"
            variant="default"
            size="md"
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
                  !availability ||
                  !meetingTitle.trim() ||
                  !meetingPurpose.trim())) ||
              (!usesDirectContact &&
                !schedulesInterview &&
                (!normalizedCandidateEmail || introEmails.length === 0))
            }
            form={acceptFormId}
            size="md"
            type="submit"
            variant="positive"
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {schedulesInterview
              ? c(
                  "일정 초안 저장하고 연결하기",
                  "Save draft schedule and connect"
                )
              : usesDirectContact
                ? "Mark as connected"
                : "Send intro & connect"}
          </MuteButton>
        </div>
      }
      footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
      headerClassName="bg-bg-floating px-5 py-4 sm:px-6"
      mobileBottomSheet
      onClose={() => {
        if (!pending) handleClose();
      }}
      open={open}
      panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title={c("Connect candidate", "Connect candidate")}
    >
      <form
        className="mt-0 space-y-4"
        id={acceptFormId}
        onSubmit={handleSubmit}
      >
        {allowContactDirectly ? (
          <div
            aria-label={c("연결 방식", "Connection method")}
            className={cn(
              "relative grid h-10 rounded-full bg-neutral-1000-a05 p-1",
              "grid-cols-2"
            )}
            role="tablist"
          >
            <motion.div
              animate={{
                x: connectionMode === "direct_contact" ? "100%" : "0%",
              }}
              className={cn(
                "absolute bottom-1 left-1 top-1 rounded-full bg-black shadow-sm",
                "w-[calc(50%_-_4px)]"
              )}
              initial={false}
              transition={{ type: "spring", stiffness: 440, damping: 38 }}
            />
            <button
              aria-selected={connectionMode === "intro_email"}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                connectionMode === "intro_email"
                  ? "text-white"
                  : "text-neutral-muted"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode("intro_email")}
              role="tab"
              type="button"
            >
              {c("Email intro", "Email intro")}
            </button>
            <button
              aria-selected={usesDirectContact}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                usesDirectContact ? "text-white" : "text-neutral-muted"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode("direct_contact")}
              role="tab"
              type="button"
            >
              {c("Direct contact", "Direct contact")}
            </button>
          </div>
        ) : null}

        {usesDirectContact ? (
          <div className="rounded-md bg-bg-weak p-3" role="tabpanel">
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
          </div>
        ) : schedulesInterview ? (
          <section
            aria-label={c("인터뷰 일정 조율", "Schedule interview")}
            className="space-y-4 rounded-lg border border-neutral-1000-a05 bg-bg-default p-4"
            role="tabpanel"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-faded text-primary">
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-neutral-primary">
                  {c(
                    "{candidateName}님에게 제안할 일정",
                    "Times to propose to {candidateName}",
                    {
                      candidateName,
                    }
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {availabilityQuery.isLoading
                    ? c(
                        "설정한 가능 시간을 확인하고 있어요.",
                        "Checking your set availability."
                      )
                    : availabilityQuery.error
                      ? c(
                          "가능 시간을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.",
                          "Couldn't load available times. Try again shortly."
                        )
                      : availability
                        ? c(
                            "{p0} 사이에서 향후 2주 내의 일정을 제안해요.",
                            "Suggest times within the next 2 weeks among {p0}.",
                            {
                              p0: formatOrgMeetingAvailabilitySummary(
                                availability,
                                c
                              ),
                            }
                          )
                        : c(
                            "먼저 평소에 미팅이 가능한 시간을 알려주세요.",
                            "Set your usual meeting availability first."
                          )}
                </p>
              </div>
            </div>

            {!availabilityQuery.isLoading &&
            !availabilityQuery.error &&
            !availability ? (
              <MuteButton
                onClick={() =>
                  void router.push({
                    pathname: "/org/settings",
                    query: {
                      dialog: "interview-availability",
                      orgId: workspace.workspaceId,
                    },
                  })
                }
                size="sm"
                type="button"
                variant="default"
              >
                {c("가능 시간 설정하기", "Set availability")}
              </MuteButton>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <label className="block">
                <span className="text-[12px] text-neutral-soft">
                  {c("제목", "Title")}
                </span>
                <Input
                  className="mt-1 h-9 text-[13px]"
                  disabled={pending}
                  maxLength={200}
                  onChange={(event) => setMeetingTitle(event.target.value)}
                  value={meetingTitle}
                />
              </label>
              <label className="block">
                <span className="text-[12px] text-neutral-soft">
                  {c("길이", "Length")}
                </span>
                <Select
                  disabled={pending}
                  onValueChange={(value) => setDurationMinutes(Number(value))}
                  value={String(durationMinutes)}
                >
                  <SelectTrigger className="mt-1 h-9">
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
              <span className="text-[12px] text-neutral-soft">
                {c("미팅 주제", "Meeting topic")}
              </span>
              <Input
                className="mt-1 h-9 text-[13px]"
                disabled={pending}
                maxLength={600}
                onChange={(event) => setMeetingPurpose(event.target.value)}
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
              <span className="text-[12px] text-neutral-soft">
                {c("함께 전할 내용", "Details to share")}
                <span className="font-normal">{c("· 선택", "· optional")}</span>
              </span>
              <Textarea
                className="mt-1 min-h-[72px] text-[13px]"
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
              <div className="text-[12px] text-neutral-soft">
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
                      className={cn(
                        "h-7 rounded-full",
                        selected &&
                          "border-primary/25 bg-primary-faded text-primary"
                      )}
                      disabled={pending || organizer}
                      key={member.userId}
                      onClick={() => toggleMeetingAttendee(email)}
                      size="sm"
                      type="button"
                      variant="default"
                    >
                      {selected ? <Check className="size-3" /> : null}
                      {member.name || email.split("@")[0]}
                    </MuteButton>
                  );
                })}
              </div>
            </div>
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
                        !selectedEmailSet.has(member.email.trim().toLowerCase())
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

        <label className="block">
          <span className="text-[12px] font-medium text-neutral-primary">
            {schedulesInterview
              ? c("추가 메시지", "Additional message")
              : "Connection note"}{" "}
            <span className="font-normal text-neutral-soft">
              {c("· 선택", "· optional")}
            </span>
          </span>
          <Textarea
            key={`${open}:acceptReason`}
            name="acceptReason"
            rows={3}
            placeholder={
              schedulesInterview
                ? c(
                    "예: 가능하면 가장 빠른 시간으로 부탁드려요.",
                    "e.g. earliest available time preferred"
                  )
                : c(
                    "예: ML infra 경험이 이번 역할과 특히 잘 맞아요.",
                    "e.g. ML infra experience is especially relevant to this role"
                  )
            }
            className="mt-1.5 min-h-24 px-3 py-2 text-[13px] leading-5"
            disabled={pending}
          />
          <p className="mt-0 text-[12px] text-neutral-soft">
            {schedulesInterview
              ? c(
                  "후보자에게 보낼 이메일에 자연스럽게 담을게요. 아직 메일이 보내지는 것은 아니에요.",
                  "This will be included naturally in the email to the candidate. The email hasn't been sent yet."
                )
              : usesDirectContact
                ? c(
                    "작성해주시면 다음 후보 추천에 반영됩니다.",
                    "This will inform future candidate recommendations."
                  )
                : c(
                    "후보자에게는 공유되지 않으며, 이후 후보 추천 기준을 다듬는 데 참고합니다.",
                    "Not shared with the intro email or the candidate; used to refine future recommendation criteria."
                  )}
          </p>
        </label>
        {error ? (
          <div className="text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
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
  onSubmit: (args: { note: string | null }) => void | Promise<void>;
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
  const politeCandidateName = normalizedCandidateName.endsWith(c("님", "'s"))
    ? normalizedCandidateName
    : c("{p0}님", "{p0}", {
        p0: normalizedCandidateName,
      });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNote = stopNote.trim();
    const customReasons = extractCustomOrgStopReasons(
      trimmedNote,
      stopReasonOptions
    );
    setError("");
    try {
      await onSubmit({ note: trimmedNote || null });
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
            {connectionStarted
              ? c(
                  "이미 보낸 소개 이메일이나 연락은 회수할 수 없어요. 현재 연결을 종료하면 Harper가 후보자에게 회사가 프로세스를 종료했다는 안내를 보내요.",
                  "Introductions already sent or company-initiated messages can't be retracted. If you end the connection now, Harper will notify the candidate that the company has closed the process. Any notices already visible or delivered cannot be undone."
                )
              : c(
                  "{p0}에게는 회사가 이번 연결을 진행하지 않기로 했다고 제가 자연스럽게 안내해요.",
                  "{p0} will see a closure notice that the company will not proceed with this connection, and Harper will send it. This action cannot be undone.",
                  {
                    p0: politeCandidateName,
                  }
                )}
          </div>
        </div>
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
              "다음 추천을 개선하는 데 참고합니다. 후보자에게는 공유되지 않아요.",
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
