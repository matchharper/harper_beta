import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { gtmPostingTitle } from "@/lib/gtmPlays/shared";
import type { GtmRoleDetail, GtmRoleSummary } from "@/lib/gtmPlays/outreach.server";
import type { MemberFacts } from "@/lib/gtmPlays/pool.server";
import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import { formatKst, useGtmAction } from "./api";
import {
  CHOICE, CandidateMailComposer, ScrapedSearch, usePickedCandidates, type CandidateSource, type PickedCandidate,
} from "./CandidateOutreach";
import { CustomerRoleSelect, JdInput } from "./JdInput";
import { MemberTable } from "./MemberTable";
import OutreachFunnel from "./OutreachFunnel";
import { BriefEditor, CriteriaEditor, EXTRA_PLACEHOLDER, editableCriteria, filledCriteria, useRoleStart, type Criteria } from "./RoleBrief";
import {
  ActionBar, Badge, Button, ErrorNotice, Hint, Label, Panel, Select, StepBar, StepTitle, TextArea,
  scrollToStep, stepAnchor, type FlowStep,
} from "./ui";

const SEARCH_LABEL: Record<string, string> = {
  queued: "검색 대기", running: "검색 중", succeeded: "검색 완료", skipped: "건너뜀", failed: "검색 실패",
};

/** Why an external search was not started, in words (requestExternalSourcing's reasons). */
const NOT_QUEUED_REASON: Record<string, string> = {
  not_enabled: "이 서버에서는 하퍼 계정 외부 검색이 꺼져 있어요 (ORG_EXTERNAL_SOURCING_WORKSPACE_IDS에 하퍼 계정이 없어요). 운영에서는 켜져 있어야 돌아요.",
  daily_limit: "이 Role의 오늘 외부 검색 한도를 다 썼어요. 내일 다시 눌러 주세요.",
  workspace_daily_limit: "하퍼 계정의 오늘 외부 검색 한도(20회)를 다 썼어요. 내일 다시 눌러 주세요.",
  free_plan_daily_limit: "하퍼 계정이 무료 플랜이라 오늘 외부 검색 한도를 다 썼어요.",
  company_request_only: "지금은 요청으로만 검색할 수 있어요.",
};

/** A search request that did not start a new search because one is already on (a second click): not an error. */
const ALREADY_SEARCHING = new Set(["already_running", "already_queued"]);
/** While a search is queued or running, the Role is read again this often, so the result shows when it ends. */
const SEARCH_POLL_MS = 5_000;

const WRITES_OFF = "쓰기 꺼짐";

const HINTS = {
  criteria: "외부 검색이 읽는 건 이 요청·추가 요청·기준이에요(검색을 누를 때 적는 메모는 읽지 않아요). 저장하면 다음 외부 검색부터 반영돼요.",
  members: "JD 내용·요청·추가 요청·기준으로 하퍼 회원 풀에서 가까운 50명을 찾아요(회사 아웃바운드와 같은 계산). 매칭 공개·내부 추천을 허용한 회원만 나오고, 읽기만 해서 아무것도 기록하지 않아요. 저장 전에도 돼요.",
  external: "요청·기준으로 웹·LinkedIn에서 하퍼 밖 후보를 찾아요. worker가 3~6분 돌리고 1회 약 $1~4예요. 이메일을 찾은 사람은 체크해서 아래 후보 메일로 보내요. 고객 Role로 보내기도 체크한 사람으로 해요.",
  save: "외부 검색 worker는 저장된 Role 단위로만 돌아요. 그래서 이 JD와 검색 기준을 'Harper GTM' 워크스페이스(하퍼 채용 계정과 별도)에 Role 1개로 저장해요. 후보와 회사에는 안 보여요. 같은 공고(같은 고객 Role·같은 URL·같은 회사+직무명)는 새로 만들지 않고 전에 저장한 Role을 열어요. 다 쓰면 '끝내기'로 닫아요.",
  saved: "이 탭에서 저장한 Role이에요. 고르면 검색 기준·Choice 1·2·3·후보 메일로 바로 가요. 끝낸 Role도 다시 열 수 있어요.",
} as const;

const STATUS_LABEL: Record<string, string> = { active: "진행 중", ended: "끝냄", paused: "멈춤", draft: "초안" };

/** Why a button is off, shown next to it rather than only on hover. */
function OffReason({ text }: { text: string | null }) {
  return text ? <span className="text-[12px] text-neutral-muted">{text}</span> : null;
}

function SectionTitle({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Hint label={label} text={hint} />
    </span>
  );
}

const CONTACT_LABEL: Record<ExternalCandidateView["contact"], string> = {
  none: "이메일 안 찾음", looking: "이메일 찾는 중", found: "이메일 찾음", not_found: "이메일 못 찾음", failed: "이메일 찾기 실패",
};

function introLabel(intro: ExternalCandidateView["intro"]) {
  if (!intro) return null;
  switch (intro.status) {
    case "requested": case "sending": return "보내기 대기";
    case "invited": return intro.openedAt ? "읽음" : "보냄";
    case "replied": return `답장${intro.replyType ? ` (${intro.replyType})` : ""}`;
    case "declined": return "거절";
    case "unsubscribed": return "수신 거부";
    case "bounced": return "반송";
    case "not_sendable": return "못 보냄";
    case "accepted": case "connecting": return "연결 중";
    case "connected": return "연결됨";
    case "failed": return "실패";
    case "cancelled": return "취소";
    default: return intro.status;
  }
}

const ROLE_SOURCE_LABEL: Record<NonNullable<GtmRoleSummary["source"]>, string> = {
  customer_role: "고객사 Role", url: "외부 공고", text: "외부 JD",
};

/** GTM Roles: Chris edits the search instructions (base text, extra instructions, criteria) here. */
function SearchCriteriaEditor({ role, writes, onSaved }: { role: GtmRoleDetail; writes: boolean; onSaved: () => void }) {
  // Remounted when the saved Brief changes (key), so the fields start from what is saved.
  const [request, setRequest] = useState(role.baseRequest);
  const [extra, setExtra] = useState(role.extraRequest);
  const [criteria, setCriteria] = useState<Criteria>(() => editableCriteria(role.criteria));
  const save = useGtmAction<{ dryRun: boolean }>();
  const changed = request !== role.baseRequest || extra !== role.extraRequest
    || JSON.stringify(criteria) !== JSON.stringify(editableCriteria(role.criteria));
  return (
    <div className="mt-3 space-y-3">
      <label className="block"><Label>요청 (검색이 읽는 설명)</Label>
        <TextArea rows={5} value={request} maxLength={4_000} onChange={(event) => setRequest(event.target.value)} className="w-full" />
      </label>
      <label className="block"><Label>추가 요청</Label>
        <TextArea
          rows={3}
          value={extra}
          placeholder={EXTRA_PLACEHOLDER}
          onChange={(event) => setExtra(event.target.value)}
          className="w-full"
        />
      </label>
      <CriteriaEditor criteria={criteria} onChange={setCriteria} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          loading={save.loading}
          disabled={!writes || !request.trim() || !changed}
          onClick={async () => {
            const result = await save.run("outreach.saveBrief", {
              roleId: role.roleId, request, extraRequest: extra, criteria: filledCriteria(criteria),
            });
            if (result && !result.dryRun) onSaved();
          }}
        >
          저장
        </Button>
        <OffReason text={writes ? null : `${WRITES_OFF} · 로컬은 저장하지 않아요`} />
      </div>
      <ErrorNotice message={save.error} />
    </div>
  );
}

/**
 * Choice 1 · 우리 DB 검색: Harper members close to the Role (saved, or still on screen), read only. It runs once
 * on its own when it appears (one embedding, nothing written); "다시 검색" reads the criteria as they are now.
 */
function MemberSearch({ action, input, disabled = false, picked, onToggle }: {
  action: string; input: () => Record<string, unknown>; disabled?: boolean;
  picked: string[]; onToggle: (member: MemberFacts) => void;
}) {
  const search = useGtmAction<{ eligibleCount: number; members: MemberFacts[] }>();
  const members = search.result?.members ?? [];
  const { run } = search;
  const started = useRef(false);
  useEffect(() => {
    if (started.current || disabled) return;
    started.current = true;
    void run(action, input());
  }, [run, action, input, disabled]);
  return (
    <Panel
      title={<SectionTitle label={`${CHOICE.member.label} (우리 DB)`} hint={HINTS.members} />}
      actions={(
        <Button loading={search.loading} disabled={disabled} title="임베딩 1회 · 읽기만" onClick={() => void search.run(action, input())}>
          {search.result ? "다시 검색" : "우리 DB 검색"}
        </Button>
      )}
    >
      <ErrorNotice message={search.error} />
      {search.result ? (
        <div className="space-y-2">
          <div className="text-sm text-neutral-muted">
            매칭 가능한 회원 {search.result.eligibleCount.toLocaleString()}명 중 가까운 {search.result.members.length}명
          </div>
          <MemberTable
            members={search.result.members}
            words={{ add: "메일에 넣기", remove: "메일에서 빼기" }}
            picked={picked}
            onToggle={(talentId) => { const member = members.find((row) => row.talentId === talentId); if (member) onToggle(member); }}
          />
        </div>
      ) : null}
    </Panel>
  );
}

const SOURCES = Object.keys(CHOICE) as CandidateSource[];

/** 후보 고르기: Choice 1·2·3 in one section, one source on screen at a time (the others keep their results). */
function CandidatePicker({ step, picked, children }: {
  step: number; picked: PickedCandidate[]; children: Record<CandidateSource, ReactNode>;
}) {
  const [source, setSource] = useState<CandidateSource>("member");
  const count = (key: CandidateSource) => picked.filter((item) => item.source === key).length;
  return (
    <section id={stepAnchor("pick")} className="scroll-mt-16 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
          <StepTitle n={step} label="후보 고르기" hint="세 곳에서 찾아 체크하면, 다음 단계에서 한 번에 메일을 보내요" />
        </h2>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="후보를 찾을 곳">
          {SOURCES.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={source === key}
              onClick={() => setSource(key)}
              className={cx("h-8 rounded-md px-3 text-sm", source === key ? "bg-surface-inverse text-neutral-00" : "bg-bg-weak hover:bg-bg-weak/70")}
            >
              {CHOICE[key].tab}{count(key) ? ` · ${count(key)}명` : ""}
            </button>
          ))}
        </div>
      </div>
      {SOURCES.map((key) => <div key={key} hidden={source !== key}>{children[key]}</div>)}
    </section>
  );
}

/** Stays at the bottom: how many are chosen from where, and the way to the mail. */
function PickedBar({ picked, mailStep }: { picked: PickedCandidate[]; mailStep: number }) {
  const counts = SOURCES.map((key) => [key, picked.filter((item) => item.source === key).length] as const).filter(([, n]) => n);
  return (
    <ActionBar>
      <span className="text-sm">
        {picked.length ? (
          <>
            선택 <b className="tabular-nums">{picked.length}명</b>
            <span className="text-neutral-muted"> ({counts.map(([key, n]) => `${CHOICE[key].tab} ${n}`).join(" · ")})</span>
          </>
        ) : <span className="text-neutral-muted">메일 보낼 후보를 체크해 주세요</span>}
      </span>
      <Button variant="primary" disabled={!picked.length} onClick={() => scrollToStep("mail")}>
        {mailStep}. 메일 쓰기로 ↓
      </Button>
    </ActionBar>
  );
}

/**
 * A new posting: JD → search criteria (with extra instructions, drafted as soon as the JD is read) → 후보 고르기
 * (우리 DB 검색 runs right away, read only; external search saves it as a Role in the Harper GTM workspace) →
 * candidate mail. The same posting opens the saved Role.
 */
function NewRole({ writes, onOpen, onMailSent, onRolesChanged }: {
  writes: boolean; onOpen: (roleId: string) => void; onMailSent: () => void;
  /** A send saved the posting as a Role: the 저장한 Role list reads again. */
  onRolesChanged: () => void;
}) {
  // An outside posting (URL or pasted JD) becomes a Role in the Harper GTM workspace when its first mail goes out.
  const start = useRoleStart();
  const { jd, brief, setBrief, extra, setExtra, draft, existing, create, savedRole, outside, cleanBrief, briefReady, makeBrief } = start;
  const pick = usePickedCandidates();
  const steps: FlowStep[] = [
    { id: "jd", label: "공고 고르기", done: Boolean(jd), available: true },
    { id: "brief", label: "검색 기준", done: briefReady, available: Boolean(jd) },
    { id: "pick", label: "후보 고르기", done: pick.picked.length > 0, available: briefReady },
    { id: "mail", label: "메일 보내기", done: false, available: briefReady },
  ];
  return (
    <div className="space-y-4">
      <StepBar steps={steps} />
      <Panel id={stepAnchor("jd")} title={<StepTitle n={1} label="공고 고르기" hint="고객 Role을 고르거나 공고 URL·JD를 넣고 ‘JD 읽기’" />}>
        <JdInput onJd={(next) => { start.takeJd(next); pick.clear(); }} />
        {outside && existing.result && !savedRole ? (
          <p className="mt-3 text-[12px] text-neutral-muted">메일을 보내면 이 정보로 ‘Harper GTM’ 워크스페이스에 Role이 만들어져요.</p>
        ) : null}
        {savedRole ? (
          <div className={cx(opsTheme.panelMuted, "mt-3 flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
            <span>이 공고로 저장한 Role이 있어요:</span>
            <span className="font-medium">{savedRole.name}</span>
            <Badge>{STATUS_LABEL[savedRole.status] ?? savedRole.status}</Badge>
            <Button variant="primary" onClick={() => onOpen(savedRole.roleId)}>열기</Button>
          </div>
        ) : null}
        <ErrorNotice message={existing.error} />
      </Panel>
      {jd ? (
        <Panel
          id={stepAnchor("brief")}
          title={<StepTitle n={2} label="검색 기준" hint="JD로 만든 초안이에요. 고칠 곳만 고쳐요" />}
          actions={(
            <Button onClick={() => void makeBrief(jd)} loading={draft.loading} title="LLM 1회">
              {brief ? "다시 만들기" : "기준 만들기"}
            </Button>
          )}
        >
          <ErrorNotice message={draft.error} />
          {brief ? <BriefEditor brief={brief} extra={extra} onChange={setBrief} onExtraChange={setExtra} showPublicDescription={outside} /> : (
            <p className="text-sm text-neutral-muted">{draft.loading ? "JD로 요청과 기준 초안을 만들고 있어요 (10초쯤)" : "JD로 요청과 기준 초안을 만들어요."}</p>
          )}
        </Panel>
      ) : null}
      {jd && cleanBrief ? (
        <>
          <CandidatePicker step={3} picked={pick.picked}>
            {{
              member: (
                <MemberSearch
                  action="outreach.internalDraft"
                  input={() => ({ jd, brief: cleanBrief, extraRequest: extra })}
                  disabled={!briefReady}
                  picked={pick.picked.filter((item) => item.source === "member").map((item) => item.ref)}
                  onToggle={(member) => pick.toggle(memberPick(member))}
                />
              ),
              external: (
                <Panel title={<SectionTitle label={CHOICE.external.label} hint={HINTS.save} />}>
                  <p className="text-sm text-neutral-muted">
                    외부 검색은 저장한 Role로만 돌아요. 누르면 이 기준이 ‘Harper GTM’ 워크스페이스에 Role 1개로 저장되고(후보·회사에는 안 보여요), 저장한 Role 화면에서 검색해요.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      loading={create.loading}
                      disabled={!writes || !briefReady}
                      onClick={async () => {
                        const result = await start.saveRole();
                        if (result && !result.dryRun && result.roleId) onOpen(result.roleId);
                      }}
                    >
                      저장하고 외부 검색으로
                    </Button>
                    <OffReason text={writes ? null : `${WRITES_OFF} · 로컬은 Role을 저장하지 않아요`} />
                  </div>
                  <ErrorNotice message={create.error} />
                  {create.result?.reused ? (
                    <p className="mt-2 text-[12px] text-neutral-muted">이 공고로 전에 저장한 Role을 열었어요. 이번에 고친 기준은 그 Role의 검색 기준에서 다시 저장해 주세요.</p>
                  ) : null}
                </Panel>
              ),
              scraped: (
                <ScrapedSearch
                  key={`${jd.url ?? ""}|${jd.title}`}
                  roleTitle={jd.title}
                  description={jd.description}
                  isPicked={(ref) => pick.has({ source: "scraped", ref })}
                  onToggle={(person) => pick.toggle({ source: "scraped", ref: person.ref, name: person.name, headline: person.headline })}
                />
              ),
            }}
          </CandidatePicker>
          <CandidateMailComposer
            step={4}
            picked={pick.picked}
            onRemove={pick.remove}
            onSent={() => {
              onMailSent();
              if (!outside) return;
              // The posting is a saved Role now: step 1 shows it, and 저장한 Role 이어서 lists it.
              void start.refindRole();
              onRolesChanged();
            }}
            writes={writes}
            gtmRoleId={null}
            logRoleId={outside ? savedRole?.roleId ?? null : jd.sourceRoleId}
            draftRole={outside && briefReady ? { jd, brief: cleanBrief, extraRequest: extra } : null}
            sendBlocked={outside && !briefReady ? "검색 기준의 Role 이름과 요청을 채우면 보낼 수 있어요" : null}
            companyName={jd.companyName}
            roleTitle={gtmPostingTitle(cleanBrief.roleName, jd.companyName) || jd.title}
            description={jd.description}
            defaultPostingUrl={jd.url}
            location={jd.location}
          />
          <PickedBar picked={pick.picked} mailStep={4} />
        </>
      ) : null}
    </div>
  );
}

function memberPick(member: MemberFacts): PickedCandidate {
  return { source: "member", ref: member.talentId, name: member.name, headline: member.headline };
}

function CandidateCard({ roleId, candidate, writes, selected, onToggle, onChanged }: {
  roleId: string; candidate: ExternalCandidateView; writes: boolean; selected: boolean;
  onToggle: () => void; onChanged: () => void;
}) {
  const action = useGtmAction<unknown>();
  const intro = introLabel(candidate.intro);
  return (
    <li className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={selected} onChange={onToggle} aria-label="후보 메일·고객 Role로 보낼 사람" />
          <div>
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              {candidate.name}
              {candidate.linkedinUrl ? (
                <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className={opsTheme.link} aria-label="LinkedIn">
                  <ExternalLink className="inline h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <div className="text-sm text-neutral-muted">
              {[candidate.headline, candidate.currentCompany, candidate.location].filter(Boolean).join(" · ")}
            </div>
          </div>
        </label>
        <div className="flex flex-wrap gap-1">
          <Badge tone={candidate.contact === "found" ? "positive" : candidate.contact === "failed" ? "critical" : "default"}>
            {CONTACT_LABEL[candidate.contact]}{candidate.contactConfirmed ? " · 본인 페이지" : ""}
          </Badge>
          {intro ? <Badge tone="strong">{intro}</Badge> : null}
          {candidate.companyDecision === "passed" ? <Badge>Pass</Badge> : null}
        </div>
      </div>
      {candidate.reason ? <p className="mt-2 text-sm leading-6">{candidate.reason}</p> : null}
      {candidate.criteria.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {candidate.criteria.map((criterion) => (
            <Badge key={criterion.name} title={criterion.content} tone={criterion.fitness === "excellent" || criterion.fitness === "good" ? "positive" : criterion.fitness === "conflict" ? "critical" : "default"}>
              {criterion.name} · {criterion.fitness}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {(candidate.contact === "none" || candidate.contact === "failed") ? (
          <Button
            disabled={!writes}
            loading={action.loading}
            title={writes ? "1명 약 $0.12" : "쓰기 꺼짐"}
            onClick={async () => { if (await action.run("outreach.email", { roleId, candidateId: candidate.id })) onChanged(); }}
          >
            이메일 찾기
          </Button>
        ) : null}
        {candidate.companyDecision !== "passed" ? (
          <Button
            disabled={!writes}
            loading={action.loading}
            title={writes ? undefined : "쓰기 꺼짐"}
            onClick={async () => { if (await action.run("outreach.pass", { roleId, candidateId: candidate.id, reason: "GTM pass" })) onChanged(); }}
          >
            Pass
          </Button>
        ) : null}
        <OffReason text={writes ? null : WRITES_OFF} />
      </div>
      <ErrorNotice message={action.error} />
    </li>
  );
}

function CopyToCustomer({ roleId, candidateIds, writes, onDone }: {
  roleId: string; candidateIds: string[]; writes: boolean; onDone: () => void;
}) {
  const [targetRoleId, setTargetRoleId] = useState("");
  const copy = useGtmAction<{ dryRun: boolean; runId?: string; skipped?: number }>();
  return (
    <Panel title={`고객 Role로 보내기 · ${candidateIds.length}명`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <CustomerRoleSelect value={targetRoleId} onChange={setTargetRoleId} />
        <Button
          variant="primary"
          loading={copy.loading}
          disabled={!writes || !targetRoleId || !candidateIds.length}
          title="고객의 외부 후보 탭에 보여요"
          onClick={async () => { const result = await copy.run("outreach.copy", { roleId, candidateIds, targetRoleId }); if (result && !result.dryRun) onDone(); }}
        >
          보내기
        </Button>
      </div>
      <OffReason text={writes ? null : WRITES_OFF} />
      <ErrorNotice message={copy.error} />
      {copy.result && !copy.result.dryRun ? (
        <p className={cx(opsTheme.successNotice, "mt-3")}>보냈어요{copy.result.skipped ? ` · 이미 그 Role에 있는 ${copy.result.skipped}명은 뺐어요` : ""}.</p>
      ) : null}
    </Panel>
  );
}

function RoleDetail({ roleId, writes, onChanged, onMailSent }: {
  roleId: string; writes: boolean; onChanged: () => void; onMailSent: () => void;
}) {
  const load = useGtmAction<{ role: GtmRoleDetail }>();
  const search = useGtmAction<{ status: string; reason?: string }>();
  const toggleOpen = useGtmAction<{ status: string }>();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const pick = usePickedCandidates();
  const { run } = load;
  const reload = useCallback(() => { void run("outreach.role", { roleId }); }, [run, roleId]);
  // Remounted per Role (key), so the selection starts empty.
  useEffect(() => { reload(); }, [reload]);
  const searchStatus = load.result?.role.search?.status ?? null;
  const searching = searchStatus === "queued" || searchStatus === "running";
  // An external search takes 3-6 minutes: read the Role again until it ends, then refresh the lists once.
  const wasSearching = useRef(false);
  useEffect(() => {
    if (!searching) {
      if (wasSearching.current) onChanged();
      wasSearching.current = false;
      return;
    }
    wasSearching.current = true;
    const timer = setInterval(reload, SEARCH_POLL_MS);
    return () => clearInterval(timer);
  }, [searching, reload, onChanged]);
  const role = load.result?.role;
  if (!role) return <Panel><ErrorNotice message={load.error} />{load.loading ? <p className="text-sm text-neutral-muted">불러오는 중</p> : null}</Panel>;
  const passed = role.statuses.filter((person) => person.decision === "passed").length;
  const searchOff = !writes
    ? `${WRITES_OFF} · 로컬은 운영 DB에 검색 요청을 만들지 않아요`
    : role.status === "ended" ? "끝낸 Role이라 검색 안 함 · 다시 열면 검색해요"
      : role.status !== "active" ? `Role이 ${STATUS_LABEL[role.status] ?? role.status} 상태라 검색 안 함` : null;
  const ended = role.status === "ended";
  // Ending stops unsent invitations and closes the connect links of people who have not answered yet.
  const waiting = role.statuses.filter((person) => ["requested", "sending", "invited"].includes(person.introStatus ?? "")).length;
  const pickedExternal = pick.picked.filter((item) => item.source === "external").map((item) => item.ref);
  const setOpen = async (open: boolean) => {
    setConfirmEnd(false);
    if (await toggleOpen.run("outreach.setOpen", { roleId, open })) { reload(); onChanged(); }
  };
  const steps: FlowStep[] = [
    { id: "brief", label: "검색 기준", done: true, available: true },
    { id: "pick", label: "후보 고르기", done: pick.picked.length > 0, available: true },
    { id: "mail", label: "메일 보내기", done: false, available: true },
  ];
  return (
    <div className="space-y-4">
      <StepBar steps={steps} />
      <Panel
        id={stepAnchor("brief")}
        title={<StepTitle n={1} label={role.name} hint="저장한 Role · 검색 기준" />}
        actions={(
          <>
            <Badge tone={ended ? "default" : "positive"}>{STATUS_LABEL[role.status] ?? role.status}</Badge>
            {role.kind === "gtm" ? (
              <Button
                disabled={!writes}
                loading={toggleOpen.loading}
                title={ended ? "다시 진행 중으로" : "다 쓴 Role을 닫아요 (active Role 수에서 빠져요)"}
                onClick={() => { if (ended) void setOpen(true); else if (waiting) setConfirmEnd(true); else void setOpen(false); }}
              >
                {ended ? "다시 열기" : "끝내기"}
              </Button>
            ) : null}
            <Button onClick={reload} loading={load.loading} aria-label="새로고침"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </>
        )}
      >
        <ErrorNotice message={load.error ?? toggleOpen.error} />
        {!writes && role.kind === "gtm" ? <OffReason text={`끝내기·다시 열기: ${WRITES_OFF}`} /> : null}
        {confirmEnd ? (
          <div className={cx(opsTheme.panelMuted, "mb-3 flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
            <span>초대에 아직 답하지 않은 {waiting}명의 연결 링크가 닫히고, 안 나간 초대는 보내지 않아요. 그래도 끝낼까요?</span>
            <Button variant="primary" loading={toggleOpen.loading} onClick={() => void setOpen(false)}>끝내기</Button>
            <Button onClick={() => setConfirmEnd(false)}>취소</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 text-sm text-neutral-muted">
          <span>{role.kind === "gtm" ? "GTM Role" : "하퍼 채용 Role"}</span>
          {role.companyName ? <span>· {role.companyName}{role.source ? ` (${ROLE_SOURCE_LABEL[role.source]})` : ""}</span> : null}
        </div>
        <details className="mt-3" open={role.kind === "gtm"}>
          <summary className="cursor-pointer text-sm">검색 기준</summary>
          <div className="mt-2 flex items-center gap-1 text-[12px] text-neutral-muted">
            외부 검색이 읽는 내용
            <Hint label="검색 기준" text={HINTS.criteria} />
          </div>
          {role.kind === "gtm" ? (
            <SearchCriteriaEditor
              key={`${role.request ?? ""}|${JSON.stringify(role.criteria)}`}
              role={role}
              writes={writes}
              onSaved={() => { reload(); onChanged(); }}
            />
          ) : (
            <>
              {role.request ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{role.request}</p> : null}
              <ul className="mt-2 space-y-1 text-sm">
                {role.criteria.map((criterion) => (
                  <li key={criterion.name}><span className="font-medium">{criterion.name}</span>{criterion.requirement === "must" ? " (필수)" : ""}: {criterion.criteria}</li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-neutral-muted">하퍼 채용 Role은 /org에서 고쳐요</p>
            </>
          )}
        </details>
      </Panel>

      <CandidatePicker step={2} picked={pick.picked}>
        {{
          member: (
            <MemberSearch
              key={roleId}
              action="outreach.internal"
              input={() => ({ roleId })}
              picked={pick.picked.filter((item) => item.source === "member").map((item) => item.ref)}
              onToggle={(member) => pick.toggle(memberPick(member))}
            />
          ),
          external: (
            <div className="space-y-4">
              <Panel
                title={<SectionTitle label={CHOICE.external.label} hint={HINTS.external} />}
                actions={(
                  <>
                    <Badge tone={role.search?.status === "failed" ? "critical" : "default"}>
                      {searching ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      {role.search
                        ? searching
                          ? `${SEARCH_LABEL[role.search.status] ?? role.search.status} · ${formatKst(role.search.startedAt)}에 시작 · 3~6분 걸려요`
                          : `${SEARCH_LABEL[role.search.status] ?? role.search.status} · ${formatKst(role.search.finishedAt ?? role.search.startedAt)}`
                        : "검색 전"}
                    </Badge>
                    <OffReason text={searchOff} />
                    <Button
                      variant="primary"
                      disabled={Boolean(searchOff) || searching}
                      loading={search.loading}
                      title={searching ? "검색 중이에요. 끝나면 결과가 여기에 나와요" : "1회 약 $1~4, 3~6분"}
                      onClick={async () => { if (await search.run("outreach.search", { roleId })) { reload(); onChanged(); } }}
                    >
                      외부 검색
                    </Button>
                  </>
                )}
              >
                <ErrorNotice message={search.error} />
                {search.result && ALREADY_SEARCHING.has(search.result.status) ? (
                  <p className={cx(opsTheme.panelMuted, "mb-3 px-3 py-2 text-sm")}>
                    이미 검색 중이에요. 끝나면 결과가 여기에 나와요(3~6분).
                  </p>
                ) : search.result && search.result.status !== "queued" ? (
                  <p className={cx(opsTheme.errorNotice, "mb-3")}>
                    외부 검색을 시작하지 않았어요.{" "}
                    {(search.result.reason && NOT_QUEUED_REASON[search.result.reason]) ?? `${search.result.status}${search.result.reason ? ` · ${search.result.reason}` : ""}`}
                  </p>
                ) : null}
                <div className="mb-3 flex flex-wrap gap-2 text-sm text-neutral-muted">
                  <span>보여 준 {role.shown}</span><span>· 연결 요청 {role.requested}</span><span>· Pass {passed}</span>
                </div>
                <ul className="space-y-2">
                  {role.candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      roleId={roleId}
                      candidate={candidate}
                      writes={writes}
                      selected={pick.has({ source: "external", ref: candidate.id })}
                      onToggle={() => pick.toggle({ source: "external", ref: candidate.id, name: candidate.name, headline: candidate.headline })}
                      onChanged={() => { reload(); onChanged(); }}
                    />
                  ))}
                  {!role.candidates.length ? <li className="text-sm text-neutral-muted">보여 준 외부 후보 없음</li> : null}
                </ul>
              </Panel>
              {pickedExternal.length ? (
                <CopyToCustomer
                  roleId={roleId}
                  candidateIds={pickedExternal}
                  writes={writes}
                  onDone={() => { for (const ref of pickedExternal) pick.remove({ source: "external", ref }); reload(); }}
                />
              ) : null}
            </div>
          ),
          scraped: (
            <ScrapedSearch
              key={roleId}
              roleTitle={role.name.split(" · ").slice(-1)[0] ?? role.name}
              description={[role.description ?? "", role.request ?? ""].filter(Boolean).join("\n\n")}
              isPicked={(ref) => pick.has({ source: "scraped", ref })}
              onToggle={(person) => pick.toggle({ source: "scraped", ref: person.ref, name: person.name, headline: person.headline })}
            />
          ),
        }}
      </CandidatePicker>
      <CandidateMailComposer
        step={3}
        picked={pick.picked}
        onRemove={pick.remove}
        onSent={() => { reload(); onMailSent(); }}
        writes={writes}
        gtmRoleId={roleId}
        logRoleId={roleId}
        companyName={role.companyName}
        roleTitle={role.name.split(" · ").slice(-1)[0] ?? role.name}
        description={[role.description ?? "", role.request ?? ""].filter(Boolean).join("\n\n").slice(0, 20_000)}
        defaultPostingUrl={role.postingUrl}
      />
      <PickedBar picked={pick.picked} mailStep={3} />
    </div>
  );
}

/**
 * #4 Role 아웃리치: JD(하퍼 고객사 Role / 외부 공고 / 외부 JD) → 검색 기준·추가 요청 → 우리 DB 검색 / 저장 후
 * 외부 검색 → 이메일 → 초대 메일, 필요하면 고객 Role로 전달. Saved Roles reopen from one select.
 */
export default function OutreachTab({ writes }: { writes: boolean }) {
  const roles = useGtmAction<{ roles: GtmRoleSummary[] }>();
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped after a send, so the numbers table reads again.
  const [sentCount, setSentCount] = useState(0);
  const mailSent = useCallback(() => setSentCount((count) => count + 1), []);
  const { run } = roles;
  const reload = useCallback(() => { void run("outreach.roles"); }, [run]);
  useEffect(() => { reload(); }, [reload]);
  const saved = roles.result?.roles ?? [];
  const open = (roleId: string) => { reload(); setSelected(roleId); };
  // 열기 on the results table: the Role opens below, scrolled to its 검색 기준.
  const openFromResults = (roleId: string) => { open(roleId); window.setTimeout(() => scrollToStep("brief"), 300); };
  return (
    <div className="space-y-4">
      <OutreachFunnel refreshKey={sentCount} onOpenRole={openFromResults} />
      {saved.length || selected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 text-neutral-muted">시작<Hint label="저장한 Role" text={HINTS.saved} /></span>
          <Select value={selected ?? ""} onChange={(event) => setSelected(event.target.value || null)} className="min-w-[320px]" aria-label="저장한 Role">
            <option value="">새 공고로 시작하기</option>
            {saved.map((role) => (
              <option key={role.roleId} value={role.roleId}>
                저장한 Role 이어서: {role.name}{role.source ? ` · ${ROLE_SOURCE_LABEL[role.source]}` : ""} · {STATUS_LABEL[role.status] ?? role.status}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <ErrorNotice message={roles.error} />
      {selected
        ? <RoleDetail key={selected} roleId={selected} writes={writes} onChanged={reload} onMailSent={mailSent} />
        : <NewRole writes={writes} onOpen={open} onMailSent={mailSent} onRolesChanged={reload} />}
    </div>
  );
}
