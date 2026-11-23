import { Fragment, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { LOOKUP_CHECK_LABEL, LOOKUP_REASON_LABEL } from "@/lib/gtmPlays/agent/emailLookup";
import { kstMonthDay, STAGE_WORDS, whoLabel, type ThreadMail, type ThreadRow } from "@/lib/gtmPlays/agent/thread";
import type { AgentThreadView } from "@/lib/gtmPlays/agent/threadViews.server";
import type { AgentEmailLookup, AgentPerson } from "@/lib/gtmPlays/agent/types";
import { formatKst, useGtmAction } from "../api";
import { Badge, Button, ErrorNotice } from "../ui";
import { ConfigLine } from "./AgentConfig";
import { MailText } from "./AgentLogTable";
import { PostingQuality } from "./AgentPostingQuality";
import {
  EVENT_LABEL, EXCLUDE_BUCKET_LABEL, METHOD_LABEL, POSTING_KIND_LABEL, personName, personStage, sourceLabel, usd,
} from "./labels";

type ThreadPerson = AgentThreadView["person"];

/** An event's words for Ops: an exclusion's rule as the screen names it ("recent_contact" → its Korean label). */
export function eventNote(event: { kind: string; note?: string | null }): string {
  const note = event.note ?? "";
  if (event.kind === "excluded" && note in EXCLUDE_BUCKET_LABEL) return EXCLUDE_BUCKET_LABEL[note as keyof typeof EXCLUDE_BUCKET_LABEL];
  return note;
}

/** The stage in the numbers' words and the step inside it: "처리 중 · 이메일 찾는 중", "연락 · 클릭함", … */
function StatusBadge({ person }: { person: ThreadPerson }) {
  const { stage, label, detail } = personStage(person);
  const tone = person.status === "failed" ? "critical" : stage === "contacted" || stage === "replied" ? "positive" : "default";
  return <Badge tone={tone}>{label}{detail ? ` · ${detail}` : ""}</Badge>;
}

/**
 * The postings a mail proposed: company · title, kind, why it fits, its 추천 품질 with Ops's 맞음 / 안 맞음, and what the
 * person did with it inside Harper now (저장 · 지원 · 연결 수락 …).
 */
function PostingList({ person, stages, onPerson }: {
  person: Pick<AgentPerson, "id" | "postings">; stages: Record<string, string>; onPerson: (person: AgentPerson) => void;
}) {
  if (!person.postings.length) return <p className="text-[12px] text-neutral-muted">고른 공고가 없어요.</p>;
  return (
    <ul className="space-y-3 text-[12px]">
      {person.postings.map((posting, index) => {
        const stage = posting.roleId ? stages[posting.roleId] : undefined;
        return (
          <li key={`${posting.roleId ?? posting.url ?? index}`}>
            <span className="font-medium">{posting.companyName} · {posting.title}</span>
            <span className="ml-1 text-[11px] text-neutral-muted">{POSTING_KIND_LABEL[posting.kind]}</span>
            {posting.url ? (
              <a href={posting.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-neutral-muted" aria-label="공고 열기">
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}
            {stage ? <p className="text-neutral-muted">하퍼 안 · 관심·지원 · {STAGE_WORDS[stage] ?? stage}</p> : null}
            {posting.why ? <p className="text-neutral-muted">{posting.why}</p> : null}
            <PostingQuality personId={person.id} posting={posting} index={index} onPerson={onPerson} />
          </li>
        );
      })}
    </ul>
  );
}

/** The email lookup, when there was one: still running, or how it ended, what it cost and the page the address was on. */
function LookupLine({ lookup }: { lookup: AgentEmailLookup | null }) {
  if (!lookup) return null;
  const text = lookup.state === "running" ? `찾는 중 · ${formatKst(lookup.startedAt)}에 시작`
    : lookup.used ? "찾음" : `못 찾음 · ${LOOKUP_REASON_LABEL[lookup.reason ?? "not_found"] ?? lookup.reason}${
      lookup.failedCheck && LOOKUP_CHECK_LABEL[lookup.failedCheck] ? ` · ${LOOKUP_CHECK_LABEL[lookup.failedCheck]}` : ""}`;
  return (
    <p className="text-[12px] text-neutral-muted">
      이메일 찾기: {text}{lookup.costUsd ? ` · ${usd(lookup.costUsd)}` : ""}
      {lookup.sourceUrl ? (
        <a href={lookup.sourceUrl} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>주소가 나온 페이지</a>
      ) : null}
    </p>
  );
}

/**
 * 답장 옴 / 연락 그만 요청 on a mailed person (Shaun 11/17: two buttons, no text): either stops the follow-up and counts
 * in 답장; 연락 그만 요청 also puts the address on the do-not-contact list. A reply found in a team mailbox is already
 * 답장 옴, and one that asks to stop is already 연락 그만 요청, so only 연락 그만 요청 is left, for a request worded otherwise.
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

const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const kstTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : KST_TIME.format(date);
};

/** 찾음's 내용: where and how, the search's scores and query, and the post or application that made the agent pick them. */
function FoundContent({ found }: { found: NonNullable<ThreadRow["found"]> }) {
  const scores = [
    found.signalScore !== null ? `구직 신호 점수 ${found.signalScore}` : null,
    found.matchScore !== null ? `공고 맞을 가능성 ${found.matchScore}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="space-y-0.5 text-[12px]">
      <p>{sourceLabel(found.source)} · {METHOD_LABEL[found.method as keyof typeof METHOD_LABEL] ?? found.method}</p>
      {scores || found.query ? (
        <p className="text-neutral-muted">{[scores || null, found.query ? `찾은 검색어: ${found.query}` : null].filter(Boolean).join(" · ")}</p>
      ) : null}
      {found.signalText || found.signalUrl ? (
        <p className="text-neutral-muted">
          {found.signalAt ? `${formatKst(found.signalAt)} · ` : ""}
          {found.signalText ? <span className="whitespace-pre-line">{found.signalText.slice(0, 400)}</span> : null}
          {found.signalUrl ? <a href={found.signalUrl} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")}>원문</a> : null}
        </p>
      ) : null}
    </div>
  );
}

/** A mail as it went out (sandboxed, no scripts), opened from its row under the whole table's width. */
function SentMail({ mail }: { mail: ThreadMail & { html: string } }) {
  return <iframe title={mail.subject} sandbox="" srcDoc={mail.html} className="h-[420px] w-full rounded border border-neutral-1000-a05 bg-white" />;
}

/** 내용: the quiet first line, the real text, then what is wrong (red) or a short fact. */
function RowContent({ row, view, onPerson, mailOpen, toggleMail }: {
  row: ThreadRow; view: AgentThreadView; onPerson: (person: AgentPerson) => void; mailOpen: boolean; toggleMail: () => void;
}) {
  if (row.found) return <FoundContent found={row.found} />;
  if (row.step) {
    const note = eventNote(row.step);
    return note ? <p className={cx("text-[12px]", row.trouble ? "text-critical" : "text-neutral-muted")}>{note}</p> : null;
  }
  const mail = row.mailId ? view.mails.find((item) => item.id === row.mailId) ?? null : null;
  const { person } = view;
  const first = mail?.kind === "first";
  return (
    <div className="min-w-0 space-y-1 text-[12px]">
      {row.detail ? <p className="break-words text-neutral-muted">{row.detail}</p> : null}
      {row.kind === "decision" && row.text ? <p className="whitespace-pre-line break-words">{row.text}</p> : null}
      {row.kind !== "decision" && row.text ? <MailText text={row.text} clamp /> : null}
      {row.signals.map((signal) => <p key={signal} className="text-neutral-muted">{signal}</p>)}
      {row.note ? <p className={row.trouble ? "text-critical" : "text-neutral-muted"}>{row.note}</p> : null}
      {first ? (
        <div className="space-y-1 pt-1">
          {person.postings.length ? <PostingList person={person} stages={view.postingStages} onPerson={onPerson} />
            : row.postings.map((posting) => <p key={`${posting.companyName}-${posting.title}`} className="font-medium">{posting.companyName} · {posting.title}</p>)}
          {person.reason ? <p className="text-neutral-muted">공고 고르기: {person.reason}</p> : null}
        </div>
      ) : null}
      {mail?.html ? (
        <button type="button" className="text-neutral-muted underline" onClick={toggleMail}>{mailOpen ? "보낸 모양 닫기" : "보낸 모양 보기"}</button>
      ) : null}
    </div>
  );
}

/**
 * One person on the right of 로그 · 사람 (Shaun 11/22 15:46): who they are and the buttons above, then everything that
 * happened with them as one table in one time order (날짜 · 누가 · 무엇 · 내용). Company rows sit in that same order;
 * an answer's 무엇 names what it answers ("↳ 11.20 답장에"), and its dates jump to that row.
 */
export default function AgentThread({ personId, onClose }: { personId: string; onClose: () => void }) {
  const load = useGtmAction<{ thread: AgentThreadView | null }>();
  const { run } = load;
  useEffect(() => { void run("agent.thread", { id: personId }); }, [run, personId]);
  const view = load.result?.thread ?? null;
  const person = view?.person ?? null;
  const [openMails, setOpenMails] = useState<ReadonlySet<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);
  const rowId = (key: string) => `agent-row-${personId}-${key}`;
  const jump = (key: string) => {
    document.getElementById(rowId(key))?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(key);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1_600);
  };
  const onPerson = (updated: AgentPerson) => {
    if (view) load.setResult({ thread: { ...view, person: { ...updated, reached: view.person.reached } } });
  };
  const toggleMail = (key: string) => setOpenMails((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const name = person ? personName(person).name : "";
  const hasFirstMail = Boolean(view?.mails.some((mail) => mail.kind === "first"));
  return (
    <div className={cx(opsTheme.panelSoft, "min-w-0 space-y-3 break-words p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{person ? name : "불러오는 중"}{person?.isTest ? <span className="ml-1 text-[11px] text-neutral-muted">테스트</span> : null}</p>
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
      {!load.loading && !load.error && load.result && !view ? <p className="text-[12px] text-neutral-muted">이 사람을 찾지 못했어요.</p> : null}
      {view && person ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <StatusBadge person={person} />
            <span className="text-neutral-muted">
              {sourceLabel(person.source)} · {METHOD_LABEL[person.method] ?? person.method}
              {!person.configId && person.settingsVersion ? ` · 설정 v${person.settingsVersion}` : ""}
            </span>
            {person.email ? <span className="text-neutral-muted">· {person.email}{person.emailSource === "lookup" ? " (찾은 주소)" : ""}</span> : null}
            <span className="text-neutral-muted">· 비용 {usd(person.costUsd)}</span>
          </div>
          {person.mailConfigId && person.mailConfigId !== person.configId ? (
            <>
              <ConfigLine id={person.configId} what="찾을 때" />
              <ConfigLine id={person.mailConfigId} what="메일 쓸 때" />
            </>
          ) : <ConfigLine id={person.configId ?? person.mailConfigId} />}
          <LookupLine lookup={person.emailLookup} />
          {person.status === "sent" || (person.status === "replied" && !person.endedAt)
            ? <ReplyButtons person={person} onDone={() => void run("agent.thread", { id: personId })} /> : null}
          {!hasFirstMail && person.postings.length ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">제안한 공고</p>
              <PostingList person={person} stages={view.postingStages} onPerson={onPerson} />
              {person.reason ? <p className="mt-1 text-[12px] text-neutral-muted">공고 고르기: {person.reason}</p> : null}
            </div>
          ) : null}
          {!hasFirstMail && person.draftBody ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-neutral-muted">써 둔 메일{person.draftSubject ? ` · ${person.draftSubject}` : ""}</p>
              <MailText text={person.draftBody.slice(0, 3_000)} clamp />
            </div>
          ) : null}
          <table className="w-full table-fixed text-[12px]">
            <colgroup>
              <col className="w-12" />
              <col className="w-20" />
              <col className="w-28" />
              <col />
            </colgroup>
            <thead className="text-left text-neutral-muted">
              <tr>
                <th className="py-1.5 pr-2 font-normal">날짜</th>
                <th className="px-2 py-1.5 font-normal">누가</th>
                <th className="px-2 py-1.5 font-normal">무엇</th>
                <th className="py-1.5 pl-2 font-normal">내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-1000-a05">
              {view.thread.rows.map((row) => {
                const mail = row.mailId ? view.mails.find((item) => item.id === row.mailId) ?? null : null;
                const open = openMails.has(row.key);
                return (
                  <Fragment key={row.key}>
                    <tr id={rowId(row.key)} className={cx("align-top transition-colors", flash === row.key && "bg-bg-weak")}>
                      <td className="py-2 pr-2 tabular-nums text-neutral-muted" title={formatKst(row.at)}>
                        <p>{kstMonthDay(row.at)}</p>
                        <p>{kstTime(row.at)}</p>
                      </td>
                      <td className="break-words px-2 py-2 text-neutral-muted">{whoLabel(row.who, name)}</td>
                      <td className="break-words px-2 py-2">
                        <p className={cx("font-medium", row.trouble && "text-critical")}>
                          {row.what ?? (row.step ? EVENT_LABEL[row.step.kind] ?? row.step.kind : "")}
                        </p>
                        {row.link ? (
                          <p className="text-neutral-muted">
                            ↳{" "}
                            {row.link.refs.map((item, index) => (
                              <Fragment key={item.key}>
                                {index ? " · " : ""}
                                <a href={`#${rowId(item.key)}`} onClick={(event) => { event.preventDefault(); jump(item.key); }} className={opsTheme.link}>
                                  {kstMonthDay(item.at)}
                                </a>
                              </Fragment>
                            ))}
                            {" "}{row.link.words}
                          </p>
                        ) : null}
                      </td>
                      <td className="min-w-0 py-2 pl-2">
                        <RowContent row={row} view={view} onPerson={onPerson} mailOpen={open} toggleMail={() => toggleMail(row.key)} />
                      </td>
                    </tr>
                    {mail?.html && open ? (
                      <tr><td colSpan={4} className="pb-3"><SentMail mail={{ ...mail, html: mail.html }} /></td></tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
