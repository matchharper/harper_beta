import { useCallback, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { LOOKUP_REASON_LABEL } from "@/lib/gtmPlays/agent/emailLookup";
import { AGENT_EXCLUDE_BUCKETS, type AgentExcludeBucket } from "@/lib/gtmPlays/agent/funnel";
import {
  AGENT_STAGES, LOG_AFTER_FILTERS, type AgentReached, type AgentStage, type ContactOutcome, type LogAfterFilter,
} from "@/lib/gtmPlays/agent/stage";
import type { AgentPeriodInput } from "@/lib/gtmPlays/agent/period";
import type { AgentEmailLookup, AgentPerson } from "@/lib/gtmPlays/agent/types";
import type { AgentMailFacts } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice, Select, TextInput } from "../ui";
import { LogSplit, LogTable, MailText, PersonCell, type LogRowView } from "./AgentLogTable";
import { PostingQuality } from "./AgentPostingQuality";
import {
  AFTER_FILTER_LABEL, EVENT_LABEL, EXCLUDE_BUCKET_LABEL, METHOD_LABEL, POSTING_KIND_LABEL, STAGE_LABEL, byLabel, personName,
  personStage, sourceLabel, usd,
} from "./labels";

const PAGE = 50;

/**
 * The postings a message proposes: company · title, kind, why it fits, and its 추천 품질 (적합 점수, 따로 채점) with
 * Ops's 맞음 / 안 맞음.
 */
export function PostingList({ person, onPerson }: { person: Pick<AgentPerson, "id" | "postings">; onPerson: (person: AgentPerson) => void }) {
  if (!person.postings.length) return <p className="text-[12px] text-neutral-muted">고른 공고가 없어요.</p>;
  return (
    <ul className="space-y-3 text-[13px]">
      {person.postings.map((posting, index) => (
        <li key={`${posting.roleId ?? posting.url ?? index}`}>
          <span className="font-medium">{posting.companyName} · {posting.title}</span>
          <span className="ml-1 text-[11px] text-neutral-muted">{POSTING_KIND_LABEL[posting.kind]}</span>
          {posting.url ? (
            <a href={posting.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-neutral-muted" aria-label="공고 열기">
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
          {posting.why ? <p className="text-[12px] text-neutral-muted">{posting.why}</p> : null}
          <PostingQuality personId={person.id} posting={posting} index={index} onPerson={onPerson} />
        </li>
      ))}
    </ul>
  );
}

/** What made the agent pick the person: the post or the application, with its link. */
export function SignalLine({ person }: { person: Pick<AgentPerson, "signalText" | "signalUrl" | "signalAt"> }) {
  if (!person.signalText && !person.signalUrl) return null;
  return (
    <p className="text-[12px] text-neutral-muted">
      {person.signalAt ? `${formatKst(person.signalAt)} · ` : ""}
      {person.signalText ? <span className="whitespace-pre-line">{person.signalText.slice(0, 400)}</span> : null}
      {person.signalUrl ? (
        <a href={person.signalUrl} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>원문</a>
      ) : null}
    </p>
  );
}

/** The email lookup, when there was one: still running, or how it ended, what it cost and the page the address was on. */
function LookupLine({ lookup }: { lookup: AgentEmailLookup | null }) {
  if (!lookup) return null;
  const text = lookup.state === "running" ? `찾는 중 · ${formatKst(lookup.startedAt)}에 시작`
    : lookup.used ? "찾음" : `못 찾음 · ${LOOKUP_REASON_LABEL[lookup.reason ?? "not_found"] ?? lookup.reason}`;
  return (
    <p className="text-[12px] text-neutral-muted">
      이메일 찾기: {text}{lookup.costUsd ? ` · ${usd(lookup.costUsd)}` : ""}
      {lookup.sourceUrl ? (
        <a href={lookup.sourceUrl} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>주소가 나온 페이지</a>
      ) : null}
    </p>
  );
}

type ListedPerson = AgentPerson & { reached: AgentReached | null };

/** The stage in the numbers' words and the step inside it: "처리 중 · 이메일 찾는 중", "연락 · 클릭함", … */
function StatusBadge({ person }: { person: ListedPerson }) {
  const { stage, label, detail } = personStage(person);
  const tone = person.status === "failed" ? "critical" : stage === "contacted" || stage === "replied" ? "positive" : "default";
  return <Badge tone={tone}>{label}{detail ? ` · ${detail}` : ""}</Badge>;
}

/** A mail as it went out: the rendered mail (sandboxed, no scripts), or its text without raw links. */
function MailCard({ mail }: { mail: AgentMailFacts }) {
  return (
    <div className={cx(opsTheme.panelMuted, "space-y-1 px-3 py-2 text-[12px]")}>
      <p className="font-medium text-neutral-primary">{mail.kind === "followup" ? "후속 메일" : "첫 메일"} · {mail.subject}</p>
      <p className="text-neutral-muted">
        {formatKst(mail.sentAt)} · {mail.fromEmail} → {mail.toEmail}
        {mail.deliveryStatus ? ` · ${mail.deliveryStatus === "bounced" ? "반송" : mail.deliveryStatus === "complained" ? "스팸 신고" : "발송 실패"}` : ""}
        {mail.firstOpenedAt ? ` · 클릭 ${formatKst(mail.firstOpenedAt)}` : ""}
        {mail.claimedAt ? ` · 가입 ${formatKst(mail.claimedAt)}` : ""}
        {mail.unsubscribedAt ? " · 수신 거부" : ""}
      </p>
      {mail.html ? (
        <iframe title={mail.subject} sandbox="" srcDoc={mail.html} className="h-[420px] w-full rounded border border-neutral-1000-a05 bg-white" />
      ) : <MailText text={mail.textBody.slice(0, 3_000)} />}
    </div>
  );
}

/**
 * 답장 옴 / 연락 그만 요청 on a mailed person (Shaun 11/17: two buttons, no text): either stops the follow-up and counts
 * in 답장; 연락 그만 요청 also puts the address on the do-not-contact list. A reply found in a team mailbox is already
 * 답장 옴, and one that asks to stop ("연락하지 마세요", "수신 거부", "unsubscribe" …) is already 연락 그만 요청 (the
 * timeline quotes the words), so only 연락 그만 요청 is left, for a request worded otherwise.
 */
function ReplyButtons({ person, onDone }: { person: AgentPerson; onDone: () => void }) {
  const action = useGtmAction<{ person: AgentPerson }>();
  const [which, setWhich] = useState<"replied" | "stop" | null>(null);
  const mark = async (stop: boolean) => {
    setWhich(stop ? "stop" : "replied");
    if (await action.run("agent.person.replied", { id: person.id, stop })) onDone();
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {person.status === "sent" ? <Button loading={action.loading && which === "replied"} disabled={action.loading} onClick={() => void mark(false)}>답장 옴</Button> : null}
        <Button loading={action.loading && which === "stop"} disabled={action.loading} onClick={() => void mark(true)}>연락 그만 요청</Button>
      </div>
      {person.followupDueAt ? <p className="text-[12px] text-neutral-muted">답장이 없으면 {formatKst(person.followupDueAt)}에 후속 메일이 나가요.</p> : null}
      <ErrorNotice message={action.error} />
    </div>
  );
}

/** One person: who, why, what was proposed and sent, and every step with time and who did it. */
export function Timeline({ id, onClose }: { id: string; onClose: () => void }) {
  const load = useGtmAction<{ timeline: { person: ListedPerson; mails: AgentMailFacts[] } | null }>();
  const { run } = load;
  useEffect(() => { void run("agent.timeline", { id }); }, [run, id]);
  const timeline = load.result?.timeline ?? null;
  const person = timeline?.person ?? null;
  return (
    <div className={cx(opsTheme.panelSoft, "min-w-0 space-y-3 break-words p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{person ? personName(person).name : "불러오는 중"}{person?.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}</p>
          {person ? (
            <p className="text-[12px] text-neutral-muted">
              {[person.headline, person.currentCompany, person.location].filter(Boolean).join(" · ")}
              {person.profileUrl ? <a href={person.profileUrl.startsWith("http") ? person.profileUrl : `https://${person.profileUrl}`} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>프로필</a> : null}
            </p>
          ) : null}
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-neutral-muted hover:bg-bg-weak hover:text-neutral-primary">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ErrorNotice message={load.error} />
      {load.loading && !person ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      {person ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <StatusBadge person={person} />
            <span className="text-neutral-muted">
              {sourceLabel(person.source)} · {METHOD_LABEL[person.method] ?? person.method}
              {person.settingsVersion ? ` · 설정 v${person.settingsVersion}` : ""}
            </span>
            {person.email ? <span className="text-neutral-muted">· {person.email}{person.emailSource === "lookup" ? " (찾은 주소)" : ""}</span> : null}
            <span className="text-neutral-muted">· 비용 {usd(person.costUsd)}</span>
          </div>
          <SignalLine person={person} />
          <LookupLine lookup={person.emailLookup} />
          <div>
            <p className="mb-1 text-[12px] font-medium text-neutral-muted">제안한 공고</p>
            <PostingList
              person={person}
              onPerson={(updated) => load.setResult({ timeline: timeline ? { ...timeline, person: { ...updated, reached: person.reached } } : null })}
            />
            {person.reason ? <p className="mt-1 text-[12px] text-neutral-muted">공고 고르기: {person.reason}</p> : null}
          </div>
          {person.draftBody && !timeline?.mails.length ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">써 둔 메일{person.draftSubject ? ` · ${person.draftSubject}` : ""}</p>
              <MailText text={person.draftBody.slice(0, 3_000)} />
            </div>
          ) : null}
          {timeline?.mails.map((mail) => <MailCard key={mail.id} mail={mail} />)}
          {person.status === "sent" || (person.status === "replied" && !person.endedAt)
            ? <ReplyButtons person={person} onDone={() => void run("agent.timeline", { id })} /> : null}
          {person.replyText ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">답장</p>
              <p className="whitespace-pre-line text-[13px]">{person.replyText}</p>
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-[12px] font-medium text-neutral-muted">타임라인</p>
            <ol className="space-y-1 text-[12px]">
              {person.events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="grid grid-cols-[6.5rem_3.5rem_5.5rem_minmax(0,1fr)] gap-x-2">
                  <span className="whitespace-nowrap tabular-nums text-neutral-muted">{formatKst(event.at)}</span>
                  <span className="whitespace-nowrap text-neutral-muted">{byLabel(event.by)}</span>
                  <span className="whitespace-nowrap font-medium">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                  <span className="min-w-0 break-words text-neutral-muted">{eventNote(event)}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** One search (its run and tuning version; the source only when there is no search log) or one uploaded file. */
export type FoundBy = { id: string; source: string | null; tuningVersion: string | null; label: string };

export type PeopleFilter = {
  source: string | null;
  stage: AgentStage | null;
  after: LogAfterFilter | null;
  /** With 단계 제외: only the people of this reason (the 제외 number's hover words). */
  reason: AgentExcludeBucket | null;
  /** The people one search (a site in a run) or one uploaded file found, with the chip's words. */
  run: FoundBy | null;
  /** The people found on one KST day (a 하루별 성능 number), instead of the whole period. */
  day: string | null;
  q: string;
};

export const NO_PEOPLE_FILTER: PeopleFilter = { source: null, stage: null, after: null, reason: null, run: null, day: null, q: "" };

type PeopleLine = { person: ListedPerson; reached: AgentReached | null; outcome: ContactOutcome | null; at: string; mail: { subject: string | null; body: string | null } | null };

/** An event's words for Ops: an exclusion's rule as the screen names it ("recent_contact" → its Korean label). */
function eventNote(event: { kind: string; note?: string | null }): string {
  const note = event.note ?? "";
  if (event.kind === "excluded" && note in EXCLUDE_BUCKET_LABEL) return EXCLUDE_BUCKET_LABEL[note as keyof typeof EXCLUDE_BUCKET_LABEL];
  return note;
}

/** The last step with words: what the agent is doing (처리 중) or why it stopped (제외), in one line. */
function lastStep(person: AgentPerson): string | null {
  const event = [...person.events].reverse().find((item) => item.note) ?? person.events.at(-1);
  if (!event) return null;
  const note = eventNote(event);
  return `${EVENT_LABEL[event.kind] ?? event.kind}${note ? ` · ${note}` : ""}`;
}

/** 내용: for a mailed person the mail (subject, postings, first lines); else the post they were found by and the last step. */
function LineContent({ line }: { line: PeopleLine }) {
  const { person, mail } = line;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  if (person.sentAt) {
    return (
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium">{mail?.subject ?? person.draftSubject ?? "(제목 없음)"}</p>
        {person.postings.length ? (
          <p className="text-[12px] text-neutral-muted">{person.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join("  /  ")}</p>
        ) : null}
        {mail?.body ? <div className="rounded-md bg-bg-weak px-3 py-2"><MailText text={mail.body} clamp /></div> : null}
      </div>
    );
  }
  const step = lastStep(person);
  return (
    <div className="min-w-0 space-y-0.5 text-[12px] leading-5">
      {person.signalText || person.signalUrl ? (
        <p className="line-clamp-1 text-neutral-muted">
          <span className="font-medium text-neutral-primary">찾은 글</span> {person.signalText?.slice(0, 200) ?? ""}
          {person.signalUrl ? <a href={person.signalUrl} target="_blank" rel="noreferrer" onClick={stop} className={cx(opsTheme.link, "ml-1")}>원문</a> : null}
        </p>
      ) : null}
      {step ? <p className="line-clamp-1 text-neutral-muted"><span className="font-medium text-neutral-primary">마지막 단계</span> {step}</p> : null}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-neutral-1000-a10 bg-bg-weak px-2.5 py-0.5 text-[12px]">
      {label}
      <button type="button" aria-label={`${label} 빼기`} onClick={onClear} className="text-neutral-muted hover:text-neutral-primary">×</button>
    </span>
  );
}

/**
 * 로그 · 사람: everyone the agent found in the numbers' period, one line each (시각 · 사람 · 찾은 곳 · 단계 · 내용), with
 * the numbers' own filters, so a clicked number shows exactly its people. A line opens the person on the right.
 */
export default function AgentPeople({ period, includeTest, refreshKey, sources, filter, onFilter }: {
  /** The numbers' period (최근 N일 or a KST date range), so a number and its people match. */
  period: AgentPeriodInput; includeTest: boolean; refreshKey: number; sources: string[];
  filter: PeopleFilter; onFilter: (filter: PeopleFilter) => void;
}) {
  const [q, setQ] = useState(filter.q);
  const [selected, setSelected] = useState<string | null>(null);
  // A page belongs to one set of filters; changing a filter starts again at the first page.
  const key = JSON.stringify([period, includeTest, filter]);
  const [page, setPage] = useState({ key, offset: 0 });
  const offset = page.key === key ? page.offset : 0;
  const setOffset = (value: number) => setPage({ key, offset: value });
  const list = useGtmAction<{ lines: PeopleLine[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.people", {
      ...(filter.day ? { from: filter.day, to: filter.day } : period), includeTest, source: filter.run ? (filter.run.tuningVersion ? null : filter.run.source) : filter.source,
      stage: filter.stage, after: filter.after, reason: filter.reason, runId: filter.run?.id ?? null, tuningVersion: filter.run?.tuningVersion ?? null,
      q: filter.q || null, limit: PAGE, offset,
    });
  }, [run, period, includeTest, filter, offset]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const lines = list.result?.lines ?? [];
  const total = list.result?.total ?? 0;
  const set = (patch: Partial<PeopleFilter>) => onFilter({ ...filter, ...patch });
  const views: LogRowView[] = lines.map((line) => {
    const who = personName(line.person);
    return {
      key: line.person.id, at: line.at,
      person: <PersonCell name={who.name} intro={who.intro} email={line.person.email} />,
      source: sourceLabel(line.person.source),
      stage: <StatusBadge person={{ ...line.person, reached: line.reached }} />,
      content: <LineContent line={line} />,
    };
  });
  const chips = [
    filter.run ? { label: filter.run.label, clear: () => set({ run: null }) } : null,
    !filter.run && filter.source ? { label: sourceLabel(filter.source), clear: () => set({ source: null }) } : null,
    filter.day ? { label: `${Number(filter.day.slice(5, 7))}. ${Number(filter.day.slice(8, 10))}. 찾은 사람`, clear: () => set({ day: null }) } : null,
    filter.stage ? { label: STAGE_LABEL[filter.stage], clear: () => set({ stage: null, reason: null }) } : null,
    filter.reason ? { label: `제외 · ${EXCLUDE_BUCKET_LABEL[filter.reason]}`, clear: () => set({ reason: null }) } : null,
    filter.after ? { label: AFTER_FILTER_LABEL[filter.after], clear: () => set({ after: null }) } : null,
    filter.q ? { label: `"${filter.q}"`, clear: () => { setQ(""); set({ q: "" }); } } : null,
  ].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-neutral-muted">단계</span>
        <span className="w-28 shrink-0">
          <Select value={filter.stage ?? ""} onChange={(event) => {
            const stage = (event.target.value || null) as AgentStage | null;
            set({ stage, ...(stage === "excluded" ? {} : { reason: null }) });
          }} className="w-28">
            <option value="">전체</option>
            {AGENT_STAGES.map((value) => <option key={value} value={value}>{STAGE_LABEL[value]}</option>)}
          </Select>
        </span>
        {filter.stage === "excluded" ? (
          <>
            <span className="text-neutral-muted">제외 이유</span>
            <span className="w-40 shrink-0">
              <Select value={filter.reason ?? ""} onChange={(event) => set({ reason: (event.target.value || null) as AgentExcludeBucket | null })} className="w-40">
                <option value="">전체</option>
                {AGENT_EXCLUDE_BUCKETS.map((value) => <option key={value} value={value}>{EXCLUDE_BUCKET_LABEL[value]}</option>)}
              </Select>
            </span>
          </>
        ) : null}
        <span className="text-neutral-muted">찾은 곳</span>
        <span className="w-36 shrink-0">
          <Select value={filter.source ?? ""} onChange={(event) => set({ source: event.target.value || null, run: null })} className="w-36">
            <option value="">전체</option>
            {sources.map((value) => <option key={value} value={value}>{sourceLabel(value)}</option>)}
          </Select>
        </span>
        <span className="text-neutral-muted">메일 반응</span>
        <span className="w-32 shrink-0">
          <Select value={filter.after ?? ""} onChange={(event) => set({ after: (event.target.value || null) as LogAfterFilter | null })} className="w-32">
            <option value="">전체</option>
            {LOG_AFTER_FILTERS.map((value) => <option key={value} value={value}>{AFTER_FILTER_LABEL[value]}</option>)}
          </Select>
        </span>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); set({ q: q.trim() }); }}>
          <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="이름·회사·메일·글 검색" className="w-52" />
          <Button type="submit" className="whitespace-nowrap">찾기</Button>
        </form>
        <span className="text-neutral-muted">{total}명</span>
      </div>
      {chips.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => <Chip key={chip.label} label={chip.label} onClear={chip.clear} />)}
          <button type="button" className="text-[12px] text-neutral-muted underline" onClick={() => { setQ(""); onFilter(NO_PEOPLE_FILTER); }}>모두 지우기</button>
        </div>
      ) : null}
      <ErrorNotice message={list.error} />
      <LogSplit
        detail={selected ? <Timeline key={selected} id={selected} onClose={() => setSelected(null)} /> : null}
        list={(
          <LogTable
            rows={views}
            selected={selected}
            onSelect={setSelected}
            loading={list.loading}
            empty={chips.length ? "이 조건에 맞는 사람이 없어요." : "이 기간에 찾은 사람이 없어요. 에이전트가 찾은 사람과 지금 단계, 보낸 메일이 여기에 쌓여요."}
          />
        )}
      />
      {total > PAGE ? (
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>이전</Button>
          <span className="text-neutral-muted">{offset + 1}–{Math.min(offset + PAGE, total)} / {total}</span>
          <Button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>다음</Button>
        </div>
      ) : null}
    </div>
  );
}
