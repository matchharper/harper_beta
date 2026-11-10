import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronLeft,
  GraduationCap,
  Inbox,
  X,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { LinkedinLogo } from "@/components/common/BrandLogos";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
import type { OrgCandidateSort } from "@/lib/org/candidateBoardSort";
import { sortExternalCandidates } from "@/lib/org/externalCandidateSort";
import type { ExternalCandidateView, ExternalCandidatesResponse } from "@/lib/org/agent/externalSourcing";
import {
  isExternalSearchRunning,
  useOrgExternalCandidateActions,
  useOrgExternalCandidates,
} from "@/hooks/org/useOrgExternalCandidates";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import type { OrgMember } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";
import { CompanyIntroRequestDialog } from "./CompanyIntroDecisionDialogs";
import { OrgListFitCell, OrgListProfileLabelCell } from "./OrgInboxListTable";
import { OrgPassPopover } from "./OrgPassPopover";
import { OrgCandidateReviewContent } from "./OrgCandidateReviewContent";
import { OrgCandidateReviewHeader } from "./OrgCandidateReviewHeader";
import { OrgTalentProfileContent } from "./OrgTalentProfile";
import { TalentDetailPager } from "./TalentDetailPager";
import { ORG_CANDIDATE_SHEET_GRID, ORG_CANDIDATE_SHEET_PROPS } from "./candidateDetailSheet";
import {
  getOrgTalentDetailNavigationState,
  type OrgTalentDetailNavigationState,
  type OrgTalentDetailNavigationTarget,
} from "@/lib/org/detailNavigation";
import { OrgCandidateBoardCanvas } from "./OrgCandidateBoardCanvas";
import { OrgRoleTalentBoardCard } from "./OrgRoleTalentBoard";
import {
  OrgCandidateListContext,
  OrgRoleCandidateCard,
} from "./role-screen/OrgRoleCandidateCard";
import { ReviewEmptyState } from "./OrgHomeInbox";
import { OrgErrorState } from "./workspace/OrgErrorState";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import {
  externalBoardItem,
  externalCriteriaOrder,
  externalCandidateCanSendIntro,
  externalCandidateWithoutEmail,
  externalProfileDetail,
} from "./externalCandidateAdapters";

type Copy = ReturnType<typeof useOrgLocale>["c"];

/** One look for every state (same text style); `at` is shown on hover. */
type ExternalStatus = { label: string; at: string | null };

function introStatus(intro: NonNullable<ExternalCandidateView["intro"]>, c: Copy): ExternalStatus {
  switch (intro.status) {
    case "requested":
    case "sending":
    case "invited":
      // Read = first open of the invitation email (open tracking; approximate).
      return intro.openedAt
        ? { label: c("연결 요청 읽음", "Request read"), at: intro.openedAt }
        : { label: c("연결 요청함", "Connection requested"), at: intro.invitedAt ?? intro.requestedAt };
    case "replied":
      return {
        label: intro.replyType === "interested" ? c("관심 있다고 답함", "Replied: interested")
          : intro.replyType === "question" ? c("질문으로 답함", "Replied with a question")
          : c("답장 옴", "Replied"),
        at: null,
      };
    case "accepted":
    case "connecting":
      return { label: c("연결 중", "Connecting"), at: null };
    case "connected":
      // The person confirmed and Harper introduced them by email (CC the company recipients).
      return { label: c("연결됨", "Connected"), at: intro.connectedAt ?? null };
    case "declined":
      return { label: c("거절함", "Declined"), at: null };
    case "unsubscribed":
      return { label: c("연락 거부", "Opted out"), at: null };
    case "bounced":
      return { label: c("메일 전달 안 됨", "Not delivered"), at: null };
    case "not_sendable":
    case "failed":
      // A failed introduction (after the person confirmed) is told apart from a failed invitation.
      return intro.acceptedAt
        ? { label: c("연결 메일 못 보냄", "Introduction not sent"), at: null }
        : { label: c("초대 메일 못 보냄", "Invitation not sent"), at: null };
    case "cancelled":
      return { label: c("연결 요청 취소됨", "Request cancelled"), at: null };
    default:
      return { label: c("연결 요청함", "Connection requested"), at: intro.requestedAt };
  }
}

/** The connection state, or "no email" for a person Harper cannot contact; null while Request intro applies. */
function externalStatus(person: ExternalCandidateView, c: Copy): ExternalStatus | null {
  if (person.intro) return introStatus(person.intro, c);
  return externalCandidateWithoutEmail(person) ? { label: c("이메일을 찾지 못했어요", "No email found"), at: null } : null;
}

/** The state in Request intro's place: shaped like the button, not clickable. */
function ExternalStatusButton({ person, className }: { person: ExternalCandidateView; className: string }) {
  const { c, locale } = useOrgLocale();
  const status = externalStatus(person, c);
  if (!status) return null;
  return (
    // aria-disabled neutral is the design system's non-clickable state; the muted text marks it as a status.
    <MuteButton
      aria-disabled
      className={className}
      size="md"
      tabIndex={-1}
      title={status.at ? new Date(status.at).toLocaleString(locale) : undefined}
      variant="neutral"
    >
      <span className="text-neutral-muted">{status.label}</span>
    </MuteButton>
  );
}

/**
 * Request intro's place: the person's LinkedIn profile when Harper found no email for them (the company can
 * reach out there), otherwise the connection state.
 */
function ExternalSendIntroSlot({ person, className }: { person: ExternalCandidateView; className: string }) {
  const { c } = useOrgLocale();
  if (!externalCandidateWithoutEmail(person) || !person.linkedinUrl) {
    return <ExternalStatusButton person={person} className={className} />;
  }
  return (
    <MuteButton asChild className={className} size="md" variant="default">
      <a href={person.linkedinUrl} rel="noopener noreferrer" target="_blank">
        <LinkedinLogo className="size-4" />
        {c("LinkedIn에서 보기", "View on LinkedIn")}
        <ArrowUpRight aria-hidden className="size-4 text-neutral-muted" />
      </a>
    </MuteButton>
  );
}

/** For members who cannot decide (no buttons): the same state as a badge. */
function ExternalStatusBadge({ person }: { person: ExternalCandidateView }) {
  const { c, locale } = useOrgLocale();
  const status = externalStatus(person, c);
  if (!status) return null;
  return (
    <Badge size="md" tone="neutral" variant="faded"
      title={status.at ? new Date(status.at).toLocaleString(locale) : undefined}>
      {status.label}
    </Badge>
  );
}

function openLink(link?: string | null) {
  if (link) window.open(link, "_blank", "noopener,noreferrer");
}

/**
 * 외부 후보 as a list, drawn like the inbox list: one row per person, a column
 * per criterion, the latest job and school, the connection state and when
 * Harper showed them. A row opens the person, where the decisions are.
 */
export function OrgExternalCandidateList({
  candidates,
  criteria,
  onOpen,
  roleId,
}: {
  candidates: readonly ExternalCandidateView[];
  /** Short criterion names, one column each (externalCriteriaOrder). */
  criteria: readonly string[];
  onOpen: (person: ExternalCandidateView) => void;
  roleId: string;
}) {
  const { c, locale } = useOrgLocale();
  const rowCell = "border-b border-neutral-1000-a05 bg-bg-default align-middle group-hover/row:bg-bg-weak";
  return (
    <div
      className="relative overflow-x-auto pb-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-400 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-2"
      data-org-external-list=""
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[12px] text-neutral-muted [&>th]:align-bottom">
            <th className="sticky left-0 z-10 min-w-56 border-b border-r border-neutral-1000-a05 bg-bg-default py-2.5 pl-2 pr-4 font-normal">
              {c("후보자", "Candidate")}
            </th>
            {criteria.map((name) => (
              <th
                className="min-w-24 max-w-36 border-b border-neutral-1000-a05 px-2 py-2.5 font-normal leading-4 break-keep"
                key={name}
                title={name}
              >
                {name}
              </th>
            ))}
            <th className="min-w-52 border-b border-neutral-1000-a05 px-3 py-2.5 font-normal">
              {c("회사", "Company")}
            </th>
            <th className="min-w-52 border-b border-neutral-1000-a05 px-3 py-2.5 font-normal">
              {c("학교", "School")}
            </th>
            <th className="min-w-32 border-b border-neutral-1000-a05 px-3 py-2.5 font-normal">
              {c("상태", "Status")}
            </th>
            <th className="w-20 border-b border-neutral-1000-a05 px-3 py-2.5 text-right font-normal">
              <span className="sr-only">{c("날짜", "Date")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((person) => {
            const item = externalBoardItem(person, roleId, criteria);
            const status = externalStatus(person, c);
            return (
              <tr className="group/row cursor-pointer" key={person.id} onClick={() => onOpen(person)}>
                <td className={`${rowCell} sticky left-0 z-10 border-r py-4 pl-2 pr-4`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-weak text-sm text-neutral-muted">
                      {person.name.slice(0, 1) || "·"}
                    </span>
                    <div className="min-w-0">
                      <button
                        className="block max-w-56 truncate text-left text-[14px] font-medium text-neutral-primary outline-none focus-visible:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(person);
                        }}
                        type="button"
                      >
                        {person.name}
                      </button>
                      {person.location ? (
                        <div className="mt-0.5 max-w-56 truncate text-[12px] text-neutral-muted">
                          {person.location}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                {criteria.map((name) => (
                  <td
                    className={`${rowCell} px-2 py-4`}
                    key={name}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <OrgListFitCell
                      evaluation={item.criteriaEvaluations.find((evaluation) => evaluation.name === name)}
                    />
                  </td>
                ))}
                <td className={`${rowCell} max-w-64 px-3 py-4`}>
                  <OrgListProfileLabelCell icon={BriefcaseBusiness} label={item.talent.recentCompanies[0]} />
                </td>
                <td className={`${rowCell} max-w-64 px-3 py-4`}>
                  <OrgListProfileLabelCell icon={GraduationCap} label={item.talent.recentSchools[0]} />
                </td>
                <td
                  className={`${rowCell} px-3 py-4 text-[13px] text-neutral-muted`}
                  title={status?.at ? new Date(status.at).toLocaleString(locale) : undefined}
                >
                  {status?.label ?? <span className="text-neutral-soft">—</span>}
                </td>
                <td className={`${rowCell} px-3 py-4 text-right text-[12px] text-neutral-soft`}>
                  {formatKstRelativeDate(person.shownAt, { locale })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Company decisions on a shown person; the container wires them to the API, the playground to local state. */
export type ExternalCandidateActions = {
  canManage: boolean;
  members: Pick<OrgMember, "email" | "name" | "userId">[];
  defaultEmail: string | null;
  pass: (candidateId: string, reason: string) => Promise<unknown>;
  requestIntro: (candidateId: string, input: { companyAppeal: string; introRecipientEmails: string[] }) => Promise<unknown>;
  pending: boolean;
};

/**
 * The Role's "외부 후보" tab: the shared candidate card, decision buttons and profile body for people outside
 * Harper. The selected person is kept in the URL (externalCandidateId).
 */
/** Pass and Request intro (or the state in its place), as on the person's card. */
function ExternalDecision({
  canManage,
  className,
  onPass,
  onRequest,
  pending,
  person,
}: {
  canManage: boolean;
  className?: string;
  onPass: (reason: string) => Promise<void>;
  onRequest: () => void;
  pending: boolean;
  person: ExternalCandidateView;
}) {
  const { c } = useOrgLocale();
  const [passOpen, setPassOpen] = useState(false);
  if (!canManage) return <ExternalStatusBadge person={person} />;
  return (
    <div className={className}>
      <OrgPassPopover
        key={person.id}
        open={passOpen}
        onOpenChange={setPassOpen}
        onSubmit={onPass}
        pending={pending}
        shortcut={false}
      />
      {externalCandidateCanSendIntro(person) ? (
        <MuteButton disabled={pending} onClick={onRequest} size="md" variant="dark">
          {c("연결 요청", "Request intro")}
        </MuteButton>
      ) : (
        <ExternalSendIntroSlot person={person} className="w-full whitespace-nowrap" />
      )}
    </div>
  );
}

/**
 * 전체 프로필 of a person outside Harper in the split view: the same sheet as
 * everyone else's (TalentDetailSimpleView) — the profile, then the decision in
 * the side column (in the header on a phone), with 이전/다음 through the list.
 * There is no activity to show: Harper has not talked with them.
 */
function ExternalCandidateSheet({
  canManage,
  criteriaOrder,
  navigation,
  onClose,
  onNavigate,
  onPass,
  onRequest,
  pending,
  person,
}: {
  canManage: boolean;
  criteriaOrder: readonly string[];
  navigation: OrgTalentDetailNavigationState<OrgTalentDetailNavigationTarget> | null;
  onClose: () => void;
  onNavigate: (target: OrgTalentDetailNavigationTarget | null) => void;
  onPass: (reason: string) => Promise<void>;
  onRequest: () => void;
  pending: boolean;
  person: ExternalCandidateView;
}) {
  const { c } = useOrgLocale();
  const detail = externalProfileDetail(person, criteriaOrder);
  const decision = (className: string) => (
    <ExternalDecision
      canManage={canManage}
      className={className}
      onPass={onPass}
      onRequest={onRequest}
      pending={pending}
      person={person}
    />
  );
  return (
    <TalentCareerModal
      open
      onClose={onClose}
      ariaLabel={person.name}
      showCloseButton={false}
      {...ORG_CANDIDATE_SHEET_PROPS}
    >
      <div className="shrink-0 border-b border-neutral-1000-a05 bg-bg-default md:hidden">
        <div className="flex min-h-12 w-full min-w-0 items-center justify-between gap-1 px-2">
          <div className="flex shrink-0 items-center gap-1">
            <MuteButton
              aria-label={c("닫기", "Close")}
              className="rounded-pill px-1"
              onClick={onClose}
              size="md"
              type="button"
              variant="transparent"
            >
              <ChevronLeft aria-hidden className="size-4.5" />
            </MuteButton>
            {navigation ? (
              <TalentDetailPager compact navigation={navigation} onNavigate={onNavigate} />
            ) : null}
          </div>
          {decision(
            "flex min-w-0 items-center gap-1 [&_a]:px-2 [&_a]:text-[13px] [&_button]:whitespace-nowrap [&_button]:px-2 [&_button]:text-[13px]"
          )}
        </div>
      </div>
      <div className="hidden shrink-0 items-center justify-between border-b border-neutral-1000-a05 px-5 py-3 font-normal md:flex">
        {navigation ? (
          <TalentDetailPager navigation={navigation} onNavigate={onNavigate} />
        ) : (
          <div className="min-w-0 truncate text-[14px] font-normal text-neutral-primary">
            {person.name}
          </div>
        )}
        <MuteButton
          aria-label={c("닫기", "Close")}
          onClick={onClose}
          size="md"
          type="button"
          variant="transparent"
        >
          <X aria-hidden className="size-4" />
        </MuteButton>
      </div>
      <div className={ORG_CANDIDATE_SHEET_GRID}>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <OrgTalentProfileContent
            detail={detail}
            onResumeClick={(_kind, link) => openLink(link)}
            footer={
              <p className="text-[13px] text-neutral-muted">
                {c(
                  "Harper에 가입하지 않은 사람이에요. 공개된 정보로만 평가했어요.",
                  "This person hasn’t joined Harper. They were assessed from public information only."
                )}
              </p>
            }
          />
        </div>
        <div className="hidden min-h-0 overflow-y-auto border-l border-neutral-1000-a05 bg-bg-default px-5 pt-5 pb-20 md:block">
          {canManage ? (
            <section className="rounded-md border border-neutral-1000-a05 bg-bg-default px-4 py-4">
              {decision("grid grid-cols-2 gap-2")}
            </section>
          ) : (
            decision("")
          )}
        </div>
      </div>
    </TalentCareerModal>
  );
}

/**
 * grid · list · board (포스트잇) are the wide view's; rows is the split view's
 * list of folded cards, the same as its other candidate tabs.
 */
export type OrgExternalCandidatesLayout = "grid" | "list" | "board" | "rows";

const NO_BOARD_SELECTION: ReadonlySet<string> = new Set();

export function OrgExternalCandidatesView({ data, roleId, roleCriteria, workspaceId, actions, sort, view = "grid" }: {
  data: ExternalCandidatesResponse; roleId: string; actions?: ExternalCandidateActions;
  /** The Role's current criteria names: marks follow them, and criteria outside them are left out. */
  roleCriteria?: readonly string[] | null;
  /** Needed for the board, which keeps the team's card spots for the Role. */
  workspaceId?: string;
  /** Left out, the server's order (newest search first) stays. */
  sort?: OrgCandidateSort;
  view?: OrgExternalCandidatesLayout;
}) {
  const router = useRouter();
  const { c, locale } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const rootRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const [introFor, setIntroFor] = useState<ExternalCandidateView | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  // rows: one card open at a time, like the other tabs. No "Harper에게 묻기":
  // people outside Harper have no profile Harper can be asked about by mention.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const rowList = useMemo(
    () => ({
      expandedId: openRowId,
      onToggle: (id: string) => setOpenRowId((current) => (current === id ? null : id)),
    }),
    [openRowId]
  );
  const selectedId = typeof router.query.externalCandidateId === "string" ? router.query.externalCandidateId : null;
  const candidates = sort ? sortExternalCandidates(data.candidates, sort) : data.candidates;
  const criteriaOrder = useMemo(
    () => externalCriteriaOrder(data.candidates, roleCriteria),
    [data.candidates, roleCriteria]
  );
  const selected = selectedId ? candidates.find((person) => person.id === selectedId) ?? null : null;
  const selectedKey = selected?.id ?? null;
  const canManage = Boolean(actions?.canManage);
  const pending = Boolean(actions?.pending);
  const scroller = () => rootRef.current?.closest<HTMLElement>("[data-org-review-scroll]") ?? document.scrollingElement;

  // The detail opens at the top; Back restores the list position. The split
  // view's sheet opens over the list, which stays where it was.
  const inPlace = view !== "rows";
  useLayoutEffect(() => {
    if (!inPlace) return;
    const element = rootRef.current?.closest<HTMLElement>("[data-org-review-scroll]") ?? document.scrollingElement;
    element?.scrollTo({ top: selectedKey ? 0 : listScrollTop.current });
  }, [inPlace, selectedKey]);

  const select = (id: string | null) => {
    if (id && inPlace) listScrollTop.current = scroller()?.scrollTop ?? 0;
    const query = { ...router.query };
    if (id) query.externalCandidateId = id;
    else delete query.externalCandidateId;
    void router.push({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  };
  const pass = async (person: ExternalCandidateView, reason: string) => {
    await actions?.pass(person.id, reason);
    if (selectedKey === person.id) select(null);
  };

  const introDialog = actions ? (
    <CompanyIntroRequestDialog
      key={introFor?.id ?? "closed"}
      candidateName={introFor?.name ?? ""}
      defaultEmail={actions.defaultEmail}
      members={actions.members}
      note={data.inviteSending
        ? (
          <>
            {c(
              "Harper가 이 분께 위 관심 이유와 역할을 담은 초대 메일을 한 통 보내요. 이 분이 메일에서 연결을 확인하면, Harper가 이 분과 요청하신 분, 위에서 고른 이메일을 한 메일로 연결해요. 답장이 오면 알려드릴게요.",
              "Harper emails this person one invitation with the reason above and the Role. If they confirm the connection from that email, Harper introduces them to you and the emails chosen above in one email. You’ll hear when they reply."
            )}
            <p className="mt-1">{ct(c, COMPANY_TERMS.caption.externalRequestUsesIntro)}</p>
          </>
        )
        : c(
            "지금은 연결 요청만 기록되고, 이 분께 메일은 나가지 않아요.",
            "For now the request is only recorded; no email goes to this person."
          )}
      onClose={() => setIntroFor(null)}
      onSubmit={async ({ companyAppeal, introRecipientEmails }) => {
        if (!introFor) return;
        await actions.requestIntro(introFor.id, { companyAppeal, introRecipientEmails });
        setIntroFor(null);
        addToast({ message: c("연결을 요청했어요.", "Connection requested."), variant: "success" });
      }}
      open={Boolean(introFor)}
      pending={pending}
    />
  ) : null;

  const boardItems = candidates.map((person) => externalBoardItem(person, roleId, criteriaOrder));
  const byBoardId = new Map(boardItems.map((item, index) => [item.recommendationId, candidates[index]]));
  const selectedIndex = selected ? candidates.indexOf(selected) : -1;
  const detailNavigation =
    selectedIndex >= 0 && candidates.length > 1
      ? getOrgTalentDetailNavigationState(boardItems, {
          recommendationId: boardItems[selectedIndex].recommendationId,
        })
      : null;
  // 이전/다음 through the list, in the sheet (split view) and in place (wide).
  const navigateTo = (target: OrgTalentDetailNavigationTarget | null) => {
    const person = target ? byBoardId.get(target.recommendationId) : null;
    if (person) select(person.id);
  };

  // The wide layouts open the person in place, like the inbox's review there;
  // the split view's rows open the same sheet as every other candidate.
  if (selected && inPlace) {
    const canSendIntro = externalCandidateCanSendIntro(selected);
    // The same review as a person inside Harper in 전체 화면 (OrgCandidateReview):
    // its header (back, 이전/다음, decisions at the right) and its body.
    return (
      <div ref={rootRef} className="pb-10">
        <section
          aria-label={c("후보자 검토", "Candidate review")}
          className="@container/review min-w-0 rounded-lg"
        >
          <OrgCandidateReviewHeader
            actions={
              canManage ? (
                <>
                  <OrgPassPopover
                    key={selected.id}
                    open={passOpen}
                    onOpenChange={setPassOpen}
                    onSubmit={(reason) => pass(selected, reason)}
                    pending={pending}
                    shortcut={false}
                  />
                  {canSendIntro ? (
                    <MuteButton
                      className="border-none px-3 py-1.5 text-[15px]"
                      disabled={pending}
                      onClick={() => setIntroFor(selected)}
                      variant="dark"
                    >
                      {ct(c, COMPANY_TERMS.action.request)}
                    </MuteButton>
                  ) : (
                    <ExternalSendIntroSlot person={selected} className="px-3 py-1.5 text-[15px]" />
                  )}
                </>
              ) : (
                <ExternalStatusBadge person={selected} />
              )
            }
            actionsCaption={
              canManage && canSendIntro
                ? `${ct(c, COMPANY_TERMS.action.request)}: ${ct(c, COMPANY_TERMS.caption.externalRequestUsesIntro)}`
                : undefined
            }
            backLabel={
              view === "list"
                ? c("리스트로 돌아가기", "Back to list")
                : view === "board"
                  ? c("포스트잇으로 돌아가기", "Back to board")
                  : c("그리드로 돌아가기", "Back to grid")
            }
            canManage={canManage}
            navigation={detailNavigation}
            onAccept={() => setIntroFor(selected)}
            onBack={() => select(null)}
            onNavigate={navigateTo}
            onPass={(reason) => pass(selected, reason)}
            onReject={() => setPassOpen(true)}
            onSave={async () => {}}
            pending={pending}
            roleMoveButton={null}
            saved={false}
          />
          <OrgCandidateReviewContent
            className="px-0 pt-6 md:mt-4 md:px-4 md:pt-8"
            detail={externalProfileDetail(selected, criteriaOrder)}
            onResumeClick={(_kind, link) => openLink(link)}
            footer={
              <p className="text-[13px] text-neutral-muted">
                {c(
                  "Harper에 가입하지 않은 사람이에요. 공개된 정보로만 평가했어요.",
                  "This person hasn’t joined Harper. They were assessed from public information only."
                )}
              </p>
            }
          />
        </section>
        {introDialog}
      </div>
    );
  }

  const searching = isExternalSearchRunning(data);
  // The same decision card in every layout: Pass always, Request intro only
  // when an invitation can go out (the LinkedIn link otherwise).
  const cardProps = (person: ExternalCandidateView) => ({
    acceptSlot: externalCandidateCanSendIntro(person) ? undefined : <ExternalSendIntroSlot person={person} className="w-full py-2" />,
    canManageCandidates: canManage,
    footer: canManage ? null : <ExternalStatusBadge person={person} />,
    item: externalBoardItem(person, roleId, criteriaOrder),
    onAccept: () => setIntroFor(person),
    onOpen: () => select(person.id),
    onPass: async (reason: string) => { await pass(person, reason); },
    pending,
    stages: [],
  });
  return (
    <div ref={rootRef} className="space-y-4 pb-6">
      {searching ? (
        <Badge variant="faded" tone="neutral">
          <Loading
            className="text-neutral-muted motion-reduce:[&>span:first-child]:animate-none"
            label={c("외부 후보 찾는 중", "Searching outside Harper")}
            size="sm"
          />
        </Badge>
      ) : data.search?.status === "failed" ? (
        <p className="text-xs text-neutral-muted">
          {c("마지막 외부 검색을 마치지 못했어요.", "The last search outside Harper didn’t finish.")}
        </p>
      ) : null}
      {candidates.length && view === "list" ? (
        <OrgExternalCandidateList
          candidates={candidates}
          criteria={criteriaOrder}
          onOpen={(person) => select(person.id)}
          roleId={roleId}
        />
      ) : candidates.length && view === "rows" ? (
        <OrgCandidateListContext.Provider value={rowList}>
          <div className="org-candidate-list">
            {candidates.map((person) => (
              <OrgRoleCandidateCard
                {...cardProps(person)}
                criteriaOrder={criteriaOrder}
                key={person.id}
                profileDetail={externalProfileDetail(person, criteriaOrder)}
              />
            ))}
          </div>
          {selected ? (
            <ExternalCandidateSheet
              canManage={canManage}
              criteriaOrder={criteriaOrder}
              key={selected.id}
              navigation={detailNavigation}
              onClose={() => select(null)}
              onNavigate={navigateTo}
              onPass={(reason) => pass(selected, reason)}
              onRequest={() => setIntroFor(selected)}
              pending={pending}
              person={selected}
            />
          ) : null}
        </OrgCandidateListContext.Provider>
      ) : candidates.length && view === "board" && workspaceId ? (
        <OrgCandidateBoardCanvas
          board="external"
          items={candidates.map((person) => externalBoardItem(person, roleId, criteriaOrder))}
          key={`${roleId}:external`}
          renderCard={(item) => {
            const person = byBoardId.get(item.recommendationId);
            return person ? <OrgRoleTalentBoardCard {...cardProps(person)} key={person.id} /> : null;
          }}
          roleId={roleId}
          selectedIds={NO_BOARD_SELECTION}
          workspaceId={workspaceId}
        />
      ) : candidates.length ? (
        <section className="@container/talent-board min-w-0">
          <div className="relative isolate grid auto-rows-fr grid-cols-1 items-stretch gap-4 @min-[640px]/talent-board:grid-cols-2">
            {candidates.map((person) => (
              <OrgRoleTalentBoardCard {...cardProps(person)} fillHeight key={person.id} />
            ))}
          </div>
        </section>
      ) : searching ? null : (
        <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-neutral-muted">
          <Inbox className="size-6 text-neutral-soft" />
          {c(
            "아직 외부 후보가 없어요. 채팅에서 찾아 달라고 하면 돼요.",
            "No external candidates yet. Ask in chat."
          )}
        </div>
      )}
      {introDialog}
    </div>
  );
}

/** Data container for the Role's "외부 후보" tab. */
export function OrgExternalCandidates({ workspaceId, roleId, sort, view }: {
  workspaceId: string; roleId: string; sort?: OrgCandidateSort; view?: OrgExternalCandidatesLayout;
}) {
  const query = useOrgExternalCandidates({ workspaceId, roleId });
  const { bootstrap, currentUserEmail, permissions, roles } = useOrgWorkspace();
  const { pass, requestIntro } = useOrgExternalCandidateActions({ workspaceId, roleId });
  const role = roles.find((item) => item.roleId === roleId);
  const roleCriteria = useMemo(
    () => role?.criteria.map((criterion) => criterion.name || criterion.criteria) ?? null,
    [role?.criteria]
  );
  if (query.isLoading) return <ReviewEmptyState loading />;
  if (isOrgQueryBlockingError(query.error, query.data)) {
    return <OrgErrorState message={query.error?.message ?? ""} onRetry={() => void query.refetch()} />;
  }
  return (
    <OrgExternalCandidatesView
      data={query.data ?? { enabled: false, search: null, candidates: [] }}
      roleCriteria={roleCriteria}
      roleId={roleId}
      sort={sort}
      view={view}
      workspaceId={workspaceId}
      actions={{
        canManage: permissions.canManageCandidates,
        members: bootstrap.members,
        defaultEmail: currentUserEmail ?? null,
        pass: (candidateId, reason) => pass.mutateAsync({ candidateId, reason }),
        requestIntro: (candidateId, input) => requestIntro.mutateAsync({ candidateId, ...input }),
        pending: pass.isPending || requestIntro.isPending,
      }}
    />
  );
}
