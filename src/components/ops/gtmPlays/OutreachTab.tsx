import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { GtmBrief, GtmJd } from "@/lib/gtmPlays/shared";
import type { GtmRoleDetail, GtmRoleSummary } from "@/lib/gtmPlays/outreach.server";
import type { MemberFacts } from "@/lib/gtmPlays/pool.server";
import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import { formatKst, useGtmAction } from "./api";
import { CHOICE, CandidateMailComposer, ScrapedSearch, usePickedCandidates, type PickedCandidate } from "./CandidateOutreach";
import { CustomerRoleSelect, JdInput } from "./JdInput";
import { MemberTable } from "./MemberTable";
import { Badge, Button, ErrorNotice, Hint, Label, Panel, Select, TextArea, TextInput } from "./ui";

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

const WRITES_OFF = "쓰기 꺼짐";

const HINTS = {
  criteria: "외부 검색이 읽는 건 이 요청·추가 요청·기준이에요(검색을 누를 때 적는 메모는 읽지 않아요). 저장하면 다음 외부 검색부터 반영돼요.",
  members: "JD 내용·요청·추가 요청·기준으로 하퍼 회원 풀에서 가까운 50명을 찾아요(#2와 같은 계산). 매칭 공개·내부 추천을 허용한 회원만 나오고, 읽기만 해서 아무것도 기록하지 않아요. 저장 전에도 돼요.",
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

type Criteria = GtmBrief["criteria"];

/** The server's limits (route.ts briefSchema), so the editor never builds what it would refuse. */
const MAX_CRITERIA = 8;

function CriteriaEditor({ criteria, onChange }: { criteria: Criteria; onChange: (criteria: Criteria) => void }) {
  const setCriterion = (index: number, patch: Partial<Criteria[number]>) =>
    onChange(criteria.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div>
      <Label>기준</Label>
      <div className="space-y-2">
        {criteria.map((criterion, index) => (
          <div key={criterion.id ?? index} className="grid gap-2 sm:grid-cols-[160px_1fr_auto_auto]">
            <TextInput value={criterion.name} maxLength={80} aria-label="기준 이름" onChange={(event) => setCriterion(index, { name: event.target.value })} />
            <TextInput value={criterion.criteria} maxLength={400} aria-label="기준 설명" onChange={(event) => setCriterion(index, { criteria: event.target.value })} />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={criterion.requirement === "must"}
                onChange={(event) => setCriterion(index, { requirement: event.target.checked ? "must" : "preferred", importance: event.target.checked ? 3 : 2 })}
              />
              필수
            </label>
            <Button aria-label="기준 삭제" onClick={() => onChange(criteria.filter((_, i) => i !== index))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          disabled={criteria.length >= MAX_CRITERIA}
          title={criteria.length >= MAX_CRITERIA ? `기준은 ${MAX_CRITERIA}개까지예요` : undefined}
          onClick={() => onChange([...criteria, { id: `gtm-${Date.now()}`, name: "", criteria: "", requirement: "preferred", importance: 2 }])}
        >
          <Plus className="h-3.5 w-3.5" />기준 추가
        </Button>
      </div>
    </div>
  );
}

function filledCriteria(criteria: Criteria) {
  return criteria.filter((item) => item.name.trim() && item.criteria.trim());
}

const EXTRA_PLACEHOLDER = "예: 서울 거주, 초기 스타트업 경험 우선, 현 직장 3년 미만은 제외";

function BriefEditor({ brief, extra, onChange, onExtraChange }: {
  brief: GtmBrief; extra: string; onChange: (brief: GtmBrief) => void; onExtraChange: (extra: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block"><Label>Role 이름</Label>
        <TextInput value={brief.roleName} maxLength={160} onChange={(event) => onChange({ ...brief, roleName: event.target.value })} className="w-full" />
      </label>
      <label className="block"><Label>요청 (검색이 읽는 설명)</Label>
        <TextArea rows={5} value={brief.request} maxLength={4_000} onChange={(event) => onChange({ ...brief, request: event.target.value })} className="w-full" />
      </label>
      <label className="block"><Label>추가 요청</Label>
        <TextArea rows={3} value={extra} placeholder={EXTRA_PLACEHOLDER} onChange={(event) => onExtraChange(event.target.value)} className="w-full" />
      </label>
      <CriteriaEditor criteria={brief.criteria} onChange={(criteria) => onChange({ ...brief, criteria })} />
    </div>
  );
}

function editableCriteria(criteria: GtmRoleDetail["criteria"]): Criteria {
  return criteria.map((item, index) => {
    const must = item.requirement === "must";
    return {
      id: item.id ?? `c-${index}`, name: item.name, criteria: item.criteria,
      requirement: must ? "must" : "preferred", importance: item.importance ?? (must ? 3 : 2),
    };
  });
}

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

/** Choice 1 · 우리 DB 검색: Harper members close to the Role (saved, or still on screen), read only. */
function MemberSearch({ action, input, disabled = false, picked, onToggle }: {
  action: string; input: () => Record<string, unknown>; disabled?: boolean;
  picked: string[]; onToggle: (member: MemberFacts) => void;
}) {
  const search = useGtmAction<{ eligibleCount: number; members: MemberFacts[] }>();
  const members = search.result?.members ?? [];
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
            picked={picked}
            onToggle={(talentId) => { const member = members.find((row) => row.talentId === talentId); if (member) onToggle(member); }}
          />
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * A new posting: JD → search criteria (with extra instructions) → 우리 DB 검색 right away (read only) →
 * save it as a Role in Harper's account for the external search. The same posting opens the saved Role.
 */
function NewRole({ writes, onOpen }: { writes: boolean; onOpen: (roleId: string) => void }) {
  const [jd, setJd] = useState<GtmJd | null>(null);
  const [brief, setBrief] = useState<GtmBrief | null>(null);
  const [extra, setExtra] = useState("");
  const draft = useGtmAction<{ brief: GtmBrief }>();
  const existing = useGtmAction<{ role: { roleId: string; name: string; status: string } | null }>();
  const create = useGtmAction<{ dryRun: boolean; reused?: boolean; roleId?: string }>();
  const savedRole = existing.result?.role ?? null;
  const cleanBrief = brief ? { ...brief, criteria: filledCriteria(brief.criteria) } : null;
  const pick = usePickedCandidates();
  return (
    <div className="space-y-4">
      <Panel title="JD">
        <JdInput
          onJd={(next) => {
            setJd(next); setBrief(null); setExtra(""); create.setResult(null); existing.setResult(null); existing.setError(null);
            pick.clear();
            if (next) void existing.run("outreach.findRole", { jd: next });
          }}
        />
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
          title="검색 기준"
          actions={(
            <Button
              onClick={async () => { const result = await draft.run("brief.draft", { jd }); if (result) setBrief(result.brief); }}
              loading={draft.loading}
              title="LLM 1회"
            >
              {brief ? "다시 만들기" : "기준 만들기"}
            </Button>
          )}
        >
          <ErrorNotice message={draft.error} />
          {brief ? <BriefEditor brief={brief} extra={extra} onChange={setBrief} onExtraChange={setExtra} /> : (
            <p className="text-sm text-neutral-muted">JD로 요청과 기준 초안을 만들어요. 고친 뒤 아래에서 검색해요.</p>
          )}
        </Panel>
      ) : null}
      {jd && cleanBrief ? (
        <>
          <MemberSearch
            action="outreach.internalDraft"
            input={() => ({ jd, brief: cleanBrief, extraRequest: extra })}
            disabled={!cleanBrief.roleName.trim() || !cleanBrief.request.trim()}
            picked={pick.picked.filter((item) => item.source === "member").map((item) => item.ref)}
            onToggle={(member) => pick.toggle(memberPick(member))}
          />
          <Panel title={<SectionTitle label={CHOICE.external.label} hint={HINTS.save} />}>
            <p className="text-sm text-neutral-muted">
              외부 검색은 저장한 Role로만 돌아요. 저장하면 이 기준이 ‘Harper GTM’ 워크스페이스에 Role 1개로 남아요(후보·회사에는 안 보여요).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                loading={create.loading}
                disabled={!writes || !cleanBrief.roleName.trim() || !cleanBrief.request.trim()}
                onClick={async () => {
                  const result = await create.run("outreach.createRole", { jd, brief: cleanBrief, extraRequest: extra });
                  if (result && !result.dryRun && result.roleId) onOpen(result.roleId);
                }}
              >
                외부 검색
              </Button>
              <OffReason text={writes ? null : `${WRITES_OFF} · 로컬은 Role을 저장하지 않아요`} />
            </div>
            <ErrorNotice message={create.error} />
            {create.result?.reused ? (
              <p className="mt-2 text-[12px] text-neutral-muted">이 공고로 전에 저장한 Role을 열었어요. 이번에 고친 기준은 그 Role의 검색 기준에서 다시 저장해 주세요.</p>
            ) : null}
          </Panel>
          <ScrapedSearch
            key={`${jd.url ?? ""}|${jd.title}`}
            roleTitle={jd.title}
            description={jd.description}
            isPicked={(ref) => pick.has({ source: "scraped", ref })}
            onToggle={(person) => pick.toggle({ source: "scraped", ref: person.ref, name: person.name, headline: person.headline })}
          />
          <CandidateMailComposer
            picked={pick.picked}
            onRemove={pick.remove}
            onSent={() => undefined}
            writes={writes}
            gtmRoleId={null}
            logRoleId={jd.source === "customer_role" ? jd.sourceRoleId : null}
            companyName={jd.companyName}
            roleTitle={cleanBrief.roleName || jd.title}
            description={jd.description}
            defaultPostingUrl={jd.url}
            location={jd.location}
          />
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

function RoleDetail({ roleId, writes, onChanged }: { roleId: string; writes: boolean; onChanged: () => void }) {
  const load = useGtmAction<{ role: GtmRoleDetail }>();
  const search = useGtmAction<{ status: string; reason?: string }>();
  const toggleOpen = useGtmAction<{ status: string }>();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const pick = usePickedCandidates();
  const { run } = load;
  const reload = useCallback(() => { void run("outreach.role", { roleId }); }, [run, roleId]);
  // Remounted per Role (key), so the selection starts empty.
  useEffect(() => { reload(); }, [reload]);
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
  return (
    <div className="space-y-4">
      <Panel
        title={role.name}
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

      <MemberSearch
        key={roleId}
        action="outreach.internal"
        input={() => ({ roleId })}
        picked={pick.picked.filter((item) => item.source === "member").map((item) => item.ref)}
        onToggle={(member) => pick.toggle(memberPick(member))}
      />

      <Panel
        title={<SectionTitle label={CHOICE.external.label} hint={HINTS.external} />}
        actions={(
          <>
            <Badge tone={role.search?.status === "failed" ? "critical" : "default"}>
              {role.search ? `${SEARCH_LABEL[role.search.status] ?? role.search.status} · ${formatKst(role.search.finishedAt ?? role.search.startedAt)}` : "검색 전"}
            </Badge>
            <OffReason text={searchOff} />
            <Button
              variant="primary"
              disabled={Boolean(searchOff)}
              loading={search.loading}
              title="1회 약 $1~4, 3~6분"
              onClick={async () => { if (await search.run("outreach.search", { roleId })) { reload(); onChanged(); } }}
            >
              외부 검색
            </Button>
          </>
        )}
      >
        <ErrorNotice message={search.error} />
        {search.result && search.result.status !== "queued" ? (
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
      <ScrapedSearch
        key={roleId}
        roleTitle={role.name.split(" · ").slice(-1)[0] ?? role.name}
        description={[role.description ?? "", role.request ?? ""].filter(Boolean).join("\n\n")}
        isPicked={(ref) => pick.has({ source: "scraped", ref })}
        onToggle={(person) => pick.toggle({ source: "scraped", ref: person.ref, name: person.name, headline: person.headline })}
      />
      <CandidateMailComposer
        picked={pick.picked}
        onRemove={pick.remove}
        onSent={reload}
        writes={writes}
        gtmRoleId={roleId}
        logRoleId={roleId}
        companyName={role.companyName}
        roleTitle={role.name.split(" · ").slice(-1)[0] ?? role.name}
        description={[role.description ?? "", role.request ?? ""].filter(Boolean).join("\n\n").slice(0, 20_000)}
        defaultPostingUrl={role.postingUrl}
      />
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
  const { run } = roles;
  const reload = useCallback(() => { void run("outreach.roles"); }, [run]);
  useEffect(() => { reload(); }, [reload]);
  const saved = roles.result?.roles ?? [];
  const open = (roleId: string) => { reload(); setSelected(roleId); };
  return (
    <div className="space-y-4">
      {saved.length || selected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 text-neutral-muted">저장한 Role<Hint label="저장한 Role" text={HINTS.saved} /></span>
          <Select value={selected ?? ""} onChange={(event) => setSelected(event.target.value || null)} className="min-w-[320px]" aria-label="저장한 Role">
            <option value="">새 공고로 시작</option>
            {saved.map((role) => (
              <option key={role.roleId} value={role.roleId}>
                {role.name}{role.source ? ` · ${ROLE_SOURCE_LABEL[role.source]}` : ""} · {STATUS_LABEL[role.status] ?? role.status}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <ErrorNotice message={roles.error} />
      {selected
        ? <RoleDetail key={selected} roleId={selected} writes={writes} onChanged={reload} />
        : <NewRole writes={writes} onOpen={open} />}
    </div>
  );
}
