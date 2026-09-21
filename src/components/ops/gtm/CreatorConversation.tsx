import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, RefreshCw, Reply } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gtmRequest } from "@/lib/gtm/client";
import type { GtmRow, GtmValue } from "@/lib/gtm/types";
import { mailStatusLabels } from "@/lib/gtm/email";
import { buildReplySubject, stripQuotedEmailText } from "@/lib/email/parse";
import EmailBody from "./EmailBody";
import styles from "./GtmWorkspace.module.css";

type Message = {
  id: string;
  kind: string;
  body: string;
  occurred_at: string;
  rfc_message_id: string | null;
  payload: {
    subject?: string;
    from?: string;
    recipient?: string;
    sender?: string;
  };
};
type Conversation = {
  messages: Message[];
  dispatches: GtmRow[];
  total: number;
};

function ReceivedEmail({ body }: { body: string }) {
  const newest = stripQuotedEmailText(body);
  return (
    <>
      <div className={styles.receivedBody}>{newest || body}</div>
      {newest && newest !== body.trim() && (
        <details>
          <summary>이전 대화를 포함한 원문 보기</summary>
          <div className={styles.receivedBody}>{body}</div>
        </details>
      )}
    </>
  );
}
export default function CreatorConversation({
  account,
  record,
  canWrite,
  onDirtyChange,
  onPendingChange,
  onReview,
}: {
  account: string;
  record: GtmRow;
  canWrite: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onReview: (row: GtmRow) => void;
}) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [composing, setComposing] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const dirty = composing && Boolean(subject || body);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const conversation = useQuery({
    queryKey: ["ops-gtm", account, "conversation", record.id, offset],
    queryFn: ({ signal }) =>
      gtmRequest<Conversation>(
        "creator_conversation",
        { record_id: record.id, offset, limit: 30 },
        signal
      ),
    refetchInterval: dirty ? false : 30000,
    refetchOnWindowFocus: !dirty,
  });
  const emails = (
    (Array.isArray(record.contacts) ? record.contacts : []) as Record<
      string,
      GtmValue
    >[]
  )
    .filter(
      (item) =>
        String(item.channel).toLowerCase() === "email" &&
        !["invalid", "bounced", "revoked"].includes(
          String(item.status).toLowerCase()
        )
    )
    .map((item) => String(item.address).trim().toLowerCase());
  function compose(message: Message | null) {
    setReply(message);
    setRecipient(
      message
        ? String(
            message.kind === "message_received"
              ? message.payload.from
              : message.payload.recipient
          )
        : (emails[0] ?? "")
    );
    setSubject(message ? buildReplySubject(message.payload.subject) : "");
    setBody("");
    setError("");
    setNotice("");
    setComposing(true);
  }
  async function review() {
    const values = {
      record_id: record.id,
      recipient_email: recipient,
      subject,
      body,
      reply_to_activity_id: reply?.id ?? null,
    };
    const signature = JSON.stringify(values);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    setPending(true);
    onPendingChange(true);
    setError("");
    try {
      const draft = await gtmRequest<GtmRow>("prepare_email", {
        ...values,
        request_id: retry.current.id,
      });
      setComposing(false);
      setBody("");
      setSubject("");
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: ["ops-gtm", account] });
      onReview(draft);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "메일 초안을 저장하지 못했습니다."
      );
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }
  return (
    <div className={styles.form}>
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <MuteButton
          disabled={
            !canWrite ||
            Boolean(record.do_not_contact) ||
            !emails.length ||
            composing ||
            pending
          }
          onClick={() => compose(null)}
        >
          <MailPlus size={15} />
          메일 작성
        </MuteButton>
        <MuteButton
          disabled={pending || composing}
          onClick={async () => {
            setPending(true);
            onPendingChange(true);
            setError("");
            setNotice("");
            try {
              await gtmRequest("sync_mail", {});
              await queryClient.invalidateQueries({
                queryKey: ["ops-gtm", account],
              });
              setNotice("메일을 동기화했습니다.");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "메일 동기화에 실패했습니다."
              );
            } finally {
              setPending(false);
              onPendingChange(false);
            }
          }}
        >
          <RefreshCw size={15} />
          {pending ? "처리 중…" : "메일 동기화"}
        </MuteButton>
      </div>
      {record.do_not_contact ? (
        <div className={styles.error}>연락 금지로 표시된 크리에이터입니다.</div>
      ) : !emails.length ? (
        <div>연락처 탭에서 이메일을 등록하세요.</div>
      ) : null}
      {(error || conversation.error) && (
        <div role="alert" className={styles.error}>
          {error || conversation.error?.message}
        </div>
      )}
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}
      {composing && (
        <section
          className={styles.composer}
          aria-label={reply ? "답장 작성" : "새 메일 작성"}
        >
          <div className={styles.form}>
            <div>보내는 사람 · Harper &lt;harper@matchharper.com&gt;</div>
            <label>
              받는 사람
              <select
                aria-label="받는 사람"
                value={recipient}
                disabled={pending || Boolean(reply)}
                onChange={(event) => setRecipient(event.target.value)}
              >
                {emails.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="gtm-mail-subject">제목</label>
            <Input
              id="gtm-mail-subject"
              autoFocus
              value={subject}
              disabled={pending}
              onChange={(event) => setSubject(event.target.value)}
            />
            <EmailBody value={body} onChange={setBody} disabled={pending} />
            <div className={styles.row}>
              <MuteButton
                variant="dark"
                disabled={
                  pending ||
                  !subject.trim() ||
                  !body.trim() ||
                  !emails.includes(recipient)
                }
                onClick={() => void review()}
              >
                발송 검토
              </MuteButton>
              <MuteButton
                disabled={pending}
                onClick={() => {
                  setComposing(false);
                  setSubject("");
                  setBody("");
                }}
              >
                작성 취소
              </MuteButton>
            </div>
          </div>
        </section>
      )}
      {conversation.data?.dispatches.map((dispatch) => (
        <div key={dispatch.id} className={styles.mailDraft}>
          <div>
            <span className={styles.mediumText}>
              {String(dispatch.subject)}
            </span>
            <div>
              {String(dispatch.recipient_email)} ·{" "}
              {mailStatusLabels[String(dispatch.status)] ??
                String(dispatch.status)}
            </div>
            {dispatch.last_error && (
              <div className={styles.error}>{String(dispatch.last_error)}</div>
            )}
          </div>
          <MuteButton
            disabled={composing || pending}
            onClick={() => onReview(dispatch)}
          >
            발송본 열기
          </MuteButton>
        </div>
      ))}
      {conversation.isLoading ? (
        <div>대화 불러오는 중…</div>
      ) : !conversation.data?.messages.length ? (
        <div>주고받은 메일이 없습니다.</div>
      ) : null}
      {conversation.data?.messages.map((message) => (
        <article
          key={message.id}
          className={`${styles.mailMessage} ${
            message.kind === "message_received"
              ? styles.mailIncoming
              : styles.mailOutgoing
          }`}
        >
          <header className={styles.mailHeader}>
            <div>
              <span className={styles.mailDirection}>
                {message.kind === "message_received"
                  ? "📥 받은 메일"
                  : "📤 보낸 메일"}
              </span>
              <span className={styles.mailSubject}>
                {message.payload.subject || "(제목 없음)"}
              </span>
              <div>
                {message.kind === "message_received"
                  ? message.payload.from
                  : message.payload.recipient}{" "}
                · {new Date(message.occurred_at).toLocaleString("ko-KR")}
              </div>
            </div>
            <MuteButton
              disabled={
                !canWrite ||
                composing ||
                pending ||
                Boolean(record.do_not_contact) ||
                !message.rfc_message_id
              }
              onClick={() => compose(message)}
            >
              <Reply size={15} />
              답장
            </MuteButton>
          </header>
          {message.kind === "message_sent" ? (
            <EmailBody
              value={message.body}
              readOnly
              label={`보낸 메일: ${message.payload.subject ?? ""}`}
            />
          ) : (
            <ReceivedEmail body={message.body} />
          )}
        </article>
      ))}
      {(conversation.data?.total ?? 0) > 30 && (
        <div className={styles.row}>
          <MuteButton
            disabled={offset === 0 || composing}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            이전
          </MuteButton>
          <span>
            {offset + 1}–{Math.min(offset + 30, conversation.data!.total)} /{" "}
            {conversation.data!.total}
          </span>
          <MuteButton
            disabled={offset + 30 >= conversation.data!.total || composing}
            onClick={() => setOffset(offset + 30)}
          >
            다음
          </MuteButton>
        </div>
      )}
    </div>
  );
}
