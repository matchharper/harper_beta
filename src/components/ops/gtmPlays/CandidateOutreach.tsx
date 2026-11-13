import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type {
  GtmCandidateMailDraft,
  GtmCandidateSendResult,
  GtmRecipient,
  ScrapedPerson,
} from "@/lib/gtmPlays/candidateMail.server";
import type { GtmMailLogRow } from "@/lib/gtmPlays/mailSend.server";
import { SentHistory } from "./CompanyMail";
import { EnvelopeFields, useGtmEnvelope } from "./Envelope";
import { gtmCall, useGtmAction } from "./api";
import { Badge, Button, ErrorNotice, Hint, Label, MailPreviewFrame, Panel, Select, TextArea, TextInput } from "./ui";

/** The three places a #4 candidate can come from, named the same everywhere on the screen. */
export const CHOICE = {
  member: { label: "Choice 1 · 하퍼 회원", short: "Choice 1 하퍼 회원" },
  external: { label: "Choice 2 · 외부 후보", short: "Choice 2 외부 후보" },
  scraped: { label: "Choice 3 · 스크래핑 DB", short: "Choice 3 스크래핑 DB" },
} as const;

export type CandidateSource = keyof typeof CHOICE;

/** One person on the 후보 메일 list; names are for the screen, the server reads addresses itself. */
export type PickedCandidate = { source: CandidateSource; ref: string; name: string | null; headline: string | null };

export const pickedKey = (item: Pick<PickedCandidate, "source" | "ref">) => `${item.source}:${item.ref}`;

/** The list of chosen people shared by the three Choice panels and the mail form. */
export function usePickedCandidates() {
  const [picked, setPicked] = useState<PickedCandidate[]>([]);
  const has = (item: Pick<PickedCandidate, "source" | "ref">) => picked.some((row) => pickedKey(row) === pickedKey(item));
  const toggle = (item: PickedCandidate) => setPicked((rows) => (rows.some((row) => pickedKey(row) === pickedKey(item))
    ? rows.filter((row) => pickedKey(row) !== pickedKey(item))
    : [...rows, item]));
  const remove = (item: Pick<PickedCandidate, "source" | "ref">) => setPicked((rows) => rows.filter((row) => pickedKey(row) !== pickedKey(item)));
  return { picked, has, toggle, remove, clear: () => setPicked([]) };
}

const HINT_SCRAPED = "하퍼가 LinkedIn 등에서 모아 둔 프로필 DB(candid) 중 메일 주소가 있는 사람(약 2.2만 명)에서, 한 줄 소개나 요약에 키워드가 들어간 사람을 찾아요. 키워드는 Role 내용으로 자동으로 만들고(LLM 1회) 바로 찾아요. 고쳐서 다시 찾을 수 있어요. 많이 맞은 순, 읽기만 해요.";

/** Choice 3: keyword search over the scraped profile DB (people with an email only); keywords start from the Role. */
export function ScrapedSearch({ roleTitle, description, isPicked, onToggle }: {
  roleTitle: string;
  description: string;
  isPicked: (ref: string) => boolean;
  onToggle: (person: ScrapedPerson) => void;
}) {
  const [keywords, setKeywords] = useState("");
  const [koreanOnly, setKoreanOnly] = useState(true);
  const search = useGtmAction<{ people: ScrapedPerson[] }>();
  const auto = useGtmAction<{ keywords: string[]; people: ScrapedPerson[] }>();
  const { run: runAuto } = auto;
  const { setResult: setSearchResult } = search;
  const list = keywords.split(/[,，]/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 6);
  // Remounted per Role (key), so this runs once for the Role on screen.
  const autoKey = JSON.stringify({ roleTitle: roleTitle.trim(), description: description.slice(0, 4_000) });
  const generate = useCallback(async () => {
    const input = JSON.parse(autoKey) as { roleTitle: string; description: string };
    if (!input.roleTitle) return;
    const result = await runAuto("candidates.scrapedAuto", { ...input, koreanOnly });
    setSearchResult(null);
    if (result) setKeywords(result.keywords.join(", "));
  }, [autoKey, runAuto, koreanOnly, setSearchResult]);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
  }, [generate]);
  const people = search.result?.people ?? auto.result?.people ?? null;
  const loading = search.loading || auto.loading;
  return (
    <Panel title={<span className="inline-flex items-center gap-1">{CHOICE.scraped.label}<Hint label="스크래핑 DB" text={HINT_SCRAPED} /></span>}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[260px] flex-1">
          <Label>키워드 (Role로 자동 생성 · 고쳐도 돼요)</Label>
          <TextInput
            value={keywords}
            className="w-full"
            placeholder={auto.loading ? "Role 내용으로 키워드 만드는 중…" : "예: sales director, country manager"}
            onChange={(event) => setKeywords(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={koreanOnly} onChange={(event) => setKoreanOnly(event.target.checked)} />
          한국인만
        </label>
        <Button loading={search.loading} disabled={!list.length || auto.loading} title="DB 읽기 1회 (2~3초)" onClick={() => void search.run("candidates.scraped", { keywords: list, koreanOnly })}>
          다시 찾기
        </Button>
        <Button loading={auto.loading} disabled={search.loading} title="LLM 1회 + DB 읽기 1회" onClick={() => void generate()}>
          키워드 다시 만들기
        </Button>
      </div>
      <ErrorNotice message={auto.error ?? search.error} />
      {loading && !people ? <p className="mt-3 text-sm text-neutral-muted">찾는 중…</p> : null}
      {people ? (
        people.length ? (
          <div className="mt-3 max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-default text-left text-[12px] text-neutral-muted">
                <tr>
                  <th className="w-8 py-1" aria-label="메일 보낼 사람" />
                  <th className="py-1">이름</th>
                  <th className="py-1">한 줄 소개</th>
                  <th className="w-16 py-1 text-right">경력</th>
                  <th className="py-1 pl-3">메일</th>
                </tr>
              </thead>
              <tbody className={cx("divide-y", opsTheme.divider)}>
                {people.map((person) => (
                  <tr key={person.ref}>
                    <td className="py-1.5">
                      <input type="checkbox" checked={isPicked(person.ref)} onChange={() => onToggle(person)} aria-label={`${person.name ?? "이름 없음"} 메일 보낼 사람에 넣기`} />
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {person.name ?? "-"}
                      {person.linkedinUrl ? (
                        <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "ml-1")} aria-label="LinkedIn">
                          <ExternalLink className="inline h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </td>
                    <td className="max-w-[360px] truncate py-1.5 text-neutral-muted" title={person.headline ?? undefined}>
                      {[person.headline, person.location].filter(Boolean).join(" · ")}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{person.years === null ? "-" : `${person.years}년`}</td>
                    <td className="py-1.5 pl-3 text-[12px] text-neutral-muted">{person.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-neutral-muted">맞는 사람이 없어요. 키워드를 바꿔 보세요.</p>
      ) : null}
    </Panel>
  );
}

type RenderedMail = { subject: string; html: string; text: string };

const RESULT_LABEL = { sent: "보냄", blocked: "안 보냄", skipped: "건너뜀" } as const;

/** What the person gets after the Harper button, for the posting link on the form. */
type CandidatePreview = { mail: RenderedMail; posting: "inbox" | "harper_job" | "none"; defaultClosing: string };

const POSTING_NOTE = {
  inbox: "'Harper에서 공고 보기'가 로그인 없이 보는 하퍼 공고 페이지를 열어요. 거기서 가입·온보딩을 마치면 이 공고가 그 사람 인박스(새 기회)에 들어가고 바로 열려요.",
  harper_job: "하퍼 공고 페이지예요. 'Harper에서 공고 보기'가 이 페이지를 열고, 거기서 가입하면 이 공고로 바로 이어져요(공고 페이지 가입과 같은 흐름).",
  none: "이 링크로는 공고를 넣을 수 없어요. 가입만 되고 공고는 안 들어가요. 회사 채용 페이지의 공고 URL이나 하퍼 공고 페이지(matchharper.com/jobs/…)를 넣어 주세요.",
} as const;

/**
 * 후보 메일: everyone chosen in Choice 1/2/3, the sender and CC, one subject and body for all (the greeting with
 * each name is added per person), the posting link that goes into their inbox when they open Harper, a
 * preview as the first person gets it, then one mail each.
 */
export function CandidateMailComposer({
  picked, onRemove, onSent, writes, gtmRoleId, logRoleId, companyName, roleTitle, description, defaultPostingUrl, location = null,
}: {
  picked: PickedCandidate[];
  onRemove: (item: PickedCandidate) => void;
  onSent: () => void;
  writes: boolean;
  /** The saved GTM Role (Choice 2 addresses are read from it). */
  gtmRoleId: string | null;
  /** The Role the mail is about, kept on the log (the GTM Role, or the customer's Role before saving). */
  logRoleId: string | null;
  companyName: string | null;
  roleTitle: string;
  description: string;
  defaultPostingUrl: string | null;
  /** Where the job is, for the posting page the mail's button opens. */
  location?: string | null;
}) {
  const { envelope, setEnvelope, problem: envelopeProblem } = useGtmEnvelope();
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [mail, setMail] = useState<GtmCandidateMailDraft | null>(null);
  const [postingUrl, setPostingUrl] = useState(defaultPostingUrl ?? "");
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  // Chris's own lines under the buttons; null: the default for this posting and sender (shown in the box).
  const [closing, setClosing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const previewSeq = useRef(0);
  const draft = useGtmAction<{ draft: GtmCandidateMailDraft }>();
  const resolve = useGtmAction<{ recipients: GtmRecipient[] }>();
  const send = useGtmAction<{ results: GtmCandidateSendResult[] }>();
  const history = useGtmAction<{ rows: GtmMailLogRow[]; available: boolean }>();
  const { run: runResolve } = resolve;
  const { run: loadHistory } = history;

  const refsKey = JSON.stringify(picked.map((item) => ({ source: item.source, ref: item.ref })));
  useEffect(() => {
    const recipients = JSON.parse(refsKey) as Array<{ source: string; ref: string }>;
    if (!recipients.length) return;
    void runResolve("candidates.resolve", { roleId: gtmRoleId, recipients });
  }, [runResolve, refsKey, gtmRoleId]);
  useEffect(() => {
    if (logRoleId) void loadHistory("mail.history", { roleId: logRoleId, audience: "candidate" });
  }, [loadHistory, logRoleId]);

  const resolved = new Map((resolve.result?.recipients ?? []).map((row) => [`${row.source}:${row.ref}`, row]));
  const sendable = picked.filter((item) => resolved.get(`${item.source}:${item.ref}`)?.email).length;
  const firstName = picked.map((item) => resolved.get(`${item.source}:${item.ref}`)).find((row) => row?.email)?.name ?? null;

  const content = mail
    ? { envelope, language, subject: mail.subject, body: mail.body, postingUrl: postingUrl.trim() || null, closing }
    : null;
  const previewKey = content && !envelopeProblem ? JSON.stringify({ ...content, name: firstName }) : "";
  useEffect(() => {
    if (!previewKey) return;
    const seq = ++previewSeq.current;
    const timer = window.setTimeout(() => {
      gtmCall<CandidatePreview>("candidates.render", JSON.parse(previewKey) as Record<string, unknown>)
        .then((result) => {
          if (seq !== previewSeq.current) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (seq !== previewSeq.current) return;
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : "미리보기를 만들지 못했어요.");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [previewKey]);

  const sendNow = async () => {
    if (!content) return;
    const result = await send.run("candidates.send", {
      ...content, recipients: picked.map((item) => ({ source: item.source, ref: item.ref })),
      roleId: logRoleId, gtmRoleId, companyName,
      posting: { title: roleTitle, companyName, location, description: description.slice(0, 20_000) },
    });
    setConfirming(false);
    if (result) onSent();
    if (logRoleId) void loadHistory("mail.history", { roleId: logRoleId, audience: "candidate" });
  };

  return (
    <Panel title={`후보 메일 · ${picked.length}명`}>
      {picked.length ? (
        <ul className="space-y-1">
          {picked.map((item) => {
            const row = resolved.get(`${item.source}:${item.ref}`);
            return (
              <li key={pickedKey(item)} className={cx(opsTheme.panelMuted, "flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm")}>
                <Badge>{CHOICE[item.source].short}</Badge>
                <span className="font-medium">{row?.name ?? item.name ?? "-"}</span>
                {row?.email ? <span className="text-neutral-muted">{row.email}</span> : null}
                {row?.problem ? <span className="text-[12px] text-critical">{row.problem}</span> : null}
                {!row && resolve.loading ? <span className="text-[12px] text-neutral-muted">주소 확인 중</span> : null}
                <button type="button" className="ml-auto text-neutral-muted hover:text-neutral-primary" aria-label="빼기" onClick={() => onRemove(item)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-muted">위 Choice 1·2·3에서 메일 보낼 사람을 체크해 주세요.</p>
      )}
      <ErrorNotice message={resolve.error} />

      <div className="mt-5">
        <EnvelopeFields envelope={envelope} onChange={setEnvelope} problem={envelopeProblem} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Select value={language} onChange={(event) => setLanguage(event.target.value as "ko" | "en")} className="w-28" aria-label="언어">
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </Select>
        <label className="block">
          <TextInput
            value={postingUrl}
            className="w-full"
            placeholder="공고 링크 (가입하면 이 공고가 인박스에 들어가요)"
            onChange={(event) => setPostingUrl(event.target.value)}
            aria-label="공고 링크"
          />
        </label>
      </div>
      {preview ? (
        <p className={cx("mt-1 text-[12px]", preview.posting === "none" ? "text-critical" : "text-neutral-muted")}>
          {POSTING_NOTE[preview.posting]}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          loading={draft.loading}
          title="LLM 1회 (제목·본문)"
          onClick={async () => {
            const result = await draft.run("candidates.draft", {
              language, companyName, roleTitle, description, senderName: envelope.fromName || "Harper", postingUrl: postingUrl.trim() || null,
            });
            if (result) setMail(result.draft);
          }}
        >
          {mail ? "초안 다시 만들기" : "초안 만들기"}
        </Button>
      </div>
      <ErrorNotice message={draft.error} />

      {mail ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <Label>제목</Label>
            <TextInput value={mail.subject} className="w-full" onChange={(event) => setMail({ ...mail, subject: event.target.value })} />
          </label>
          <label className="block">
            <Label>본문 (인사말은 사람마다 이름을 넣어 자동으로 붙어요)</Label>
            <TextArea value={mail.body} rows={7} className="w-full" onChange={(event) => setMail({ ...mail, body: event.target.value })} />
          </label>
          <label className="block">
            <span className="flex items-center gap-2">
              <Label>버튼 아래 문구 (수신 거부 줄은 자동으로 붙어요)</Label>
              {closing !== null ? (
                <button type="button" className="mb-1 text-[12px] text-neutral-muted underline" onClick={() => setClosing(null)}>
                  기본 문구로
                </button>
              ) : null}
            </span>
            <TextArea
              value={closing ?? preview?.defaultClosing ?? ""}
              rows={4}
              maxLength={1_000}
              className="w-full"
              onChange={(event) => setClosing(event.target.value)}
            />
          </label>
          <div>
            <Label>미리보기{firstName ? ` · ${firstName}님에게 가는 메일` : ""}</Label>
            <ErrorNotice message={previewError} />
            {preview ? (
              <div className={cx(opsTheme.panelMuted, "overflow-hidden p-0")}>
                <div className="border-b border-neutral-1000-a05 px-3 py-2 text-sm">
                  <span className="text-neutral-muted">제목 </span><span className="font-medium">{preview.mail.subject}</span>
                </div>
                <MailPreviewFrame title="후보 메일 미리보기" html={preview.mail.html} className="h-[520px] w-full bg-white" />
              </div>
            ) : null}
          </div>

          {confirming ? (
            <div className={cx(opsTheme.panelMuted, "flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
              <span>
                <span className="font-medium">{envelope.fromName} &lt;{envelope.fromEmail}&gt;</span>로 {sendable}명에게 한 통씩 보낼까요?
                {envelope.cc.length ? ` 참조 ${envelope.cc.join(", ")}가 모든 메일에 들어가요.` : ""}
              </span>
              <Button variant="primary" loading={send.loading} onClick={() => void sendNow()}>보내기</Button>
              <Button disabled={send.loading} onClick={() => setConfirming(false)}>취소</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={!writes || !sendable || Boolean(envelopeProblem) || !mail.subject.trim() || !mail.body.trim()}
                onClick={() => { send.setResult(null); send.setError(null); setConfirming(true); }}
              >
                {sendable}명에게 보내기
              </Button>
              {!writes ? <span className="text-[12px] text-neutral-muted">쓰기 꺼짐 · 로컬은 메일을 보내지 않아요</span> : null}
            </div>
          )}
          <ErrorNotice message={send.error} />
          {send.result ? (
            <ul className="space-y-1 text-sm">
              {send.result.results.map((row) => (
                <li key={`${row.source}:${row.ref}`} className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.result.status === "sent" ? "positive" : "default"}>{RESULT_LABEL[row.result.status]}</Badge>
                  <span>{row.name ?? "-"}</span>
                  <span className="text-neutral-muted">{row.email ?? ""}</span>
                  {"reason" in row.result ? <span className="text-[12px] text-neutral-muted">{row.result.reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {logRoleId ? (
        <div className="mt-5">
          <Label>이 Role로 보낸 후보 메일</Label>
          <ErrorNotice message={history.error} />
          <SentHistory history={history.result} />
        </div>
      ) : null}
    </Panel>
  );
}
