import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { LOOKUP_REASON_LABEL } from "@/lib/gtmPlays/agent/emailLookup";
import type { AgentEmailLookup, AgentPerson, AgentStatus } from "@/lib/gtmPlays/agent/types";
import type { AgentMailFacts } from "@/lib/gtmPlays/agent/views.server";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice, Select, TextInput } from "../ui";
import {
  EVENT_LABEL, EXCLUDE_LABEL, METHOD_LABEL, POSTING_KIND_LABEL, STATUS_LABEL, byLabel, sourceLabel, usd,
} from "./labels";

const PAGE = 50;

/** The postings a message proposes: company · title, kind, and why it fits. */
export function PostingList({ person }: { person: Pick<AgentPerson, "postings"> }) {
  if (!person.postings.length) return <p className="text-[12px] text-neutral-muted">고른 공고가 없어요.</p>;
  return (
    <ul className="space-y-1 text-[13px]">
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

function StatusBadge({ person }: { person: Pick<AgentPerson, "status" | "excludeReason"> }) {
  const tone = person.status === "failed" ? "critical" : person.status === "sent" || person.status === "replied" ? "positive" : "default";
  return (
    <Badge tone={tone} title={person.excludeReason ? EXCLUDE_LABEL[person.excludeReason] : undefined}>
      {STATUS_LABEL[person.status]}{person.excludeReason ? ` · ${EXCLUDE_LABEL[person.excludeReason]}` : ""}
    </Badge>
  );
}

function MailCard({ mail }: { mail: AgentMailFacts }) {
  return (
    <div className={cx(opsTheme.panelMuted, "px-3 py-2 text-[12px]")}>
      <p className="font-medium text-neutral-primary">{mail.kind === "followup" ? "후속 메일" : "첫 메일"} · {mail.subject}</p>
      <p className="text-neutral-muted">
        {formatKst(mail.sentAt)} · {mail.fromEmail} → {mail.toEmail}
        {mail.deliveryStatus ? ` · ${mail.deliveryStatus === "bounced" ? "반송" : mail.deliveryStatus === "complained" ? "스팸 신고" : "발송 실패"}` : ""}
        {mail.firstOpenedAt ? ` · 클릭 ${formatKst(mail.firstOpenedAt)}` : ""}
        {mail.claimedAt ? ` · 가입 ${formatKst(mail.claimedAt)}` : ""}
        {mail.unsubscribedAt ? " · 수신 거부" : ""}
      </p>
      <p className="mt-1 whitespace-pre-line text-neutral-primary">{mail.textBody.slice(0, 3_000)}</p>
    </div>
  );
}

/** One person: who, why, what was proposed and sent, and every step with time and who did it. */
export function Timeline({ id, onClose }: { id: string; onClose: () => void }) {
  const load = useGtmAction<{ timeline: { person: AgentPerson; mails: AgentMailFacts[] } | null }>();
  const { run } = load;
  useEffect(() => { void run("agent.timeline", { id }); }, [run, id]);
  const timeline = load.result?.timeline ?? null;
  const person = timeline?.person ?? null;
  return (
    <div className={cx(opsTheme.panelSoft, "mt-3 space-y-3 p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{person?.name ?? "이름 없음"}{person?.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}</p>
          {person ? (
            <p className="text-[12px] text-neutral-muted">
              {[person.headline, person.currentCompany, person.location].filter(Boolean).join(" · ")}
              {person.profileUrl ? <a href={person.profileUrl.startsWith("http") ? person.profileUrl : `https://${person.profileUrl}`} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>프로필</a> : null}
            </p>
          ) : null}
        </div>
        <Button onClick={onClose}>닫기</Button>
      </div>
      <ErrorNotice message={load.error} />
      {load.loading && !person ? <p className="text-[12px] text-neutral-muted">불러오는 중…</p> : null}
      {person ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <StatusBadge person={person} />
            <span className="text-neutral-muted">
              {sourceLabel(person.source)} · {METHOD_LABEL[person.method] ?? person.method}
              {person.settingsVersion ? ` · 설정 v${person.settingsVersion}` : ""}{person.tuningVersion ? ` · 검색 ${person.tuningVersion}` : ""}
            </span>
            {person.email ? <span className="text-neutral-muted">· {person.email}{person.emailSource === "lookup" ? " (찾은 주소)" : ""}</span> : null}
            <span className="text-neutral-muted">· 비용 {usd(person.costUsd)}</span>
          </div>
          <SignalLine person={person} />
          <LookupLine lookup={person.emailLookup} />
          <div>
            <p className="mb-1 text-[12px] font-medium text-neutral-muted">제안한 공고</p>
            <PostingList person={person} />
            {person.reason ? <p className="mt-1 text-[12px] text-neutral-muted">메시지를 이렇게 쓴 이유: {person.reason}</p> : null}
          </div>
          {person.draftBody ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">메시지{person.draftSubject ? ` · ${person.draftSubject}` : ""}</p>
              <p className="whitespace-pre-line text-[13px]">{person.draftBody.slice(0, 3_000)}</p>
            </div>
          ) : null}
          {timeline?.mails.map((mail) => <MailCard key={mail.id} mail={mail} />)}
          {person.replyText ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">답장</p>
              <p className="whitespace-pre-line text-[13px]">{person.replyText}</p>
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-[12px] font-medium text-neutral-muted">타임라인</p>
            <ol className="space-y-0.5 text-[12px]">
              {person.events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex gap-2">
                  <span className="w-24 shrink-0 tabular-nums text-neutral-muted">{formatKst(event.at)}</span>
                  <span className="w-16 shrink-0 text-neutral-muted">{byLabel(event.by)}</span>
                  <span className="font-medium">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                  {event.note ? <span className="text-neutral-muted">{event.note}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}
    </div>
  );
}

const STATUS_FILTERS: AgentStatus[] = ["found", "excluded", "no_fit", "matched", "drafted", "approved", "sent", "replied", "skipped", "ended", "failed"];

/** #5 사람: everyone the agent found, filtered by status and by the source picked at the top; a row opens the timeline. */
export default function AgentPeople({ includeTest, refreshKey, source }: { includeTest: boolean; refreshKey: number; source: string | null }) {
  const [status, setStatus] = useState<AgentStatus | "">("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useGtmAction<{ people: AgentPerson[]; total: number }>();
  const { run } = list;
  const load = useCallback(() => {
    void run("agent.people", { status: status || null, source: source || null, q: query || null, limit: PAGE, offset, includeTest });
  }, [run, status, source, query, offset, includeTest]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const people = list.result?.people ?? [];
  const total = list.result?.total ?? 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(event) => { setStatus(event.target.value as AgentStatus | ""); setOffset(0); }} className="w-40">
          <option value="">상태 전체</option>
          {STATUS_FILTERS.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
        </Select>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(q.trim()); setOffset(0); }}>
          <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="이름·회사·메일·프로필 검색" className="w-56" />
          <Button type="submit">찾기</Button>
        </form>
        <span className="text-[12px] text-neutral-muted">{total}명</span>
      </div>
      <ErrorNotice message={list.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-[12px] text-neutral-muted">
            <tr>
              <th className="py-1.5 pr-3 font-normal">사람</th>
              <th className="px-2 py-1.5 font-normal">찾은 곳</th>
              <th className="px-2 py-1.5 font-normal">상태</th>
              <th className="px-2 py-1.5 font-normal">연락</th>
              <th className="px-2 py-1.5 text-right font-normal">공고</th>
              <th className="px-2 py-1.5 text-right font-normal">최근 변경</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-1000-a05">
            {people.map((person) => (
              <tr
                key={person.id}
                onClick={() => setSelected(selected === person.id ? null : person.id)}
                className={cx("cursor-pointer", selected === person.id ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
              >
                <td className="max-w-[280px] truncate py-1.5 pr-3">
                  <span className="font-medium">{person.name ?? "이름 없음"}</span>
                  {person.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}
                  {person.headline ? <span className="ml-1 text-[12px] text-neutral-muted">{person.headline}</span> : null}
                </td>
                <td className="px-2 text-[12px] text-neutral-muted">{sourceLabel(person.source)}</td>
                <td className="px-2"><StatusBadge person={person} /></td>
                <td className="px-2 text-[12px] text-neutral-muted">{person.channel ? "메일" : "—"}{person.sentAt ? ` · ${formatKst(person.sentAt)}` : ""}</td>
                <td className="px-2 text-right tabular-nums">{person.postings.length || "—"}</td>
                <td className="px-2 text-right text-[12px] tabular-nums text-neutral-muted">{formatKst(person.updatedAt)}</td>
              </tr>
            ))}
            {!people.length && !list.loading ? (
              <tr><td colSpan={6} className="py-4 text-center text-[12px] text-neutral-muted">아직 찾은 사람이 없어요.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {total > PAGE ? (
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>이전</Button>
          <span className="text-neutral-muted">{offset + 1}–{Math.min(offset + PAGE, total)} / {total}</span>
          <Button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>다음</Button>
        </div>
      ) : null}
      {selected ? <Timeline key={selected} id={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
