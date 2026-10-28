import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  CornerDownRight,
  Lock,
  Plus,
  X,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { OrgInterviewAvailabilityDialog } from "@/components/org/meetings/OrgInterviewAvailabilityDialog";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { formatOrgMeetingAvailabilitySummary } from "@/i18n/org/meetingSummary";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { useOrgGoogleCalendar } from "@/hooks/org/useOrgGoogleCalendar";
import { useOrgMeetingAvailability } from "@/hooks/org/useOrgMeetingAvailability";
import { useOrgRoleNotificationSettings } from "@/hooks/org/useOrgRoleNotifications";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { creditSlotForRole, formatIntroCount } from "@/lib/org/billing/types";
import {
  canInitiateOrgCandidateContact,
  isOrgInternalStage,
} from "@/lib/org/candidateDecision";
import {
  buildMeetingInvitationFallback,
  MEETING_INVITATION_LINK_MARKER,
} from "@/lib/meetings/invitation";
import {
  buildDefaultInterviewTitle,
  DEFAULT_INTERVIEW_DURATION_MINUTES,
} from "@/lib/meetings/scheduleDraft";
import type {
  OrgBoardItem,
  OrgMember,
  OrgStage,
  OrgStageChangeOptions,
  OrgStageId,
} from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { appendOrgIntroCaptureDisclosure } from "@/lib/org/introEmailDisclosure";
import {
  fillOrgIntroTemplate,
  findUnknownOrgIntroFields,
} from "@/lib/org/messageTemplates";
import { OrgTemplatePicker } from "./OrgTemplatePicker";
import { insertAtCursor, OrgIntroFieldHelp } from "./OrgIntroFieldHelp";
import { OrgProcessLine, type OrgProcessStep } from "./OrgProcessLine";
import { orgStageIcon, orgStageName } from "./orgStageVisuals";

export type OrgStageMoveCandidate = {
  email: string | null;
  name: string;
  processClosureNoticeUnresolved?: boolean;
  recommendationId: string;
  stage: OrgStageId;
};

export type OrgStageMoveAction = "interview" | "intro_email" | "direct_contact";

export function toOrgStageMoveCandidate(
  item: Pick<
    OrgBoardItem,
    "processClosureNoticeUnresolved" | "recommendationId" | "stage" | "talent"
  >,
  name: string
): OrgStageMoveCandidate {
  return {
    email: item.talent.email?.trim().toLowerCase() || null,
    name,
    processClosureNoticeUnresolved: item.processClosureNoticeUnresolved,
    recommendationId: item.recommendationId,
    stage: item.stage,
  };
}

export type OrgStageMoveSubmit = {
  action: OrgStageMoveAction;
  options: (candidate: OrgStageMoveCandidate) => OrgStageChangeOptions;
  stage: OrgStageId;
  stageLabel: string;
};

const DURATIONS = [15, 30, 45, 60, 90, 120];

function summarizeNames(
  names: string[],
  c: ReturnType<typeof useOrgLocale>["c"]
) {
  return names.length > 3
    ? c("{p0} 외 {p1}명", "{p0} and {p1} more", {
        p0: names.slice(0, 3).join(", "),
        p1: names.length - 3,
      })
    : names.join(", ");
}

/**
 * One form for moving one or several candidates to a stage. The actions it
 * offers are the ones Harper already runs on a stage move: an interview
 * scheduling link (with its automatic reminder) or an intro email.
 */
export function OrgStageMoveDialog({
  allowContactDirectly = false,
  candidates,
  initialStage = "connected",
  members = [],
  onClose,
  onSubmit,
  open,
  roleId,
  roleTitle,
  stages,
}: {
  allowContactDirectly?: boolean;
  candidates: OrgStageMoveCandidate[];
  initialStage?: OrgStageId;
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
  onClose: () => void;
  onSubmit: (submit: OrgStageMoveSubmit) => void;
  open: boolean;
  roleId: string | null;
  roleTitle: string;
  stages: OrgStage[];
}) {
  const { c, locale } = useOrgLocale();
  const { currentUser, currentUserEmail, workspace } = useOrgWorkspace();
  const formId = useId();
  const count = candidates.length;
  const myEmail = currentUserEmail?.trim().toLowerCase() ?? "";
  const myName = currentUser?.name?.trim() || myEmail.split("@")[0] || "";

  const targetStages = stages.filter(
    (stage) =>
      (!stage.roleId || !roleId || stage.roleId === roleId) &&
      canInitiateOrgCandidateContact(stage.id) &&
      !isOrgInternalStage(stage.id) &&
      stage.id !== "pending_connection"
  );
  const [stageId, setStageId] = useState<OrgStageId>(() =>
    targetStages.some((stage) => stage.id === initialStage)
      ? initialStage
      : (targetStages[0]?.id ?? initialStage)
  );
  const stage = targetStages.find((item) => item.id === stageId);
  const stageLabel = (() => {
    const label = stage?.label.trim() ?? "";
    const prefix = `${roleTitle.trim()} · `;
    return roleTitle.trim() && label.startsWith(prefix)
      ? label.slice(prefix.length)
      : label;
  })();
  const stageDefaults = stage?.meetingDefaults ?? null;
  const interviewAllowed =
    count > 0 &&
    candidates.every((candidate) => candidate.stage === "pending_connection") &&
    (stageId === "connected" || stageId.startsWith("custom:"));

  // Edits are kept per stage; switching stages starts again from that stage's
  // remembered interview settings.
  const [action, setAction] = useState<OrgStageMoveAction | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [candidateMessage, setCandidateMessage] = useState<string | null>(null);
  const defaultAction: OrgStageMoveAction =
    interviewAllowed && stageDefaults ? "interview" : "intro_email";
  const selectedAction =
    action === "interview" && !interviewAllowed
      ? defaultAction
      : (action ?? defaultAction);
  const meetingPurpose = purpose ?? stageDefaults?.meetingPurpose ?? "";
  const durationMinutes =
    duration ??
    stageDefaults?.durationMinutes ??
    DEFAULT_INTERVIEW_DURATION_MINUTES;
  const meetingMessage =
    candidateMessage ?? stageDefaults?.candidateMessage ?? "";

  const [expanded, setExpanded] = useState<
    "interview" | "interview_preview" | "intro_cc" | "intro_preview" | null
  >(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [attendees, setAttendees] = useState<string[]>(() =>
    myEmail ? [myEmail] : []
  );
  const [ccEmails, setCcEmails] = useState<string[]>(() =>
    myEmail ? [myEmail] : []
  );
  // The intro email is written by Harper, or by the team from a template.
  const [introWriter, setIntroWriter] = useState<"harper" | "team">("harper");
  const [introSubject, setIntroSubject] = useState(() =>
    c(
      "{회사 이름} {역할} · {후보자 이름}님과 {내 이름}님 소개",
      "{회사 이름} {역할}: introducing {후보자 이름} and {내 이름}"
    )
  );
  const introSubjectRef = useRef<HTMLInputElement>(null);
  const introBodyRef = useRef<HTMLTextAreaElement>(null);
  // The field a value chip goes into.
  const [introField, setIntroField] = useState<"body" | "subject">("body");
  const [introBody, setIntroBody] = useState(() =>
    c(
      "{후보자 이름}님, 안녕하세요.\n\n{회사 이름}에서 {역할}을 함께할 분을 찾고 있는 {내 이름}님을 소개해 드려요. {후보자 이름}님이 이 역할에 관심을 보여 주셔서 두 분을 연결해 드리게 됐어요.\n\n이 메일에 답장하며 바로 이야기를 이어가 주세요.\n\nHarper 드림",
      "Hi {후보자 이름},\n\nI'd like to introduce {내 이름} from {회사 이름}, who is hiring for {역할}. Since you showed interest in this role, I'm connecting you both here.\n\nPlease reply to this email to continue the conversation.\n\nBest,\nHarper"
    )
  );
  const introTemplateValues = (candidateName: string) => ({
    candidateName,
    companyName: workspace.companyName,
    roleName: roleTitle,
    senderName: myName,
  });

  const schedulesInterview = selectedAction === "interview";
  const { statusQuery: calendarQuery } = useOrgGoogleCalendar({
    enabled: open && interviewAllowed,
    userId: currentUser?.userId ?? "",
    workspaceId: workspace.workspaceId,
  });
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: open && interviewAllowed,
    workspaceId: workspace.workspaceId,
  });
  const calendarConnected = calendarQuery.data?.status === "active";
  const availability = availabilityQuery.data?.availability ?? null;
  const setupLoading = calendarQuery.isPending || availabilityQuery.isPending;
  const interviewReady =
    !setupLoading && calendarConnected && Boolean(availability);

  const roleNotifications = useOrgRoleNotificationSettings({
    enabled: open && Boolean(roleId),
    roleId: roleId ?? "",
    workspaceId: workspace.workspaceId,
  });
  const memberByEmail = new Map(
    members.flatMap((member) => {
      const email = member.email?.trim().toLowerCase();
      return email ? [[email, member] as const] : [];
    })
  );
  const memberEmailById = new Map(
    members.map((member) => [
      member.userId,
      member.email?.trim().toLowerCase() ?? "",
    ])
  );
  const assigneeEmails = Array.from(
    new Set(
      (roleNotifications.data?.assigneeUserIds ?? [])
        .map((userId) => memberEmailById.get(userId) ?? "")
        .filter(Boolean)
    )
  );
  const allCc = Array.from(new Set([...ccEmails, ...assigneeEmails]));
  const memberLabel = (email: string) => {
    const name = memberByEmail.get(email)?.name?.trim() || email.split("@")[0];
    return email === myEmail ? c("{p0}(나)", "{p0} (you)", { p0: name }) : name;
  };

  const entitlements = useOrgEntitlements(workspace.workspaceId);
  const introSlot = creditSlotForRole(entitlements.data?.creditSlots, roleId);
  const introsNeeded = candidates.filter(
    (candidate) => candidate.stage === "pending_connection"
  ).length;

  const names = candidates.map((candidate) => candidate.name);
  const missingEmail = candidates.filter((candidate) => !candidate.email);
  const needsReengagement = candidates.filter(
    (candidate) => candidate.processClosureNoticeUnresolved
  );
  const issues: { key: string; text: string; fix?: () => void }[] = [];
  if (selectedAction !== "direct_contact" && missingEmail.length) {
    issues.push({
      key: "email",
      text: c(
        "이메일이 없어 보낼 수 없는 후보가 있어요: {p0}",
        "Some candidates have no email address: {p0}",
        {
          p0: summarizeNames(
            missingEmail.map((item) => item.name),
            c
          ),
        }
      ),
    });
  }
  if (needsReengagement.length) {
    issues.push({
      key: "reengagement",
      text: c(
        "다시 진행할지 먼저 확인해야 하는 후보가 있어요: {p0}. 이 후보는 한 명씩 진행해 주세요.",
        "Some candidates need to confirm they want to continue first: {p0}. Move them one at a time.",
        {
          p0: summarizeNames(
            needsReengagement.map((item) => item.name),
            c
          ),
        }
      ),
    });
  }
  if (introSlot && introsNeeded > introSlot.remaining) {
    issues.push({
      key: "intro",
      text: c(
        "Intro가 {p0}개 필요한데 이번 달 {p1}개 남았어요.",
        "This needs {p0} Intros but {p1} are left this month.",
        { p0: introsNeeded, p1: Math.max(0, introSlot.remaining) }
      ),
    });
  }
  if (schedulesInterview && !setupLoading && !interviewReady) {
    issues.push({
      fix: () => setExpanded("interview"),
      key: "calendar",
      text: c(
        "면접 링크를 보내려면 Google Calendar 연결과 가능 시간 설정이 필요해요.",
        "Connect Google Calendar and set your availability to send interview links."
      ),
    });
  }
  if (schedulesInterview && interviewReady && !meetingPurpose.trim()) {
    issues.push({
      fix: () => setExpanded("interview"),
      key: "purpose",
      text: c(
        "후보자에게 전할 미팅 주제를 정해 주세요.",
        "Add what the meeting will cover."
      ),
    });
  }
  if (
    selectedAction === "intro_email" &&
    introWriter === "team" &&
    (!introSubject.trim() || !introBody.trim())
  ) {
    issues.push({
      key: "intro-template",
      text: c(
        "소개 메일 제목과 본문을 써 주세요.",
        "Write the intro email subject and body."
      ),
    });
  }
  const unknownIntroFields =
    selectedAction === "intro_email" && introWriter === "team"
      ? findUnknownOrgIntroFields(introSubject, introBody)
      : [];
  if (unknownIntroFields.length) {
    issues.push({
      fix: expanded === "intro_preview" ? () => setExpanded(null) : undefined,
      key: "intro-fields",
      text: c(
        "소개 메일에 바뀌지 않는 값이 있어요: {p0}",
        "The intro email has values that won't be filled in: {p0}",
        { p0: unknownIntroFields.join(", ") }
      ),
    });
  }
  if (selectedAction === "intro_email" && allCc.length === 0) {
    issues.push({
      fix: () => setExpanded("intro_cc"),
      key: "cc",
      text: c(
        "소개 메일에 함께 넣을 팀원을 1명 이상 골라 주세요.",
        "Choose at least one teammate for the intro email."
      ),
    });
  }
  const blocked =
    !stage || issues.length > 0 || (schedulesInterview && setupLoading);

  const resetEdits = () => {
    setAction(null);
    setPurpose(null);
    setDuration(null);
    setCandidateMessage(null);
    setExpanded(null);
  };
  const handleClose = () => {
    resetEdits();
    onClose();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked || !stage) return;
    const purposeText = meetingPurpose.trim();
    const messageText = meetingMessage.trim() || null;
    const attendeeEmails = [...attendees];
    const introEmails = [...ccEmails];
    const companyName = workspace.companyName;
    const template =
      introWriter === "team"
        ? { body: introBody.trim(), subject: introSubject.trim() }
        : null;
    onSubmit({
      action: selectedAction,
      options: (candidate) =>
        selectedAction === "interview"
          ? {
              acceptReason: null,
              attendeeEmails,
              contactDirectly: false,
              durationMinutes,
              introEmails: [],
              meetingCandidateMessage: messageText,
              meetingPurpose: purposeText,
              scheduleInterview: true,
              title: buildDefaultInterviewTitle({
                candidateName: candidate.name,
                companyName,
              }),
            }
          : selectedAction === "direct_contact"
            ? { acceptReason: null, contactDirectly: true, introEmails: [] }
            : {
                acceptReason: null,
                contactDirectly: false,
                introEmailDraft: template
                  ? {
                      body: fillOrgIntroTemplate(
                        template.body,
                        introTemplateValues(candidate.name)
                      ),
                      subject: fillOrgIntroTemplate(
                        template.subject,
                        introTemplateValues(candidate.name)
                      ),
                    }
                  : undefined,
                introEmails,
                scheduleInterview: false,
              },
      stage: stage.id,
      stageLabel,
    });
    resetEdits();
  };

  // Where the candidates are, the column this move takes them to, and the
  // columns that follow in this Role's pipeline.
  const fromStage = candidates[0]?.stage ?? "pending_connection";
  const stageIndex = targetStages.findIndex((item) => item.id === stageId);
  const laterStages = stageIndex < 0 ? [] : targetStages.slice(stageIndex + 1);
  const shownLater = laterStages.slice(0, 2);
  const hiddenLater = laterStages.length - shownLater.length;
  const processSteps: OrgProcessStep[] = [
    {
      icon: orgStageIcon(fromStage),
      key: "from",
      label: orgStageName(fromStage, c, stages, roleTitle),
      state: "now",
    },
    {
      detail:
        selectedAction === "interview"
          ? c(
              "면접 예약 링크를 보내요. 후보자가 시간을 고르면 캘린더 초대가 가요",
              "Sends a scheduling link; a calendar invite goes out once they pick"
            )
          : selectedAction === "intro_email"
            ? c(
                "소개 메일을 바로 보내요. 첫 답장이 오면 Harper가 알려 드려요",
                "Sends the intro email now; Harper tells you when they first reply"
              )
            : c(
                "Harper 메일 없이 옮겨요",
                "Moves without an email from Harper"
              ),
      icon: orgStageIcon(stageId),
      key: "to",
      label: stageLabel,
    },
    ...shownLater.map((item) => ({
      icon: orgStageIcon(item.id),
      key: item.id,
      label: orgStageName(item.id, c, stages, roleTitle),
    })),
    ...(hiddenLater > 0
      ? [
          {
            detail: laterStages
              .slice(shownLater.length)
              .map((item) => orgStageName(item.id, c, stages, roleTitle))
              .join(" → "),
            icon: orgStageIcon(""),
            key: "more",
            label: c("이후 {p0}개", "{p0} more", { p0: hiddenLater }),
          },
        ]
      : []),
  ];

  const firstCandidate = candidates[0];
  const invitationPreview = firstCandidate
    ? buildMeetingInvitationFallback({
        candidateMessage: meetingMessage.trim() || null,
        candidateName: firstCandidate.name,
        companyName: workspace.companyName,
        durationMinutes,
        invitationKind: "first_company_conversation",
        locale,
        meetingPurpose: meetingPurpose.trim() || undefined,
        organizerName: myName,
        processStageName: stageLabel,
        roleName: roleTitle,
      })
    : null;
  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    email: string
  ) =>
    setList(
      list.includes(email)
        ? list.filter((item) => item !== email)
        : [...list, email]
    );
  const teammateEmails = Array.from(memberByEmail.keys());

  const actionRow = (
    value: OrgStageMoveAction,
    title: string,
    detail: ReactNode,
    extra?: ReactNode,
    disabledReason?: string
  ) => (
    <div
      className={cn(
        "relative px-3 py-3",
        value === "direct_contact" && "overflow-hidden"
      )}
    >
      {value === "direct_contact" ? <InternalOnlyHatch /> : null}
      <label
        className={cn(
          "relative flex items-start gap-2.5",
          disabledReason ? "cursor-not-allowed" : "cursor-pointer"
        )}
      >
        <Radio
          checked={selectedAction === value}
          className="mt-[2px]"
          disabled={Boolean(disabledReason)}
          name={`${formId}-action`}
          onChange={() => {
            setAction(value);
            setExpanded(null);
          }}
          size="medium"
          value={value}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[13px]",
              disabledReason ? "text-neutral-soft" : "text-neutral-primary"
            )}
          >
            {title}
          </span>
          <span className="mt-0.5 block text-[12px] leading-5 text-neutral-muted">
            {disabledReason ?? detail}
          </span>
        </span>
      </label>
      {selectedAction === value && extra ? (
        <div className="relative mt-2 pl-6">{extra}</div>
      ) : null}
    </div>
  );

  const linkButton = (label: string, target: NonNullable<typeof expanded>) => (
    <button
      aria-expanded={expanded === target}
      className={cn(
        "text-blue-500 underline-offset-2 hover:text-blue-700 hover:underline",
        expanded === target && "underline"
      )}
      onClick={() => setExpanded(expanded === target ? null : target)}
      type="button"
    >
      {label}
    </button>
  );

  // A teammate chip. Someone who is always included looks selected like the
  // others and carries a lock instead of looking disabled.
  const memberChip = ({
    email,
    locked = false,
    lockedTitle,
    onToggle,
    selected,
    selectedIcon,
    unselectedIcon = <Plus className="size-3" />,
  }: {
    email: string;
    locked?: boolean;
    lockedTitle?: string;
    onToggle: () => void;
    selected: boolean;
    selectedIcon: ReactNode;
    unselectedIcon?: ReactNode;
  }) => (
    <MuteButton
      aria-disabled={locked || undefined}
      aria-pressed={selected}
      className={cn(
        locked &&
          "cursor-default hover:border-neutral-1000-a05 hover:bg-bg-weak active:border-neutral-1000-a05 active:bg-bg-weak"
      )}
      key={email}
      onClick={locked ? undefined : onToggle}
      size="sm"
      title={locked ? lockedTitle : email}
      type="button"
      variant={selected ? "neutral" : "default"}
    >
      {selected ? (
        locked ? (
          <Check className="size-3" />
        ) : (
          selectedIcon
        )
      ) : (
        unselectedIcon
      )}
      {memberLabel(email)}
      {locked ? <Lock className="size-3 text-neutral-soft" /> : null}
    </MuteButton>
  );

  const mailRow = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2 px-3 py-2">
      <dt className="pt-px text-neutral-soft">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-5 text-neutral-primary">
        {value}
      </dd>
    </div>
  );

  const interviewSummary = [
    c("{p0}분", "{p0} min", { p0: durationMinutes }),
    attendees.length
      ? c("참석 {p0}", "With {p0}", {
          p0: attendees.map(memberLabel).join(", "),
        })
      : null,
    meetingPurpose.trim() ? `“${meetingPurpose.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <TalentCareerModal
        bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto px-5 pb-5 sm:px-6"
        closeOnBackdrop
        description={count > 1 ? summarizeNames(names, c) : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <MuteButton onClick={handleClose} type="button">
              {c("취소", "Cancel")}
            </MuteButton>
            <MuteButton
              disabled={blocked}
              form={formId}
              type="submit"
              variant="dark"
            >
              {selectedAction === "direct_contact"
                ? c("{p0}명 이동", "Move {p0}", { p0: count })
                : c("{p0}명 이동하고 보내기", "Move {p0} and send", {
                    p0: count,
                  })}
            </MuteButton>
          </div>
        }
        footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
        headerClassName="bg-bg-floating px-5 pb-4 pt-6 sm:px-6"
        mobileBottomSheet
        onClose={handleClose}
        open={open}
        panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
        title={
          count > 1
            ? c("{p0}명과 연결", "Connect with {p0} candidates", { p0: count })
            : c("{p0}님과 연결", "Connect with {p0}", {
                p0: names[0] || c("후보자", "the candidate"),
              })
        }
      >
        <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
          <OrgProcessLine steps={processSteps} />
          <label className="block">
            <span className="text-[12px] text-neutral-muted">
              {c("이동할 단계", "Move to")}
            </span>
            <Select
              onValueChange={(value) => {
                setStageId(String(value) as OrgStageId);
                resetEdits();
              }}
              value={stageId}
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue>
                  <span className="flex w-full min-w-0 items-center justify-between gap-3">
                    <span className="truncate">{stageLabel}</span>
                    <span className="truncate text-[12px] text-neutral-soft">
                      {roleTitle}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {targetStages.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div>
            <div className="text-[12px] text-neutral-muted">
              {c("이 단계에서 할 일", "What happens")}
              {stageDefaults ? (
                <span className="text-neutral-soft">
                  {" · "}
                  {c("이 단계에 저장된 설정", "Saved for this stage")}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 divide-y divide-neutral-1000-a05 rounded-lg border border-neutral-1000-a05 bg-bg-default">
              {actionRow(
                "interview",
                c("면접 예약 링크 보내기", "Send an interview scheduling link"),
                <>
                  {setupLoading && interviewAllowed
                    ? c("캘린더를 확인하고 있어요", "Checking your calendar")
                    : interviewReady
                      ? interviewSummary
                      : c(
                          "Google Calendar 연결이 필요해요",
                          "Needs Google Calendar"
                        )}
                </>,
                <div className="space-y-2 text-[12px] leading-5">
                  <div className="flex items-center gap-1.5 text-neutral-muted">
                    <CornerDownRight className="size-3.5 shrink-0" />
                    {c(
                      "3일 안에 시간을 고르지 않으면 Harper가 한 번 다시 안내해요",
                      "If no time is picked in 3 days, Harper follows up once"
                    )}
                  </div>
                  <div className="flex gap-3">
                    {linkButton(c("설정", "Settings"), "interview")}
                    {interviewReady
                      ? linkButton(
                          c("미리보기", "Preview"),
                          "interview_preview"
                        )
                      : null}
                  </div>
                  {expanded === "interview" ? (
                    <div className="space-y-3 rounded-md bg-bg-weak p-3">
                      <div className="flex items-start gap-2 text-neutral-muted">
                        <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
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
                            {calendarConnected ? (
                              <Check className="size-3 text-positive" />
                            ) : (
                              <MuteButton asChild size="sm">
                                <a
                                  href={`/org/settings?tab=calendar&orgId=${encodeURIComponent(workspace.workspaceId)}`}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  {c("새 탭에서 연결", "Connect in new tab")}
                                </a>
                              </MuteButton>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
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
                              onClick={() => setAvailabilityOpen(true)}
                              size="sm"
                              type="button"
                            >
                              {availability
                                ? c("수정", "Edit")
                                : c("가능 시간 설정", "Set availability")}
                            </MuteButton>
                          </div>
                        </div>
                      </div>
                      <OrgTemplatePicker
                        kind="interview"
                        onApply={(template) => {
                          setPurpose(template.meetingPurpose);
                          setDuration(template.durationMinutes);
                          setCandidateMessage(template.candidateMessage);
                        }}
                        value={{
                          candidateMessage: meetingMessage,
                          durationMinutes,
                          meetingPurpose,
                        }}
                        workspaceId={workspace.workspaceId}
                      />
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                        <label className="block">
                          <span className="text-neutral-muted">
                            {c("미팅 주제", "What you'll discuss")}
                          </span>
                          <Input
                            className="mt-1 text-[13px]"
                            maxLength={600}
                            onChange={(event) => setPurpose(event.target.value)}
                            placeholder={c(
                              "예: 서로의 기대를 맞추는 첫 대화",
                              "e.g. a first chat to align expectations"
                            )}
                            value={meetingPurpose}
                          />
                        </label>
                        <label className="block">
                          <span className="text-neutral-muted">
                            {c("길이", "Length")}
                          </span>
                          <Select
                            onValueChange={(value) =>
                              setDuration(Number(value))
                            }
                            value={String(durationMinutes)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue>
                                {c("{p0}분", "{p0} min", {
                                  p0: durationMinutes,
                                })}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent align="start">
                              {DURATIONS.map((minutes) => (
                                <SelectItem
                                  key={minutes}
                                  value={String(minutes)}
                                >
                                  {c("{p0}분", "{p0} min", { p0: minutes })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-neutral-muted">
                          {c("함께 전할 내용", "Details to share")}
                          <span className="text-neutral-soft">
                            {c(" · 선택", " · optional")}
                          </span>
                        </span>
                        <Textarea
                          className="mt-1 min-h-16 text-[13px]"
                          maxLength={2000}
                          onChange={(event) =>
                            setCandidateMessage(event.target.value)
                          }
                          rows={2}
                          value={meetingMessage}
                        />
                      </label>
                      <div>
                        <span className="text-neutral-muted">
                          {c("참석자", "Attendees")}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {teammateEmails.map((email) =>
                            memberChip({
                              email,
                              locked: email === myEmail,
                              lockedTitle: c(
                                "보내는 사람이라 항상 참석해요",
                                "You always attend as the sender"
                              ),
                              onToggle: () =>
                                toggle(attendees, setAttendees, email),
                              selected: attendees.includes(email),
                              selectedIcon: <Check className="size-3" />,
                              unselectedIcon: null,
                            })
                          )}
                        </div>
                      </div>
                      {stageId.startsWith("custom:") ? (
                        <p className="text-neutral-soft">
                          {c(
                            "보내면 이 단계의 다음 기본값으로 저장돼요.",
                            "These become this stage's defaults once sent."
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {expanded === "interview_preview" && invitationPreview ? (
                    <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-3">
                      <div className="font-medium text-neutral-primary">
                        {invitationPreview.subject}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-neutral-700">
                        {invitationPreview.body
                          .split(MEETING_INVITATION_LINK_MARKER)
                          .map((part, index) => (
                            <span key={index}>
                              {index > 0 ? (
                                <span className="text-blue-500 underline">
                                  {c("시간 고르기", "Pick a time")}
                                </span>
                              ) : null}
                              {part}
                            </span>
                          ))}
                      </div>
                      <p className="mt-2 border-t border-neutral-1000-a05 pt-2 text-neutral-soft">
                        {c(
                          "{p0}님에게 가는 메일 예시예요. 실제 문장은 Harper가 후보자에 맞게 다듬어요.",
                          "Example for {p0}. Harper adjusts the wording for each candidate.",
                          { p0: firstCandidate?.name ?? "" }
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>,
                interviewAllowed
                  ? undefined
                  : candidates.some(
                        (candidate) => candidate.stage !== "pending_connection"
                      )
                    ? c(
                        "연결 수락할 후보에게만 보낼 수 있어요",
                        "Only for candidates in Ready to connect"
                      )
                    : c(
                        "이 단계에서는 보낼 수 없어요",
                        "Not available for this stage"
                      )
              )}
              {actionRow(
                "intro_email",
                c("소개 메일 보내기", "Send an intro email"),
                c(
                  "나와 후보자를 한 메일로 이어요",
                  "One email introduces you and the candidate"
                ),
                <div className="space-y-2 text-[12px] leading-5">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        ["harper", c("Harper가 작성", "Written by Harper")],
                        ["team", c("직접 쓰기", "Write my own")],
                      ] as const
                    ).map(([writer, label]) => (
                      <MuteButton
                        aria-pressed={introWriter === writer}
                        className={cn(
                          introWriter === writer && "border-neutral-800"
                        )}
                        key={writer}
                        onClick={() => {
                          setIntroWriter(writer);
                          if (expanded === "intro_preview") setExpanded(null);
                        }}
                        size="sm"
                        type="button"
                        variant={introWriter === writer ? "neutral" : "default"}
                      >
                        {label}
                      </MuteButton>
                    ))}
                    {introWriter === "team" ? (
                      <span className="ml-1.5">
                        {linkButton(
                          expanded === "intro_preview"
                            ? c("편집", "Edit")
                            : c("미리보기", "Preview"),
                          "intro_preview"
                        )}
                      </span>
                    ) : null}
                  </div>
                  {introWriter === "team" && expanded !== "intro_preview" ? (
                    <OrgTemplatePicker
                      kind="intro_email"
                      onApply={(template) => {
                        setIntroSubject(template.subject);
                        setIntroBody(template.body);
                      }}
                      value={{ body: introBody, subject: introSubject }}
                      workspaceId={workspace.workspaceId}
                    />
                  ) : null}
                  <dl className="divide-y divide-neutral-1000-a05 overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-floating">
                    {mailRow(c("보낸 사람", "From"), "Harper")}
                    {mailRow(
                      c("받는 사람", "To"),
                      firstCandidate ? (
                        <>
                          {firstCandidate.name}
                          {firstCandidate.email ? (
                            <span className="break-all text-neutral-muted">
                              {` <${firstCandidate.email}>`}
                            </span>
                          ) : null}
                          {count > 1 ? (
                            <span className="text-neutral-muted">
                              {c(" 외 {p0}명", " and {p0} more", {
                                p0: count - 1,
                              })}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )
                    )}
                    {mailRow(
                      c("참조", "Cc"),
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span>{allCc.map(memberLabel).join(", ") || "—"}</span>
                        {linkButton(c("바꾸기", "Change"), "intro_cc")}
                      </span>
                    )}
                    {expanded === "intro_cc" ? (
                      <div className="flex flex-wrap gap-1.5 bg-bg-weak px-3 py-2.5">
                        {teammateEmails.map((email) =>
                          memberChip({
                            email,
                            locked: assigneeEmails.includes(email),
                            lockedTitle: c(
                              "역할 담당이라 항상 참조돼요",
                              "Role owners are always copied"
                            ),
                            onToggle: () =>
                              toggle(ccEmails, setCcEmails, email),
                            selected:
                              assigneeEmails.includes(email) ||
                              ccEmails.includes(email),
                            selectedIcon: <X className="size-3" />,
                          })
                        )}
                      </div>
                    ) : null}
                    {mailRow(
                      c("제목", "Subject"),
                      introWriter === "harper" ? (
                        <span className="text-neutral-muted">
                          {c(
                            "Harper가 후보자마다 정해요",
                            "Harper writes it for each candidate"
                          )}
                        </span>
                      ) : expanded === "intro_preview" && firstCandidate ? (
                        <span className="font-medium">
                          {fillOrgIntroTemplate(
                            introSubject,
                            introTemplateValues(firstCandidate.name)
                          )}
                        </span>
                      ) : (
                        <Input
                          aria-label={c(
                            "소개 메일 제목",
                            "Intro email subject"
                          )}
                          className="h-6 border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0"
                          maxLength={200}
                          onChange={(event) =>
                            setIntroSubject(event.target.value)
                          }
                          onFocus={() => setIntroField("subject")}
                          placeholder={c("제목", "Subject")}
                          ref={introSubjectRef}
                          value={introSubject}
                        />
                      )
                    )}
                    {mailRow(
                      c("내용", "Body"),
                      introWriter === "harper" ? (
                        <span className="text-neutral-muted">
                          {c(
                            "Harper가 두 분을 서로 소개해요. 회사와 역할, {p0}님의 관련 경험, 이 연결을 제안하는 이유를 짧게 담고 이 메일에서 바로 이야기를 이어가도록 안내해요.",
                            "Harper introduces you to each other: your company and role, {p0}'s relevant experience, and why this connection makes sense, then invites you both to continue in the same thread.",
                            { p0: firstCandidate?.name ?? "" }
                          )}
                        </span>
                      ) : expanded === "intro_preview" && firstCandidate ? (
                        <span className="whitespace-pre-wrap">
                          {appendOrgIntroCaptureDisclosure(
                            fillOrgIntroTemplate(
                              introBody,
                              introTemplateValues(firstCandidate.name)
                            )
                          )}
                        </span>
                      ) : (
                        <Textarea
                          aria-label={c("소개 메일 본문", "Intro email body")}
                          className="min-h-40 resize-y border-0 bg-transparent p-0 text-[13px] leading-5 shadow-none focus-visible:ring-0"
                          maxLength={8000}
                          onChange={(event) => setIntroBody(event.target.value)}
                          onFocus={() => setIntroField("body")}
                          ref={introBodyRef}
                          rows={8}
                          value={introBody}
                        />
                      )
                    )}
                  </dl>
                  {introWriter === "team" && expanded !== "intro_preview" ? (
                    <OrgIntroFieldHelp
                      body={introBody}
                      onFix={(from, to) => {
                        setIntroSubject((value) => value.split(from).join(to));
                        setIntroBody((value) => value.split(from).join(to));
                      }}
                      onInsert={(field) =>
                        introField === "subject"
                          ? insertAtCursor(
                              introSubjectRef.current,
                              field,
                              setIntroSubject
                            )
                          : insertAtCursor(
                              introBodyRef.current,
                              field,
                              setIntroBody
                            )
                      }
                      subject={introSubject}
                    />
                  ) : null}
                </div>
              )}
              {allowContactDirectly
                ? actionRow(
                    "direct_contact",
                    c("직접 연락하기", "Direct contact"),
                    c(
                      "Harper 메일 없이 단계만 옮겨요",
                      "Move without an email from Harper"
                    )
                  )
                : null}
            </div>
            {count > 1 && selectedAction !== "direct_contact" ? (
              <p className="mt-1.5 text-[12px] text-neutral-soft">
                {c(
                  "각 후보자에게 따로 가요. 서로의 정보는 보이지 않아요.",
                  "Each candidate gets their own email and can't see the others."
                )}
              </p>
            ) : null}
          </div>

          {introsNeeded > 0 ? (
            <p className="text-[12px] tabular-nums text-neutral-muted">
              {c("Intro {p0}개 사용", "Uses {p0}", {
                p0:
                  locale === "en"
                    ? formatIntroCount(introsNeeded, locale)
                    : introsNeeded,
              })}
              {introSlot ? (
                <>
                  {" · "}
                  {c("이번 달 {p0} 남음", "{p0} left this month", {
                    p0: formatIntroCount(introSlot.remaining, locale),
                  })}
                </>
              ) : null}
            </p>
          ) : null}

          {issues.length ? (
            <ul
              className="space-y-1 rounded-md bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical"
              role="alert"
            >
              {issues.map((issue) => (
                <li key={issue.key}>
                  {issue.text}
                  {issue.fix ? (
                    <>
                      {" "}
                      <button
                        className="underline underline-offset-2"
                        onClick={issue.fix}
                        type="button"
                      >
                        {c("열기", "Open")}
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </TalentCareerModal>
      {availabilityOpen ? (
        <OrgInterviewAvailabilityDialog
          onRequestClose={() => setAvailabilityOpen(false)}
          open
          userId={currentUser?.userId ?? ""}
          workspaceId={workspace.workspaceId}
        />
      ) : null}
    </>
  );
}
