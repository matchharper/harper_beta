import { useEffect, useRef, useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { GtmMailLogRow, GtmMailSendResult } from "@/lib/gtmPlays/mailSend.server";
import type { CompanyContact, CompanyContactSource } from "@/lib/gtmPlays/contacts.server";
import type { AnonymousCard, CompanyMailDraft } from "@/lib/gtmPlays/shared";
import { formatKst, gtmCall, useGtmAction } from "./api";
import { EnvelopeFields, useGtmEnvelope } from "./Envelope";
import { Badge, Button, ErrorNotice, Label, MailPreviewFrame, Panel, Select, TextArea, TextInput } from "./ui";

const SOURCE_LABEL: Record<CompanyContactSource, string> = {
  manual: "직접 입력", posting: "공고에 적힘", harper_found: "하퍼가 찾음", account_member: "하퍼 계정 멤버",
};

type RenderedMail = { subject: string; html: string; text: string };

const MAIL_STATUS_LABEL: Record<GtmMailLogRow["status"], string> = {
  sending: "보내는 중", sent: "보냄", failed: "실패", blocked: "안 보냄",
};
const CAMPAIGN_LABEL: Record<GtmMailLogRow["campaign"], string> = { pool: "#2 후보 카드", demand: "#3 관심 고객사", outreach: "#4 후보 메일" };
// From Resend after sending; a bounced or complaining address is not mailed again.
const DELIVERY_LABEL: Record<NonNullable<GtmMailLogRow["delivery_status"]>, string> = {
  bounced: "반송됨", complained: "스팸 신고", failed: "발송 실패",
};

/** The last sends to this address, company or Role, so a repeat is visible before pressing 보내기. */
export function SentHistory({ history }: { history: { rows: GtmMailLogRow[]; available: boolean } | null }) {
  if (!history) return null;
  if (!history.available) return <p className="text-[12px] text-neutral-muted">보낸 기록 테이블은 배포 때 만들어져요.</p>;
  if (!history.rows.length) return <p className="text-[12px] text-neutral-muted">보낸 기록 없음</p>;
  return (
    <ul className="space-y-1 text-[12px]">
      {history.rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-neutral-muted">{formatKst(row.created_at)}</span>
          <Badge tone={row.status === "sent" ? "positive" : row.status === "failed" ? "critical" : "default"}>{MAIL_STATUS_LABEL[row.status]}</Badge>
          <span>{row.to_email}</span>
          <span className="text-neutral-muted">· {CAMPAIGN_LABEL[row.campaign]} · {row.subject} · 보낸 사람 {row.from_email}</span>
          {row.claimed_at ? (
            <Badge tone="positive">{row.audience === "company" ? "가입해서 Role 받음" : "하퍼에서 열고 인박스에 넣음"}</Badge>
          ) : null}
          {row.delivery_status ? (
            <Badge tone="critical" title={row.delivery_detail ?? undefined}>{DELIVERY_LABEL[row.delivery_status]}</Badge>
          ) : null}
          {row.error ? <span className="text-neutral-muted">· {row.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Company contact (직접 입력 / 공고에 적힘 / 하퍼가 찾음) and the mail Chris edits before sending. The
 * preview is the mail as the company gets it: Harper's mail layout, cards and buttons rendered by code.
 */
export function CompanyMail({
  campaign, companyName, companyWorkspaceId = null, roleId = null, ctaUrl = null, postingUrl = null, posting = null,
  homepageUrl, postingEmails, accountMembers = [], cards, postingTitle, fixedLanguage, draft, writes, sendBlocked = null,
}: {
  campaign: "pool" | "demand";
  companyName: string;
  /** Kept on the send log (#3 knows the company's Harper workspace; #2 knows the posting). */
  companyWorkspaceId?: string | null;
  /** #3: the Role the mail is about (kept on the log, and the history shows that Role's mails). */
  roleId?: string | null;
  /** #3: where the button goes (the Role in /org); otherwise company signup. */
  ctaUrl?: string | null;
  postingUrl?: string | null;
  /** #2: the JD the cards were picked for; signing up from the mail makes the company a Role from it. */
  posting?: { title: string; companyName: string | null; location: string | null; description: string; url: string | null } | null;
  homepageUrl: string | null;
  postingEmails: Array<{ email: string; url: string | null }>;
  /** #3: people in the customer's Harper account, listed first (owners first). */
  accountMembers?: Array<{ email: string; name: string | null; authority: string | null }>;
  /** #2 only: the cards under the opening. */
  cards: AnonymousCard[];
  postingTitle: string | null;
  /** #2: the mail is in the language the cards were written in. */
  fixedLanguage?: "ko" | "en";
  /** Runs the play's own draft of the subject and opening (one LLM call). */
  draft: (language: "ko" | "en") => Promise<CompanyMailDraft | null>;
  writes: boolean;
  /** Why the mail cannot go yet (e.g. #2: an edited card names the person); shown by 보내기. */
  sendBlocked?: string | null;
}) {
  // Callers remount this per company and card set (key), so these addresses only seed the first state.
  const [contacts, setContacts] = useState<CompanyContact[]>(() => {
    const members: CompanyContact[] = accountMembers.map((item) => ({
      email: item.email, source: "account_member", url: null, sameDomain: false,
      note: [item.name, item.authority].filter(Boolean).join(" · ") || null,
    }));
    const seen = new Set(members.map((item) => item.email));
    return [...members, ...postingEmails.filter((item) => !seen.has(item.email))
      .map((item) => ({ email: item.email, source: "posting" as const, url: item.url, sameDomain: false }))];
  });
  const [recipient, setRecipient] = useState(accountMembers[0]?.email ?? postingEmails[0]?.email ?? "");
  const [manual, setManual] = useState("");
  const [chosenLanguage, setLanguage] = useState<"ko" | "en">("ko");
  const language = fixedLanguage ?? chosenLanguage;
  const [mail, setMail] = useState<CompanyMailDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RenderedMail | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  const find = useGtmAction<{ contacts: CompanyContact[] }>();
  const send = useGtmAction<GtmMailSendResult>();
  const history = useGtmAction<{ rows: GtmMailLogRow[]; available: boolean }>();
  const [confirming, setConfirming] = useState(false);
  const { envelope, setEnvelope, problem: envelopeProblem } = useGtmEnvelope();
  const { run: loadHistory } = history;

  const mailInput = mail ? { campaign, language, subject: mail.subject, intro: mail.intro, cards, postingTitle, ctaUrl } : null;
  // The preview signs with the sender's name, so it follows the envelope too.
  const mailKey = mailInput ? JSON.stringify({ ...mailInput, envelope: envelopeProblem ? undefined : envelope }) : "";

  // Re-render the preview a moment after Chris stops typing; only the latest request wins.
  useEffect(() => {
    if (!mailKey) return;
    const seq = ++previewSeq.current;
    const timer = window.setTimeout(() => {
      gtmCall<{ mail: RenderedMail }>("mail.render", JSON.parse(mailKey) as Record<string, unknown>)
        .then((result) => {
          if (seq !== previewSeq.current) return;
          setPreview(result.mail);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (seq !== previewSeq.current) return;
          setPreviewError(error instanceof Error ? error.message : "미리보기를 만들지 못했어요.");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [mailKey]);

  // What was already sent to the chosen address or this company, before anything else goes out.
  useEffect(() => {
    void loadHistory("mail.history", { to: recipient || null, companyName, roleId });
  }, [loadHistory, recipient, companyName, roleId]);

  const sendNow = async () => {
    if (!mailInput) return;
    await send.run("mail.send", { to: recipient, ...mailInput, envelope, companyName, companyWorkspaceId, roleId, postingUrl, posting });
    setConfirming(false);
    void loadHistory("mail.history", { to: recipient || null, companyName, roleId });
  };

  const add = (items: CompanyContact[]) => setContacts((current) => {
    const seen = new Set(current.map((item) => item.email));
    return [...current, ...items.filter((item) => !seen.has(item.email))];
  });

  const makeDraft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const next = await draft(language);
      if (next) setMail({ subject: next.subject, intro: next.intro });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "초안을 만들지 못했어요.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Panel title="회사 메일">
      <EnvelopeFields envelope={envelope} onChange={setEnvelope} problem={envelopeProblem} />
      <div className="mt-4 space-y-2">
        <Label>받는 사람</Label>
        <ul className="space-y-1">
          {contacts.map((contact) => (
            <li key={contact.email}>
              <label className={cx(opsTheme.panelMuted, "flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
                <input type="radio" name="gtm-recipient" checked={recipient === contact.email} onChange={() => setRecipient(contact.email)} />
                <span className="font-medium">{contact.email}</span>
                <Badge>{SOURCE_LABEL[contact.source]}</Badge>
                {contact.note ? <span className="text-[12px] text-neutral-muted">{contact.note}</span> : null}
                {contact.source === "harper_found" && contact.sameDomain ? <Badge tone="positive">회사 도메인</Badge> : null}
                {contact.url ? <a href={contact.url} target="_blank" rel="noreferrer" className={cx(opsTheme.link, "text-[12px]")}>출처</a> : null}
              </label>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <TextInput value={manual} placeholder="이메일 직접 입력" onChange={(event) => setManual(event.target.value)} />
          <Button
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual.trim())}
            onClick={() => { const email = manual.trim().toLowerCase(); add([{ email, source: "manual", url: null, sameDomain: false }]); setRecipient(email); setManual(""); }}
          >
            추가
          </Button>
          <Button
            loading={find.loading}
            title="웹 검색 1회 (약 1센트), 페이지에 적힌 주소만"
            onClick={async () => { const result = await find.run("contacts.find", { companyName, homepageUrl }); if (result) add(result.contacts); }}
          >
            하퍼가 찾기
          </Button>
        </div>
        {find.result && !find.result.contacts.length ? <p className="text-[12px] text-neutral-muted">찾은 주소 없음</p> : null}
        <ErrorNotice message={find.error} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {fixedLanguage ? null : (
          <Select value={language} onChange={(event) => setLanguage(event.target.value as "ko" | "en")} className="w-28" aria-label="언어">
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </Select>
        )}
        <Button loading={drafting} title="LLM 1회 (제목·첫 문단)" onClick={() => void makeDraft()}>
          {mail ? "초안 다시 만들기" : "초안 만들기"}
        </Button>
      </div>
      <ErrorNotice message={draftError} />

      {mail ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <Label>제목</Label>
            <TextInput value={mail.subject} onChange={(event) => setMail({ ...mail, subject: event.target.value })} className="w-full" />
          </label>
          <label className="block">
            <Label>첫 문단</Label>
            <TextArea value={mail.intro} rows={5} onChange={(event) => setMail({ ...mail, intro: event.target.value })} className="w-full" />
          </label>

          <div>
            <Label>미리보기</Label>
            <ErrorNotice message={previewError} />
            {preview ? (
              <div className={cx(opsTheme.panelMuted, "overflow-hidden p-0")}>
                <div className="border-b border-neutral-1000-a05 px-3 py-2 text-sm">
                  <span className="text-neutral-muted">제목 </span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
                <MailPreviewFrame title="메일 미리보기" html={preview.html} className="h-[560px] w-full bg-white" />
              </div>
            ) : null}
            {preview ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-neutral-muted">텍스트 버전</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[12px] leading-5">{preview.text}</pre>
              </details>
            ) : null}
          </div>

          {confirming ? (
            <div className={cx(opsTheme.panelMuted, "flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
              <span>
                정말 보낼까요? <span className="font-medium">{envelope.fromName} &lt;{envelope.fromEmail}&gt;</span> →{" "}
                <span className="font-medium">{recipient}</span>{envelope.cc.length ? ` (참조 ${envelope.cc.join(", ")})` : ""}
              </span>
              <Button variant="primary" loading={send.loading} onClick={() => void sendNow()}>보내기</Button>
              <Button disabled={send.loading} onClick={() => setConfirming(false)}>취소</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={!writes || !recipient || !mailInput || Boolean(envelopeProblem) || Boolean(sendBlocked)}
                onClick={() => { send.setResult(null); send.setError(null); setConfirming(true); }}
              >
                보내기
              </Button>
              {!writes ? <span className="text-[12px] text-neutral-muted">쓰기 꺼짐 · 로컬은 메일을 보내지 않아요</span>
                : sendBlocked ? <span className="text-[12px] text-critical">{sendBlocked}</span>
                : !recipient ? <span className="text-[12px] text-neutral-muted">받는 사람을 골라 주세요</span> : null}
            </div>
          )}
          <ErrorNotice message={send.error} />
          {send.result?.status === "sent" ? (
            <p className={cx(opsTheme.successNotice, "mt-1")}>보냈어요 · {formatKst(send.result.sentAt)}</p>
          ) : null}
          {send.result?.status === "blocked" ? (
            <p className={cx(opsTheme.errorNotice, "mt-1")}>{send.result.reason}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <Label>보낸 기록</Label>
        <ErrorNotice message={history.error} />
        <SentHistory history={history.result} />
      </div>
    </Panel>
  );
}
