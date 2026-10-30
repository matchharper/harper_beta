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
  ORG_INTRO_TEMPLATE_FIELDS,
  ORG_MEETING_DURATIONS,
} from "@/lib/org/messageTemplates";
import { OrgTemplatePicker } from "./OrgTemplatePicker";
import { insertAtCursor, OrgIntroFieldHelp } from "./OrgIntroFieldHelp";

export type OrgStageMoveCandidate = {
  email: string | null;
  name: string;
  processClosureNoticeUnresolved?: boolean;
  recommendationId: string;
  stage: OrgStageId;
};

export type OrgStageMoveAction = "intro_email" | "direct_contact";

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
  /** The intro email carries an interview booking link. */
  bookingLink: boolean;
  options: (candidate: OrgStageMoveCandidate) => OrgStageChangeOptions;
  stage: OrgStageId;
  stageLabel: string;
};

const BOOKING_FIELD = ORG_INTRO_TEMPLATE_FIELDS.bookingLink;

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
 * One form for moving one or several candidates to a stage. Harper sends one
 * intro email that connects the candidate with the team and, once Google
 * Calendar is set up, carries a link to pick an interview time (with
 * Harper's reminder if no time is picked).
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
  // The column the candidates go to: 연결됨 from the accept buttons, or the
  // column a card was dropped on. There is nothing to choose here.
  const stageId: OrgStageId = targetStages.some(
    (stage) => stage.id === initialStage
  )
    ? initialStage
    : (targetStages[0]?.id ?? initialStage);
  const stage = targetStages.find((item) => item.id === stageId);
  const stageLabel = (() => {
    const label = stage?.label.trim() ?? "";
    const prefix = `${roleTitle.trim()} · `;
    return roleTitle.trim() && label.startsWith(prefix)
      ? label.slice(prefix.length)
      : label;
  })();
  const stageDefaults = stage?.meetingDefaults ?? null;
  // A booking link goes only with a first connection.
  const bookingAllowed =
    count > 0 &&
    candidates.every((candidate) => candidate.stage === "pending_connection") &&
    (stageId === "connected" || stageId.startsWith("custom:"));

  const [action, setAction] = useState<OrgStageMoveAction>("intro_email");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const meetingPurpose =
    purpose ??
    stageDefaults?.meetingPurpose ??
    c(
      "서로를 알아 가는 첫 대화",
      "A first conversation to get to know each other"
    );
  const durationMinutes =
    duration ??
    stageDefaults?.durationMinutes ??
    DEFAULT_INTERVIEW_DURATION_MINUTES;

  const [expanded, setExpanded] = useState<
    "booking" | "intro_cc" | "intro_preview" | null
  >(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [attendees, setAttendees] = useState<string[]>(() =>
    myEmail ? [myEmail] : []
  );
  const [ccEmails, setCcEmails] = useState<string[]>(() =>
    myEmail ? [myEmail] : []
  );
  // Keep Harper as the default while the writer selector is hidden.
  const [introWriter] = useState<"harper" | "team">("harper");
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
      "{후보자 이름}님, 안녕하세요.\n\n{회사 이름}에서 {역할}을 함께할 분을 찾고 있는 {내 이름}님을 소개해 드려요. {후보자 이름}님이 이 역할에 관심을 보여 주셔서 두 분을 연결해 드리게 됐어요.\n\n이 메일에 답장하며 바로 이야기를 이어가 주세요.\n\n{면접 예약 링크}\n\nHarper 드림",
      "Hi {후보자 이름},\n\nI'd like to introduce {내 이름} from {회사 이름}, who is hiring for {역할}. Since you showed interest in this role, I'm connecting you both here.\n\nPlease reply to this email to continue the conversation.\n\n{면접 예약 링크}\n\nBest,\nHarper"
    )
  );

  const { statusQuery: calendarQuery } = useOrgGoogleCalendar({
    enabled: open && bookingAllowed,
    userId: currentUser?.userId ?? "",
    workspaceId: workspace.workspaceId,
  });
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: open && bookingAllowed,
    workspaceId: workspace.workspaceId,
  });
  const calendarConnected = calendarQuery.data?.status === "active";
  const availability = availabilityQuery.data?.availability ?? null;
  // Loading, not pending: a check that cannot run (no signed-in member)
  // never finishes and would keep Accept disabled.
  const setupLoading =
    bookingAllowed && (calendarQuery.isLoading || availabilityQuery.isLoading);
  const bookingReady =
    bookingAllowed &&
    !setupLoading &&
    calendarConnected &&
    Boolean(availability);
  const sendsEmail = action === "intro_email";
  const bookingLink = sendsEmail && bookingReady;
  const introTemplateValues = (candidateName: string) => ({
    // The server puts the real link here, or drops the field without one.
    bookingLink: bookingLink ? BOOKING_FIELD : "",
    candidateName,
    companyName: workspace.companyName,
    roleName: roleTitle,
    senderName: myName,
  });

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
  if (sendsEmail && missingEmail.length) {
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
  if (
    sendsEmail &&
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
    sendsEmail && introWriter === "team"
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
  if (sendsEmail && allCc.length === 0) {
    issues.push({
      fix: () => setExpanded("intro_cc"),
      key: "cc",
      text: c(
        "소개 메일에 함께 넣을 팀원을 1명 이상 골라 주세요.",
        "Choose at least one teammate for the intro email."
      ),
    });
  }
  // Why the intro goes without a booking link. Shown with the issues below,
  // but it does not stop the move.
  const bookingNotice =
    sendsEmail && bookingAllowed && !setupLoading && !bookingReady
      ? calendarConnected
        ? c(
            "인터뷰 가능 시간이 설정되지 않아 링크 없이 소개 메일만 보내요",
            "No interview availability is set, so only the intro email goes, without a link"
          )
        : c(
            "Google Calendar가 연결되지 않아 링크 없이 소개 메일만 보내요",
            "Google Calendar isn't connected, so only the intro email goes, without a link"
          )
      : null;
  // While the Calendar check runs it is not yet known whether the link goes.
  const blocked = !stage || issues.length > 0 || (sendsEmail && setupLoading);

  const resetEdits = () => {
    setAction("intro_email");
    setPurpose(null);
    setDuration(null);
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
    const attendeeEmails = [...attendees];
    const introEmails = [...ccEmails];
    const companyName = workspace.companyName;
    const template =
      introWriter === "team"
        ? { body: introBody.trim(), subject: introSubject.trim() }
        : null;
    const withLink = bookingLink;
    onSubmit({
      action,
      bookingLink: withLink,
      options: (candidate) =>
        action === "direct_contact"
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
              ...(withLink
                ? {
                    attendeeEmails,
                    durationMinutes,
                    introBookingLink: true,
                    meetingPurpose: purposeText,
                    title: buildDefaultInterviewTitle({
                      candidateName: candidate.name,
                      companyName,
                    }),
                  }
                : {}),
            },
      stage: stage.id,
      stageLabel,
    });
    resetEdits();
  };

  const firstCandidate = candidates[0];
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
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-2 px-3 py-2">
      <dt className="pt-px text-neutral-soft">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-5 text-neutral-primary">
        {value}
      </dd>
    </div>
  );

  const bookingSummary = [
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
  const linkWords = c(
    "인터뷰 가능 시간 선택하기",
    "Select your interview availability"
  );

  // Calendar, open times and what the meeting is for: under the link, or
  // under the notice when the link is left out.
  const bookingSettings = (
    <div className="space-y-3 rounded-md bg-bg-weak p-3 text-[12px] leading-5">
      <div className="flex items-start gap-2 text-neutral-muted">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span>
              {calendarConnected
                ? c("Google Calendar 연결됨", "Google Calendar connected")
                : c("Google Calendar 연결 필요", "Connect Google Calendar")}
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
                ? formatOrgMeetingAvailabilitySummary(availability, c)
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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
        <label className="block">
          <span className="text-neutral-muted">
            {c("미팅 주제", "What you'll discuss")}
          </span>
          <Input
            className="mt-1 text-[13px]"
            maxLength={600}
            onChange={(event) => setPurpose(event.target.value)}
            value={meetingPurpose}
          />
        </label>
        <label className="block">
          <span className="text-neutral-muted">{c("길이", "Length")}</span>
          <Select
            onValueChange={(value) => setDuration(Number(value))}
            value={String(durationMinutes)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue>
                {c("{p0}분", "{p0} min", { p0: durationMinutes })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {ORG_MEETING_DURATIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {c("{p0}분", "{p0} min", { p0: minutes })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div>
        <span className="text-neutral-muted">{c("참석자", "Attendees")}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {teammateEmails.map((email) =>
            memberChip({
              email,
              locked: email === myEmail,
              lockedTitle: c(
                "보내는 사람이라 항상 참석해요",
                "You always attend as the sender"
              ),
              onToggle: () => toggle(attendees, setAttendees, email),
              selected: attendees.includes(email),
              selectedIcon: <Check className="size-3" />,
              unselectedIcon: null,
            })
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-neutral-muted">
        <CornerDownRight className="size-3.5 shrink-0" />
        {c(
          "3일 안에 시간을 고르지 않으면 Harper가 한 번 다시 안내해요",
          "If no time is picked in 3 days, Harper follows up once"
        )}
      </div>
    </div>
  );

  // The team's body as the candidate will read it, with the link's words.
  const previewBody = (text: string) => {
    const filled = appendOrgIntroCaptureDisclosure(text);
    const withField =
      bookingLink && !filled.includes(BOOKING_FIELD)
        ? `${filled.trimEnd()}\n\n${BOOKING_FIELD}`
        : filled;
    return withField.split(BOOKING_FIELD).map((part, index) => (
      <span key={index}>
        {index > 0 ? (
          <span className="text-blue-500 underline">{linkWords}</span>
        ) : null}
        {part}
      </span>
    ));
  };

  // The email's last line: the link as the candidate sees it. In the team's
  // preview the link already sits in the body.
  const linkInBody = introWriter === "team" && expanded === "intro_preview";
  const bookingLine =
    bookingAllowed && (setupLoading || bookingReady) ? (
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        {setupLoading ? (
          <span className="text-neutral-muted">
            {c("캘린더를 확인하고 있어요", "Checking your calendar")}
          </span>
        ) : (
          <>
            {linkInBody ? null : (
              <span className="text-blue-500 underline underline-offset-2">
                {linkWords}
              </span>
            )}
            <span className="text-neutral-muted">{bookingSummary}</span>
            {linkButton(c("설정", "Settings"), "booking")}
          </>
        )}
      </div>
    ) : null;

  const introEmail = (
    <div className="space-y-2 text-[12px] leading-5">
      {/* <div className="flex items-center gap-1.5">
        {(
          [
            ["harper", c("Harper가 작성", "Written by Harper")],
            ["team", c("직접 쓰기", "Write my own")],
          ] as const
        ).map(([writer, label]) => (
          <MuteButton
            aria-pressed={introWriter === writer}
            key={writer}
            onClick={() => {
              setIntroWriter(writer);
              if (expanded === "intro_preview") setExpanded(null);
            }}
            size="sm"
            type="button"
            variant={introWriter === writer ? "selected" : "default"}
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
      </div> */}
      {introWriter === "team" && expanded !== "intro_preview" ? (
        <OrgTemplatePicker
          kind="intro_email"
          onApply={(template) => {
            setIntroSubject(template.subject);
            setIntroBody(template.body);
            if (template.meetingPurpose) setPurpose(template.meetingPurpose);
            setDuration(template.durationMinutes);
          }}
          value={{
            body: introBody,
            durationMinutes,
            meetingPurpose,
            subject: introSubject,
          }}
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
                onToggle: () => toggle(ccEmails, setCcEmails, email),
                selected:
                  assigneeEmails.includes(email) || ccEmails.includes(email),
                selectedIcon: <X className="size-3" />,
              })
            )}
          </div>
        ) : null}
        {/* {mailRow(
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
              aria-label={c("소개 메일 제목", "Intro email subject")}
              className="h-6 border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0"
              maxLength={200}
              onChange={(event) => setIntroSubject(event.target.value)}
              onFocus={() => setIntroField("subject")}
              placeholder={c("제목", "Subject")}
              ref={introSubjectRef}
              value={introSubject}
            />
          )
        )} */}
        {mailRow(
          c("내용", "Body"),
          <>
            {introWriter === "harper" ? (
              <span className="text-neutral-muted">
                {c(
                  "Harper가 두 분을 서로 소개해요. 회사와 역할, {p0}님의 관련 경험, 이 연결을 제안하는 이유를 짧게 담고 이 메일에서 바로 이야기를 이어가도록 안내해요.",
                  "Harper introduces you to each other: your company and role, {p0}'s relevant experience, and why this connection makes sense, then invites you both to continue in the same thread.",
                  { p0: firstCandidate?.name ?? "" }
                )}
                {/* The booking link goes in Harper's email too. */}
                {bookingAllowed
                  ? ` ${
                      bookingLink
                        ? c(
                            "메일 끝에는 아래 면접 예약 링크를 함께 넣어요.",
                            "The booking link below goes at the end."
                          )
                        : c(
                            "면접 예약 링크를 설정해 두었다면 메일 끝에 함께 넣어요.",
                            "If you've set up the booking link, it goes at the end."
                          )
                    }`
                  : null}
              </span>
            ) : expanded === "intro_preview" && firstCandidate ? (
              <span className="whitespace-pre-wrap">
                {previewBody(
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
            )}
            {bookingLine}
            {bookingLink && expanded === "booking" ? (
              <div className="mt-2">{bookingSettings}</div>
            ) : null}
          </>
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
              ? insertAtCursor(introSubjectRef.current, field, setIntroSubject)
              : insertAtCursor(introBodyRef.current, field, setIntroBody)
          }
          subject={introSubject}
        />
      ) : null}
    </div>
  );

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
              {c("연결 수락", "Accept Intro")}
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
          {allowContactDirectly ? (
            // Harper staff can also move without any email.
            <div className="divide-y divide-neutral-1000-a05 rounded-lg border border-neutral-1000-a05 bg-bg-default">
              {(
                [
                  ["intro_email", c("소개 메일 보내기", "Send an intro email")],
                  [
                    "direct_contact",
                    c(
                      "직접 연락하기 · Harper 메일 없이 옮기기",
                      "Direct contact · move without an email"
                    ),
                  ],
                ] as const
              ).map(([value, label]) => (
                <label
                  className="relative flex cursor-pointer items-center gap-2.5 overflow-hidden px-3 py-2.5 text-[13px]"
                  key={value}
                >
                  {value === "direct_contact" ? <InternalOnlyHatch /> : null}
                  <Radio
                    checked={action === value}
                    name={`${formId}-action`}
                    onChange={() => {
                      setAction(value);
                      setExpanded(null);
                    }}
                    size="medium"
                    value={value}
                  />
                  <span className="relative">{label}</span>
                </label>
              ))}
            </div>
          ) : null}
          {sendsEmail ? introEmail : null}
          {sendsEmail && count > 1 ? (
            <p className="text-[12px] text-neutral-soft">
              {c(
                "각 후보자에게 따로 가요. 서로의 정보는 보이지 않아요.",
                "Each candidate gets their own email and can't see the others."
              )}
            </p>
          ) : null}

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

          {issues.length || bookingNotice ? (
            <ul
              className={cn(
                "space-y-1 rounded-md bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical",
                issues.length + (bookingNotice ? 1 : 0) > 1 && "list-disc pl-7"
              )}
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
              {bookingNotice ? (
                <li>
                  {bookingNotice}{" "}
                  <button
                    aria-expanded={expanded === "booking"}
                    className="underline underline-offset-2"
                    onClick={() =>
                      setExpanded(expanded === "booking" ? null : "booking")
                    }
                    type="button"
                  >
                    {c("설정", "Settings")}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
          {bookingNotice && expanded === "booking" ? bookingSettings : null}
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
