import Head from "next/head";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
} from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { Badge } from "@/components/ui/badge";
import { BareButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import {
  type CrispFeedbackMessage,
  type CrispFeedbackThread,
  formatCrispDateTime,
} from "@/lib/feedback/crisp";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useAuthStore } from "@/store/useAuthStore";

type FeedbackListResponse = {
  items: CrispFeedbackThread[];
  ok: boolean;
};

type FeedbackReplyResponse = {
  emailError?: string | null;
  emailSent?: boolean;
  feedback?: CrispFeedbackThread;
  ok: boolean;
};

function getLastMessage(item: CrispFeedbackThread) {
  return item.messages[item.messages.length - 1] ?? null;
}

function getRequesterLabel(item: CrispFeedbackThread) {
  return item.requesterName || item.requesterEmail || `Feedback #${item.id}`;
}

function getEmailLocalPart(value?: string | null) {
  const email = value?.trim();
  if (!email) return "";
  return email.split("@")[0]?.trim() || "";
}

function getMessageUserName(
  message: CrispFeedbackMessage,
  requesterEmail?: string | null
) {
  return (
    getEmailLocalPart(message.authorEmail) ||
    getEmailLocalPart(requesterEmail) ||
    message.authorName ||
    "User"
  );
}

function getAvatarLabel(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || "U";
}

function getQueryFeedbackId(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const id = Number(rawValue);
  return Number.isFinite(id) ? id : null;
}

function getReplyBadge(item: CrispFeedbackThread) {
  if (item.wantsEmailReply === true && item.requesterEmail) {
    return { label: "Email OK", tone: "positive" as const };
  }
  if (item.wantsEmailReply === false) {
    return { label: "No email", tone: "neutral" as const };
  }
  return { label: "Pending", tone: "warning" as const };
}

function StatusBadge({ item }: { item: CrispFeedbackThread }) {
  const replied = item.status === "replied";
  return (
    <Badge
      size="sm"
      tone={replied ? "positive" : "neutral"}
      variant={replied ? "faded" : "outline"}
    >
      {replied ? "Replied" : "Open"}
    </Badge>
  );
}

function ReplyPreferenceBadge({ item }: { item: CrispFeedbackThread }) {
  const replyBadge = getReplyBadge(item);
  return (
    <Badge size="sm" tone={replyBadge.tone} variant="faded">
      {replyBadge.label}
    </Badge>
  );
}

function FeedbackListItem({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: CrispFeedbackThread;
  onSelect: (id: number) => void;
}) {
  const lastMessage = getLastMessage(item);

  return (
    <BareButton
      type="button"
      onClick={() => onSelect(item.id)}
      className={cx(
        "relative block w-full px-4 py-3 text-left transition hover:bg-bg-weak",
        active && "bg-bg-weak"
      )}
    >
      {active ? (
        <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-neutral-1000" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium leading-5 text-neutral-primary">
            {getRequesterLabel(item)}
          </div>
          <div className="mt-0.5 text-[11px] leading-4 text-neutral-soft">
            #{item.id} · {formatCrispDateTime(item.createdAt)}
          </div>
        </div>
        <StatusBadge item={item} />
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-neutral-muted">
        {lastMessage?.text ?? "-"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ReplyPreferenceBadge item={item} />
        {item.locale ? (
          <Badge size="sm" variant="outline">
            {item.locale}
          </Badge>
        ) : null}
      </div>
    </BareButton>
  );
}

function ConversationAvatar({ label }: { label: string }) {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-floating text-[11px] font-semibold text-neutral-primary">
      {label}
    </div>
  );
}

function ConversationMessage({
  message,
  requesterEmail,
}: {
  message: CrispFeedbackMessage;
  requesterEmail?: string | null;
}) {
  const isUserMessage = message.role === "user";
  const userName = getMessageUserName(message, requesterEmail);
  const avatar = isUserMessage ? getAvatarLabel(userName) : "H";
  const isDeleted = Boolean(message.deletedAt);
  const bubble = (
    <div
      className={cx(
        "max-w-[76%] rounded-md px-3 py-2 text-[13px] leading-6",
        isDeleted && "opacity-60",
        isUserMessage
          ? "border border-neutral-1000-a05 bg-bg-floating text-neutral-primary"
          : "bg-neutral-1000 text-neutral-00"
      )}
    >
      {isUserMessage ? (
        <div className="mb-1 text-[11px] font-medium leading-4 text-neutral-muted">
          {userName}
          {isDeleted ? " · 삭제됨" : ""}
        </div>
      ) : isDeleted ? (
        <div className="mb-1 text-[11px] font-medium leading-4 text-neutral-300">
          삭제됨
        </div>
      ) : null}
      <div className="whitespace-pre-wrap break-words">{message.text}</div>
      <div
        className={cx(
          "mt-1 text-[11px] leading-4",
          isUserMessage ? "text-neutral-soft" : "text-neutral-300"
        )}
      >
        {message.authorEmail ? `${message.authorEmail} · ` : ""}
        {formatCrispDateTime(message.createdAt)}
      </div>
    </div>
  );

  if (!isUserMessage) {
    return <div className="flex justify-end">{bubble}</div>;
  }

  return (
    <div className="flex items-start gap-2">
      <ConversationAvatar label={avatar} />
      {bubble}
    </div>
  );
}

function FeedbackEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-floating text-neutral-muted">
        <MessageSquareText className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium text-neutral-primary">
        선택된 피드백이 없습니다.
      </p>
      <p className="mt-1 text-xs leading-5 text-neutral-muted">
        왼쪽 리스트에서 대화를 선택하세요.
      </p>
    </div>
  );
}

function ConfirmReplyDialog({
  operatorEmail,
  onCancel,
  onConfirm,
  sending,
  willSendEmail,
}: {
  operatorEmail?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  sending: boolean;
  willSendEmail: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-reply-confirm-title"
        className="w-full max-w-sm rounded-lg border border-neutral-1000-a05 bg-bg-floating p-5 shadow-[0_24px_80px_color-mix(in_srgb,var(--color-neutral-1000)_18%,transparent)]"
      >
        <h2
          id="feedback-reply-confirm-title"
          className="text-base font-semibold text-neutral-primary"
        >
          답장을 보낼까요?
        </h2>
        <p className="mt-3 text-sm leading-6 text-neutral-muted">
          {willSendEmail
            ? `현재 로그인한 ${operatorEmail ?? "내부 계정"}으로 답장 메일이 갑니다.`
            : "이 유저는 이메일 수신을 허용하지 않았거나 이메일이 없어 채팅창에만 답장이 남습니다."}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <BareButton
            type="button"
            onClick={onCancel}
            disabled={sending}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
          >
            취소
          </BareButton>
          <BareButton
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className={cx(opsTheme.buttonPrimary, "h-9 px-3")}
          >
            확인
          </BareButton>
        </div>
      </div>
    </div>
  );
}

export default function OpsFeedbackPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<CrispFeedbackThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const selectedIdRef = useRef<number | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchWithInternalAuth<FeedbackListResponse>(
        "/api/internal/feedback"
      );
      setItems(payload.items);

      const queryId = getQueryFeedbackId(router.query.feedbackId);
      setSelectedId((currentSelectedId) => {
        if (queryId && payload.items.some((item) => item.id === queryId)) {
          return queryId;
        }
        const preservedId = currentSelectedId ?? selectedIdRef.current;
        if (
          preservedId &&
          payload.items.some((item) => item.id === preservedId)
        ) {
          return preservedId;
        }
        return payload.items[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "피드백을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [router.query.feedbackId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadFeedback();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadFeedback]);

  const selectFeedback = useCallback(
    (id: number) => {
      setSelectedId(id);
      setDraft("");
      setError("");
      setNotice("");
      void router.replace(
        {
          pathname: router.pathname,
          query: { feedbackId: id },
        },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const submitReply = useCallback(async () => {
    if (!selectedItem || sending) return;
    const message = draft.trim();
    if (!message) return;

    setSending(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<FeedbackReplyResponse>(
        "/api/internal/feedback",
        {
          body: JSON.stringify({
            id: selectedItem.id,
            message,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );

      if (payload.feedback) {
        setItems((current) => [
          payload.feedback!,
          ...current.filter((item) => item.id !== payload.feedback!.id),
        ]);
        setSelectedId(payload.feedback.id);
      }

      setDraft("");
      setConfirmOpen(false);
      if (payload.emailError) {
        setNotice(
          `답장은 저장했지만 이메일 발송은 실패했습니다. ${payload.emailError}`
        );
      } else {
        setNotice(
          payload.emailSent
            ? "채팅과 이메일로 답장을 보냈습니다."
            : "채팅창에 답장을 남겼습니다."
        );
      }
    } catch (replyError) {
      setError(
        replyError instanceof Error
          ? replyError.message
          : "답장을 저장하지 못했습니다."
      );
    } finally {
      setSending(false);
    }
  }, [draft, selectedItem, sending]);

  const selectedReplyBadge = selectedItem ? getReplyBadge(selectedItem) : null;
  const willSendEmail =
    selectedItem?.wantsEmailReply === true &&
    Boolean(selectedItem.requesterEmail);

  return (
    <>
      <Head>
        <title>Feedback · Harper Ops</title>
      </Head>

      <OpsShell
        title="Feedback"
        actions={
          <BareButton
            type="button"
            onClick={() => void loadFeedback()}
            disabled={loading}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
          >
            <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
            새로고침
          </BareButton>
        }
      >
        <section className="grid min-h-[calc(100vh-150px)] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating">
            <header className="border-b border-neutral-1000-a05 px-4 py-3">
              <div className="text-base font-normal text-neutral-primary">
                {items.length} conversations
              </div>
            </header>

            <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-neutral-1000-a05">
              {loading ? (
                <div className="flex items-center gap-2 px-4 py-5 text-sm text-neutral-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-neutral-muted">
                  아직 들어온 피드백이 없습니다.
                </div>
              ) : (
                items.map((item) => (
                  <FeedbackListItem
                    key={item.id}
                    active={item.id === selectedId}
                    item={item}
                    onSelect={selectFeedback}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating">
            {selectedItem ? (
              <>
                <header className="border-b border-neutral-1000-a05 px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className={opsTheme.eyebrow}>
                        Feedback #{selectedItem.id}
                      </div>
                      <h1 className="mt-1 truncate text-base font-semibold text-neutral-primary">
                        {getRequesterLabel(selectedItem)}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-muted">
                        {selectedItem.requesterEmail ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {selectedItem.requesterEmail}
                          </span>
                        ) : (
                          <span>이메일 없음</span>
                        )}
                        <span className="truncate">
                          {selectedItem.pagePath}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge item={selectedItem} />
                      {selectedReplyBadge ? (
                        <ReplyPreferenceBadge item={selectedItem} />
                      ) : null}
                    </div>
                  </div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto bg-bg-default/90 px-5 py-5">
                  {selectedItem.messages.map((message) => (
                    <ConversationMessage
                      key={message.id}
                      message={message}
                      requesterEmail={selectedItem.requesterEmail}
                    />
                  ))}
                </div>

                <footer className="border-t border-neutral-1000-a05 bg-bg-floating p-4">
                  {notice ? (
                    <div className="mb-3 rounded-md bg-positive-faded px-3 py-2 text-xs leading-5 text-positive">
                      {notice}
                    </div>
                  ) : null}
                  {error ? (
                    <div className="mb-3 rounded-md bg-critical-faded px-3 py-2 text-xs leading-5 text-critical">
                      {error}
                    </div>
                  ) : null}
                  <UiTextarea
                    unstyled
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="답장을 입력하세요."
                    className={cx(
                      opsTheme.textarea,
                      "min-h-[88px] py-3 text-sm"
                    )}
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-neutral-muted">
                      {willSendEmail
                        ? `${selectedItem.requesterEmail}로 이메일이 함께 발송됩니다.`
                        : "이메일 수신 동의가 없어 채팅창에만 남습니다."}
                    </p>
                    <BareButton
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={!draft.trim() || sending}
                      className={cx(opsTheme.buttonPrimary, "h-9 px-3")}
                    >
                      {sending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      보내기
                    </BareButton>
                  </div>
                </footer>
              </>
            ) : (
              <FeedbackEmptyState />
            )}
          </section>
        </section>

        {confirmOpen && selectedItem ? (
          <ConfirmReplyDialog
            operatorEmail={user?.email}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => void submitReply()}
            sending={sending}
            willSendEmail={willSendEmail}
          />
        ) : null}
      </OpsShell>
    </>
  );
}
