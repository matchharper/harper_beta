import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowUpRight, Inbox } from "lucide-react";
import { LinkedinLogo } from "@/components/common/BrandLogos";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { isOrgQueryBlockingError } from "@/lib/org/queryError";
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
import { OrgPassPopover } from "./OrgPassPopover";
import { OrgCandidateReviewContent } from "./OrgCandidateReviewContent";
import { OrgRoleTalentBoardCard } from "./OrgRoleTalentBoard";
import { ReviewEmptyState } from "./OrgHomeInbox";
import { OrgErrorState } from "./workspace/OrgErrorState";
import {
  externalBoardItem,
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
    case "declined":
      return { label: c("거절함", "Declined"), at: null };
    case "unsubscribed":
      return { label: c("연락 거부", "Opted out"), at: null };
    case "bounced":
      return { label: c("메일 전달 안 됨", "Not delivered"), at: null };
    case "not_sendable":
    case "failed":
      return { label: c("초대 메일 못 보냄", "Invitation not sent"), at: null };
    default:
      return { label: c("연결 요청함", "Connection requested"), at: intro.requestedAt };
  }
}

/** The connection state, or "no email" for a person Harper cannot contact; null while Send Intro applies. */
function externalStatus(person: ExternalCandidateView, c: Copy): ExternalStatus | null {
  if (person.intro) return introStatus(person.intro, c);
  return externalCandidateWithoutEmail(person) ? { label: c("이메일을 찾지 못했어요", "No email found"), at: null } : null;
}

/** The state in Send Intro's place: shaped like the button, not clickable. */
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
 * Send Intro's place: the person's LinkedIn profile when Harper found no email for them (the company can
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
export function OrgExternalCandidatesView({ data, roleId, actions }: {
  data: ExternalCandidatesResponse; roleId: string; actions?: ExternalCandidateActions;
}) {
  const router = useRouter();
  const { c, locale } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const rootRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const [introFor, setIntroFor] = useState<ExternalCandidateView | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const selectedId = typeof router.query.externalCandidateId === "string" ? router.query.externalCandidateId : null;
  const candidates = data.candidates;
  const selected = selectedId ? candidates.find((person) => person.id === selectedId) ?? null : null;
  const selectedKey = selected?.id ?? null;
  const canManage = Boolean(actions?.canManage);
  const pending = Boolean(actions?.pending);
  const scroller = () => rootRef.current?.closest<HTMLElement>("[data-org-review-scroll]") ?? document.scrollingElement;

  // The detail opens at the top; Back restores the list position.
  useLayoutEffect(() => {
    const element = rootRef.current?.closest<HTMLElement>("[data-org-review-scroll]") ?? document.scrollingElement;
    element?.scrollTo({ top: selectedKey ? 0 : listScrollTop.current });
  }, [selectedKey]);

  const select = (id: string | null) => {
    if (id) listScrollTop.current = scroller()?.scrollTop ?? 0;
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
        ? c(
            "Harper가 이 분께 초대 메일을 한 통 보내요. 위 관심 이유와 Role이 들어가요. 메일을 읽으면 카드에 표시되고, 답장이 오면 알려드릴게요.",
            "Harper emails this person one invitation with the reason above and the Role. The card shows when they read it, and you’ll hear when they reply."
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

  if (selected) {
    const canSendIntro = externalCandidateCanSendIntro(selected);
    return (
      <div ref={rootRef} className="pb-10">
        <header className="sticky top-0 z-20 flex min-w-0 items-center gap-2 bg-bg-default px-2 py-3 md:gap-3 md:px-4">
          <MuteButton
            aria-label={c("외부 후보로 돌아가기", "Back to outside Harper")}
            disabled={pending}
            onClick={() => select(null)}
            size="sm"
            variant="transparent"
          >
            <ArrowLeft className="size-4" />
          </MuteButton>
          {canManage ? null : <ExternalStatusBadge person={selected} />}
          {canManage ? (
            <div className="ml-auto flex min-w-0 items-center justify-end gap-1 md:gap-2">
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
                  {c("Send Intro", "Send Intro")}
                </MuteButton>
              ) : (
                <ExternalSendIntroSlot person={selected} className="px-3 py-1.5 text-[15px]" />
              )}
            </div>
          ) : null}
        </header>
        <OrgCandidateReviewContent
          detail={externalProfileDetail(selected)}
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
        {introDialog}
      </div>
    );
  }

  const searching = isExternalSearchRunning(data);
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
      {candidates.length ? (
        <section className="@container/talent-board min-w-0">
          <div className="relative isolate grid auto-rows-fr grid-cols-1 items-stretch gap-4 @min-[640px]/talent-board:grid-cols-2">
            {candidates.map((person) => (
              <OrgRoleTalentBoardCard
                acceptSlot={externalCandidateCanSendIntro(person) ? undefined : <ExternalSendIntroSlot person={person} className="w-full py-2" />}
                canManageCandidates={canManage}
                fillHeight
                key={person.id}
                item={externalBoardItem(person, roleId)}
                onAccept={() => setIntroFor(person)}
                onOpen={() => select(person.id)}
                onPass={async (reason) => { await pass(person, reason); }}
                pending={pending}
                stages={[]}
                footer={canManage ? null : <ExternalStatusBadge person={person} />}
              />
            ))}
          </div>
        </section>
      ) : searching ? null : (
        <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-neutral-muted">
          <Inbox className="size-6 text-neutral-soft" />
          {c(
            "아직 외부 후보가 없어요. Harper에게 외부 후보 검색을 요청할 수 있어요.",
            "No candidates from outside Harper yet. You can ask Harper to search outside Harper."
          )}
        </div>
      )}
      {introDialog}
    </div>
  );
}

/** Data container for the Role's "외부 후보" tab. */
export function OrgExternalCandidates({ workspaceId, roleId }: { workspaceId: string; roleId: string }) {
  const query = useOrgExternalCandidates({ workspaceId, roleId });
  const { bootstrap, currentUserEmail, permissions } = useOrgWorkspace();
  const { pass, requestIntro } = useOrgExternalCandidateActions({ workspaceId, roleId });
  if (query.isLoading) return <ReviewEmptyState loading />;
  if (isOrgQueryBlockingError(query.error, query.data)) {
    return <OrgErrorState message={query.error?.message ?? ""} onRetry={() => void query.refetch()} />;
  }
  return (
    <OrgExternalCandidatesView
      data={query.data ?? { enabled: false, search: null, candidates: [] }}
      roleId={roleId}
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
