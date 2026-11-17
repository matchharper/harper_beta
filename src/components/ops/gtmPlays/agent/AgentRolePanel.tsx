import { useCallback, useEffect, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { GtmRoleSummary } from "@/lib/gtmPlays/outreach.server";
import type { RoleRunView } from "@/lib/gtmPlays/agent/role.server";
import type { AgentCandidateSource } from "@/lib/gtmPlays/agent/types";
import type { AgentRun } from "@/lib/gtmPlays/agent/store.server";
import { formatKst, useGtmAction } from "../api";
import { JdInput } from "../JdInput";
import { BriefEditor, useRoleStart } from "../RoleBrief";
import { Badge, Button, ErrorNotice, Hint, Label, Select, TextInput } from "../ui";
import { CANDIDATE_SOURCE_LABEL, usd } from "./labels";

/** Plain words for each part of the panel (ⓘ). */
const HINTS = {
  panel: "고른 Role 하나로 사람을 찾아 그 Role 메일을 보내요(#4 후보 메일과 같은 메일). 찾은 사람은 에이전트의 다른 사람처럼 제외 확인 → 메일 초안 → (승인) → 보내는 시간·하루 한도 안에서 발송 → 7일 뒤 후속 메일로 이어지고, 아래 ‘사람’ 목록과 숫자 표에 ‘Role로 찾기’로 나와요. 메일 주소가 있는 사람에게만 연락해요.",
  saved: "#4에서 저장했거나 여기서 만든 Role이에요. 고객사 Role로 만든 Role이면 메일·기록·가입 후 ‘내 기회’는 모두 진짜 고객사 Role로 남아요(사본은 외부 검색에만 써요).",
  new: "고객사 Role을 고르거나 공고 URL·JD를 넣으면 검색 기준 초안이 바로 만들어져요(LLM 1회). 고칠 곳만 고치고 ‘Role 저장’을 누르면 고를 수 있어요. 같은 공고는 전에 저장한 Role을 열어요.",
  member: "Role 내용으로 하퍼 회원 중 가까운 사람을 찾아요(#4 Choice 1과 같은 계산). 비용은 거의 없어요. 회원도 Role 메일은 받아요.",
  scraped: "스크랩한 프로필 DB에서 키워드로 찾아요(#4 Choice 3). 키워드를 비우면 Role로 키워드를 만들어요(LLM 1회).",
  external: "웹·LinkedIn에서 하퍼 밖 사람을 찾고(1회 약 $1~4, 3~6분), 추천 순서대로 이 숫자만큼 이메일을 찾아요(1명 약 $0.12). 이메일을 찾은 사람만 연락해요.",
  draftOnly: "찾기만은 메일을 초안까지만 써요. ‘승인 대기’에서 읽고 승인하면 나가요.",
} as const;

const SOURCE_KEYS: AgentCandidateSource[] = ["member", "scraped", "external"];
const SOURCE_MAX: Record<AgentCandidateSource, number> = { member: 50, scraped: 50, external: 20 };
const ROLE_SOURCE_LABEL: Record<NonNullable<GtmRoleSummary["source"]>, string> = {
  customer_role: "고객사 Role", url: "외부 공고", text: "외부 JD",
};
const RUN_STATUS: Record<AgentRun["status"], string> = { queued: "진행 중", running: "실행 중", done: "끝남", failed: "실패", stopped: "중지" };
const EXTERNAL_PHASE: Record<string, string> = { requested: "외부 검색 기다림", lookups: "이메일 찾는 중", done: "외부 검색 끝" };

type Sources = Record<AgentCandidateSource, { enabled: boolean; max: number }>;

/** Role runs: when, which Role, from where, and what came of the people. */
function RoleRunList({ runs }: { runs: RoleRunView[] }) {
  if (!runs.length) return <p className="text-[12px] text-neutral-muted">아직 Role로 찾은 기록이 없어요.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[12px]">
        <thead className="text-left text-neutral-muted">
          <tr>
            <th className="py-1.5 pr-3 font-normal">시작</th>
            <th className="px-2 py-1.5 font-normal">Role</th>
            <th className="px-2 py-1.5 font-normal">찾을 곳</th>
            <th className="px-2 py-1.5 font-normal">상태</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right font-normal">찾음 · 제외 · 대기 · 연락 · 클릭 · 가입</th>
            <th className="px-2 py-1.5 text-right font-normal">비용</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {runs.map((run) => {
            const n = run.numbers;
            const from = SOURCE_KEYS.filter((key) => run.sources[key]?.enabled)
              .map((key) => `${CANDIDATE_SOURCE_LABEL[key]} ${run.counts[`role_found_${key}`] ?? 0}${key === "external" ? "" : `/${run.sources[key].max}`}`);
            return (
              <tr key={run.id} className="align-top">
                <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-neutral-muted">{formatKst(run.createdAt)}</td>
                <td className="px-2 py-1.5">
                  {run.roleName ?? "—"}
                  {run.isTest ? <span className="ml-1 text-neutral-muted">테스트</span> : null}
                  {run.draftOnly ? <span className="ml-1 text-neutral-muted">· 찾기만</span> : null}
                </td>
                <td className="px-2 py-1.5 text-neutral-muted">
                  {from.join(" · ") || "—"}
                  {run.externalPhase ? <span className="block">{EXTERNAL_PHASE[run.externalPhase] ?? run.externalPhase}{run.externalNote ? ` · ${run.externalNote}` : ""}</span> : null}
                  {run.keywords.length ? <span className="block">키워드: {run.keywords.join(", ")}</span> : null}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <Badge tone={run.status === "failed" ? "critical" : run.status === "done" ? "positive" : "default"}>{RUN_STATUS[run.status]}</Badge>
                  {run.error ? <span className="ml-1 text-critical">{run.error}</span> : null}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {n.found} · {n.excluded} · {n.waiting + n.queuedHuman} · {n.contacted} · {n.clicked} · <b>{n.signedUp}</b>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-neutral-muted">{usd(run.costUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * #5 "Role로 사람 찾기" (what #4 후보자 아웃바운드 did, inside #5): pick or make a Role, choose where to look and how
 * many, then 찾아서 보내기 or 찾기만. The dispatcher searches one place per tick; the people then walk the #5 steps.
 */
export default function AgentRolePanel({ writes, includeTest, agentOn, refreshKey, onStarted }: {
  writes: boolean; includeTest: boolean;
  /** The agent is on (off: a started run waits). */
  agentOn: boolean;
  refreshKey: number;
  onStarted: () => void;
}) {
  const [mode, setMode] = useState<"saved" | "new">("saved");
  const [roleId, setRoleId] = useState("");
  const [sources, setSources] = useState<Sources>({
    member: { enabled: true, max: 20 }, scraped: { enabled: true, max: 20 }, external: { enabled: false, max: 5 },
  });
  const [keywords, setKeywords] = useState("");
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [isTest, setIsTest] = useState(true);
  const roles = useGtmAction<{ roles: GtmRoleSummary[] }>();
  const runs = useGtmAction<{ runs: RoleRunView[] }>();
  const startRun = useGtmAction<{ run: AgentRun }>();
  const start = useRoleStart();
  const { run: loadRoles } = roles;
  const { run: loadRuns } = runs;
  const reloadRoles = useCallback(() => { void loadRoles("outreach.roles"); }, [loadRoles]);
  useEffect(() => { reloadRoles(); }, [reloadRoles]);
  useEffect(() => { void loadRuns("agent.role.runs", { includeTest }); }, [loadRuns, includeTest, refreshKey]);

  const list = (roles.result?.roles ?? []).filter((role) => role.kind === "gtm");
  const role = list.find((item) => item.roleId === roleId) ?? null;
  const externalOff = role && role.status !== "active" ? "끝낸 Role이라 외부 검색은 안 돼요" : null;
  const chosen = SOURCE_KEYS.filter((key) => sources[key].enabled && sources[key].max > 0 && !(key === "external" && externalOff));
  const setSource = (key: AgentCandidateSource, patch: Partial<Sources[AgentCandidateSource]>) =>
    setSources((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const pickRole = (id: string) => { setRoleId(id); setMode("saved"); startRun.setResult(null); };

  const begin = async (draftOnly: boolean) => {
    if (!role) return;
    const result = await startRun.run("agent.role.start", {
      roleId: role.roleId, isTest, draftOnly, language,
      sources: Object.fromEntries(SOURCE_KEYS.map((key) => [key, {
        enabled: chosen.includes(key), max: Math.min(Math.max(Math.trunc(sources[key].max) || 0, 0), SOURCE_MAX[key]),
      }])),
      keywords: keywords.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    });
    if (result) { void loadRuns("agent.role.runs", { includeTest }); onStarted(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-muted">
        <Hint label="Role로 사람 찾기" text={HINTS.panel} />
        <span>Role 하나로 사람을 찾아 그 Role 메일을 보내요. 메일 주소가 있는 사람에게만 연락해요.</span>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="Role 고르는 방법">
          {([["saved", "저장한 Role"], ["new", "고객사 Role · 새 공고"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={cx("h-8 rounded-md px-3 text-sm", mode === key ? "bg-surface-inverse text-neutral-00" : "bg-bg-weak hover:bg-bg-weak/70")}
            >
              {label}
            </button>
          ))}
          <Hint label="Role 고르기" text={mode === "saved" ? HINTS.saved : HINTS.new} />
        </div>
        {mode === "saved" ? (
          <div className="space-y-2">
            <Select value={roleId} onChange={(event) => pickRole(event.target.value)} className="w-full max-w-xl" aria-label="Role">
              <option value="">Role을 골라 주세요</option>
              {list.map((item) => (
                <option key={item.roleId} value={item.roleId}>
                  {item.name}{item.source ? ` · ${ROLE_SOURCE_LABEL[item.source]}` : ""}{item.status !== "active" ? " · 끝냄" : ""}
                </option>
              ))}
            </Select>
            <ErrorNotice message={roles.error} />
            {role?.source === "customer_role" ? (
              <p className="text-[12px] text-neutral-muted">고객사 Role로 만든 Role이에요. 메일과 기록, 가입 뒤 ‘내 기회’는 진짜 고객사 Role로 남아요.</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <JdInput onJd={start.takeJd} />
            {start.savedRole ? (
              <div className={cx(opsTheme.panelMuted, "flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
                <span>이 공고로 저장한 Role이 있어요:</span>
                <span className="font-medium">{start.savedRole.name}</span>
                <Button variant="primary" onClick={() => { reloadRoles(); pickRole(start.savedRole!.roleId); }}>이 Role 고르기</Button>
              </div>
            ) : null}
            <ErrorNotice message={start.existing.error ?? start.draft.error} />
            {start.jd && !start.savedRole ? (
              start.brief ? (
                <div className="space-y-3">
                  <BriefEditor brief={start.brief} extra={start.extra} onChange={start.setBrief} onExtraChange={start.setExtra} showPublicDescription={start.outside} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      loading={start.create.loading}
                      disabled={!writes || !start.briefReady}
                      onClick={async () => {
                        const result = await start.saveRole();
                        if (result && !result.dryRun && result.roleId) { reloadRoles(); pickRole(result.roleId); }
                      }}
                    >
                      Role 저장
                    </Button>
                    {!writes ? <span className="text-[12px] text-neutral-muted">쓰기 꺼짐 · 저장하지 않아요</span> : null}
                  </div>
                  <ErrorNotice message={start.create.error} />
                </div>
              ) : <p className="text-sm text-neutral-muted">{start.draft.loading ? "JD로 검색 기준 초안을 만들고 있어요 (10초쯤)" : "JD를 읽으면 검색 기준 초안을 만들어요."}</p>
            ) : null}
          </div>
        )}
      </div>

      {mode === "saved" && role ? (
        <div className={cx(opsTheme.panelSoft, "space-y-3 p-4")}>
          <p className="text-sm font-medium">{role.name}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {SOURCE_KEYS.map((key) => {
              const off = key === "external" ? externalOff : null;
              return (
                <div key={key} className={cx(opsTheme.panelMuted, "space-y-1 px-3 py-2")}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sources[key].enabled && !off} disabled={Boolean(off)}
                      onChange={(event) => setSource(key, { enabled: event.target.checked })} />
                    {CANDIDATE_SOURCE_LABEL[key]}
                    <Hint label={CANDIDATE_SOURCE_LABEL[key]} text={HINTS[key]} />
                  </label>
                  <label className="flex items-center gap-2 whitespace-nowrap text-[12px] text-neutral-muted">
                    {key === "external" ? "이메일 찾기" : "최대"}
                    <span className="w-16 shrink-0">
                      <TextInput type="number" min={1} max={SOURCE_MAX[key]} value={sources[key].max} className="w-full"
                        aria-label={`${CANDIDATE_SOURCE_LABEL[key]} 사람 수`} onChange={(event) => setSource(key, { max: Number(event.target.value) })} />
                    </span>
                    명{key === "external" ? ` · 약 ${usd(sources.external.max * 0.12)}` : ""}
                  </label>
                  {off ? <p className="text-[12px] text-neutral-muted">{off}</p> : null}
                </div>
              );
            })}
          </div>
          {sources.scraped.enabled ? (
            <label className="block"><Label>스크랩 DB 키워드 (쉼표로, 비우면 Role로 만들어요)</Label>
              <TextInput value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="예: backend engineer, 백엔드" className="w-full max-w-xl" />
            </label>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-2 whitespace-nowrap">메일 언어
              <Select value={language} onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "ko")} className="w-28">
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </Select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isTest} onChange={(event) => setIsTest(event.target.checked)} />
              테스트 실행 (숫자에서 빠져요)
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={startRun.loading} disabled={!writes || !chosen.length} onClick={() => void begin(false)}>
              찾아서 보내기
            </Button>
            <Button loading={startRun.loading} disabled={!writes || !chosen.length} onClick={() => void begin(true)}>
              찾기만
            </Button>
            <Hint label="찾기만" text={HINTS.draftOnly} />
            {!writes ? <span className="text-[12px] text-neutral-muted">쓰기 꺼짐</span> : null}
          </div>
          {!agentOn ? <p className="text-[12px] text-neutral-muted">에이전트가 꺼져 있어요. 켜야 찾기를 시작해요(설정에서 켜요).</p> : null}
          <ErrorNotice message={startRun.error} />
          {startRun.result ? (
            <p className={opsTheme.successNotice}>시작했어요. 5분마다 한 곳씩 찾고, 찾은 사람은 아래 기록과 ‘사람’ 목록에 나와요.</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-[12px] font-medium text-neutral-muted">Role로 찾은 기록</p>
        <ErrorNotice message={runs.error} />
        <RoleRunList runs={runs.result?.runs ?? []} />
      </div>
    </div>
  );
}
