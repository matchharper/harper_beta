"use client";

import {
  ChevronDown,
  Copy,
  Loader2,
  MessageCircle,
  MessageSquareShare,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BareButton, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type CrispFeedbackMessage,
  type CrispFeedbackThread,
  formatCrispDateTime,
  isValidCrispEmail,
} from "@/lib/feedback/crisp";
import { CUSTOM_CRISP_OPEN_EVENT } from "@/lib/feedback/customCrispEvents";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

const STORAGE_KEY = "harper_custom_crisp_thread_v1";
const MAX_MESSAGE_LENGTH = 5000;
const MAX_COMPOSER_TEXTAREA_HEIGHT = 100;

type StoredThread = {
  id: number;
  token: string;
};

type ApiThreadResponse = {
  error?: string;
  feedback?: CrispFeedbackThread;
  ok?: boolean;
  token?: string;
};

type WidgetLocale = "ko" | "en";

type WidgetCopy = {
  cancel: string;
  confirm: string;
  copyMessage: string;
  deleteConfirmDescription: string;
  deleteConfirmTitle: string;
  deleteMessage: string;
  emailNo: string;
  emailPrompt: string;
  emailYes: string;
  headline: string;
  identityEmail: string;
  invalidEmail: string;
  identityName: string;
  identityPrompt: string;
  identitySubmit: string;
  placeholder: string;
  replyNotice: string;
  submitError: string;
  subtitle: string;
};

const COPY: Record<WidgetLocale, WidgetCopy> = {
  ko: {
    cancel: "취소",
    confirm: "확인",
    copyMessage: "메시지 복사",
    deleteConfirmDescription: "해당 메세지 아래의 모든 대화가 삭제됩니다.",
    deleteConfirmTitle: "삭제하시겠습니까?",
    deleteMessage: "메시지 삭제",
    emailNo: "아니오",
    emailPrompt: "답장을 이메일로 받으시겠습니까?",
    emailYes: "예",
    headline: "무엇을 도와드릴까요?",
    identityEmail: "이메일",
    invalidEmail: "이메일을 확인해주세요.",
    identityName: "이름",
    identityPrompt: "답변 받을 이름과 이메일을 남겨주세요.",
    identitySubmit: "제출",
    placeholder: "메시지를 입력하세요...",
    replyNotice:
      "이메일과 현재 채팅창을 통해 답을 드릴게요.<br />연락해주셔서 감사합니다.",
    submitError: "메시지를 보내지 못했습니다.",
    subtitle: "메시지를 남겨주시면 확인하고 답변드릴게요.",
  },
  en: {
    cancel: "Cancel",
    confirm: "Confirm",
    copyMessage: "Copy message",
    deleteConfirmDescription:
      "This message and every message below it will be deleted from your chat.",
    deleteConfirmTitle: "Delete this message?",
    deleteMessage: "Delete message",
    emailNo: "No",
    emailPrompt: "Would you like to receive replies by email?",
    emailYes: "Yes",
    headline: "How can we help?",
    identityEmail: "Email",
    invalidEmail: "Check the email address.",
    identityName: "Name",
    identityPrompt: "Leave your name and email for a reply.",
    identitySubmit: "Submit",
    placeholder: "Type your message...",
    replyNotice:
      "We will reply here and by email.<br />Thank you for contacting us.",
    submitError: "Could not send your message.",
    subtitle:
      "Send us a message and we'll get back to you as soon as possible.",
  },
};

function readStoredThread() {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null"
    ) as StoredThread | null;
    if (!parsed?.id || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredThread(value: StoredThread) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function getWidgetLocale(): WidgetLocale {
  if (typeof window === "undefined") return "ko";
  return window.location.pathname.startsWith("/en") ? "en" : "ko";
}

function getPagePath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function getEmailLocalPart(value?: string | null) {
  const email = value?.trim();
  if (!email) return "";
  return email.split("@")[0]?.trim() || "";
}

function getMessageAuthorLabel(message: CrispFeedbackMessage) {
  return (
    getEmailLocalPart(message.authorEmail) || message.authorName?.trim() || ""
  );
}

function WidgetHeader({
  copy,
  onClose,
}: {
  copy: WidgetCopy;
  onClose: () => void;
}) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-neutral-1000-a05 px-4">
      <h2 className="text-[14px] font-normal leading-5 text-neutral-primary">
        Harper Team
      </h2>
      <BareButton
        type="button"
        aria-label="채팅 닫기"
        onClick={onClose}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-primary transition hover:bg-bg-weak"
      >
        <X className="h-4 w-4" />
      </BareButton>
    </header>
  );
}

function EmptyState({ copy }: { copy: WidgetCopy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-[320px] flex-1 flex-col items-center justify-center px-5 text-center"
    >
      <h3 className="text-[16px] font-semibold leading-6 text-neutral-primary">
        {copy.headline}
      </h3>
      <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
        {copy.subtitle}
      </p>
    </motion.div>
  );
}

function MessageBubble({
  copy,
  deleting,
  message,
  onCopy,
  onRequestDelete,
}: {
  copy: WidgetCopy;
  deleting: boolean;
  message: CrispFeedbackMessage;
  onCopy: (message: CrispFeedbackMessage) => void;
  onRequestDelete: (message: CrispFeedbackMessage) => void;
}) {
  const isUserMessage = message.role === "user";
  const isAdminMessage = message.role === "admin";
  const adminAuthorLabel = isAdminMessage ? getMessageAuthorLabel(message) : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isUserMessage ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "group flex max-w-[82%] flex-col",
          isUserMessage ? "items-end" : "items-start"
        )}
      >
        {adminAuthorLabel && (
          <p className="mb-1 text-[12px] font-normal leading-4 text-neutral-muted">
            From: {adminAuthorLabel}
          </p>
        )}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-[13px] leading-5",
            isUserMessage
              ? "bg-neutral-1000 text-neutral-00"
              : isAdminMessage
                ? "border border-neutral-1000-a05 bg-bg-floating text-neutral-primary"
                : "bg-bg-weak text-neutral-muted"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          <p
            className={cn(
              "mt-1 text-[10px] leading-3",
              isUserMessage ? "text-neutral-300" : "text-neutral-soft"
            )}
          >
            {formatCrispDateTime(message.createdAt)}
          </p>
        </div>
        {isUserMessage ? (
          <div className="mt-1 flex h-5 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <BareButton
              type="button"
              aria-label="메시지 복사"
              title={copy.copyMessage}
              onClick={() => onCopy(message)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary"
            >
              <Copy className="h-3 w-3" />
            </BareButton>
            <BareButton
              type="button"
              aria-label="메시지 삭제"
              title={copy.deleteMessage}
              disabled={deleting}
              onClick={() => onRequestDelete(message)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </BareButton>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function DeleteMessageConfirm({
  copy,
  deleting,
  onCancel,
  onConfirm,
}: {
  copy: WidgetCopy;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-1000/12 px-5 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="harper-message-delete-title"
        className="w-full max-w-[280px] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-4 shadow-[0_18px_48px_rgba(0,0,0,0.16)]"
      >
        <h3
          id="harper-message-delete-title"
          className="text-[14px] font-medium leading-5 text-neutral-primary"
        >
          {copy.deleteConfirmTitle}
        </h3>
        <p className="mt-2 text-[12px] leading-5 text-neutral-muted">
          {copy.deleteConfirmDescription}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={deleting}
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-[12px]"
          >
            {copy.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={deleting}
            onClick={onConfirm}
            className="h-8 rounded-md px-3 text-[12px]"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {copy.confirm}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EmailChoicePrompt({
  copy,
  disabled,
  onSelect,
}: {
  copy: WidgetCopy;
  disabled: boolean;
  onSelect: (value: boolean) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-3 py-3"
    >
      <p className="text-[13px] font-medium leading-5 text-neutral-primary">
        {copy.emailPrompt}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={disabled}
          onClick={() => onSelect(true)}
          className="h-8 rounded-md px-3 text-[12px]"
        >
          {copy.emailYes}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onSelect(false)}
          className="h-8 rounded-md px-3 text-[12px]"
        >
          {copy.emailNo}
        </Button>
      </div>
    </motion.div>
  );
}

function IdentityForm({
  copy,
  email,
  name,
  onEmailChange,
  onNameChange,
  onSubmit,
  saving,
}: {
  copy: WidgetCopy;
  email: string;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  saving: boolean;
}) {
  return (
    <motion.form
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={onSubmit}
      className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-3 py-3"
    >
      <p className="text-[13px] font-medium leading-5 text-neutral-primary">
        {copy.identityPrompt}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={copy.identityName}
          className="h-9 rounded-md text-[13px]"
        />
        <Input
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder={copy.identityEmail}
          type="email"
          className="h-9 rounded-md text-[13px]"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="primary"
        disabled={saving || !name.trim() || !email.trim()}
        className="mt-2 h-8 rounded-md px-3 text-[12px]"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {copy.identitySubmit}
      </Button>
    </motion.form>
  );
}

function Composer({
  copy,
  error,
  input,
  onChange,
  onSubmit,
  sending,
}: {
  copy: WidgetCopy;
  error: string;
  input: string;
  onChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  sending: boolean;
}) {
  const canSubmit = input.trim().length > 0 && !sending;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(
      textarea.scrollHeight,
      MAX_COMPOSER_TEXTAREA_HEIGHT
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_COMPOSER_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [input]);

  return (
    <form
      onSubmit={(event) => onSubmit(event)}
      className="shrink-0 border-t border-neutral-1000-a05 bg-bg-floating px-3 pb-3 pt-3"
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={copy.placeholder}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-10 max-h-[100px] overflow-y-hidden rounded-md px-3 py-2.5 text-[13px] leading-5 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-neutral-1000)_6%,transparent)] placeholder:text-neutral-muted"
        />
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          disabled={!canSubmit}
          className={cn(
            "h-10 w-10 rounded-md border-neutral-1000-a10 transition",
            canSubmit
              ? "bg-neutral-1000 text-neutral-00 hover:bg-neutral-900"
              : "bg-bg-weak text-neutral-muted"
          )}
          aria-label="메시지 보내기"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquareShare className="h-4 w-4" />
          )}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-[12px] leading-4 text-critical">{error}</p>
      ) : null}
    </form>
  );
}

function Launcher({
  copy,
  hasAdminReply,
  open,
  onToggle,
}: {
  copy: WidgetCopy;
  hasAdminReply: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
    >
      <BareButton
        type="button"
        onClick={onToggle}
        className="relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border border-neutral-1000 bg-neutral-1000 text-neutral-00 shadow-[0_18px_46px_color-mix(in_srgb,var(--color-neutral-1000)_24%,transparent)] transition hover:bg-neutral-900"
        aria-label="Harper 문의 열기"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: -18, scale: 0.85 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 18, scale: 0.85 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {open ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <MessageCircle className="h-5 w-5" />
            )}
          </motion.span>
        </AnimatePresence>
        {hasAdminReply && !open ? (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-neutral-1000 bg-primary" />
        ) : null}
      </BareButton>
    </motion.div>
  );
}

export default function CustomCrispWidget({
  showLauncher = true,
  showLauncherWhenOpen = false,
}: {
  showLauncher?: boolean;
  showLauncherWhenOpen?: boolean;
}) {
  const { session } = useAuthStore();
  const [deleteMessageSaving, setDeleteMessageSaving] = useState(false);
  const [emailChoiceSaving, setEmailChoiceSaving] = useState(false);
  const [error, setError] = useState("");
  const [identityEmail, setIdentityEmail] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] =
    useState<CrispFeedbackMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [storedThread, setStoredThread] = useState<StoredThread | null>(() =>
    readStoredThread()
  );
  const [thread, setThread] = useState<CrispFeedbackThread | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const accessToken = session?.access_token ?? null;
  const locale = getWidgetLocale();
  const copy = COPY[locale];
  const visibleMessages = useMemo(
    () => thread?.messages.filter((message) => !message.deletedAt) ?? [],
    [thread?.messages]
  );

  const buildHeaders = useCallback(
    (json = false) => {
      const headers: Record<string, string> = {};
      if (json) headers["Content-Type"] = "application/json";
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      return headers;
    },
    [accessToken]
  );

  const fetchThread = useCallback(
    async (threadRef: StoredThread) => {
      const response = await fetch(
        `/api/feedback/crisp/${threadRef.id}?token=${encodeURIComponent(
          threadRef.token
        )}`,
        {
          headers: buildHeaders(),
        }
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as ApiThreadResponse;
      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error ?? "문의 내역을 불러오지 못했습니다.");
      }
      setThread(payload.feedback);
    },
    [buildHeaders]
  );

  useEffect(() => {
    if (!storedThread) return;
    const timeoutId = window.setTimeout(() => {
      void fetchThread(storedThread).catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setStoredThread(null);
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchThread, storedThread]);

  useEffect(() => {
    if (!open || !storedThread) return;

    const intervalId = window.setInterval(() => {
      void fetchThread(storedThread).catch(() => undefined);
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [fetchThread, open, storedThread]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(CUSTOM_CRISP_OPEN_EVENT, handleOpen);
    return () =>
      window.removeEventListener(CUSTOM_CRISP_OPEN_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [open, visibleMessages.length]);

  const patchThread = useCallback(
    async (body: Record<string, unknown>) => {
      if (!storedThread) {
        throw new Error("Missing thread");
      }

      const response = await fetch(`/api/feedback/crisp/${storedThread.id}`, {
        body: JSON.stringify({
          ...body,
          token: storedThread.token,
        }),
        headers: buildHeaders(true),
        method: "PATCH",
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ApiThreadResponse;
      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error ?? copy.submitError);
      }

      setThread(payload.feedback);
      return payload.feedback;
    },
    [buildHeaders, copy.submitError, storedThread]
  );

  const handleSubmitMessage = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();

      const content = input.trim();
      if (!content || sending) return;

      setError("");
      setSending(true);

      try {
        if (storedThread) {
          await patchThread({ content });
        } else {
          const response = await fetch("/api/feedback/crisp", {
            body: JSON.stringify({
              content,
              locale,
              pagePath: getPagePath(),
            }),
            headers: buildHeaders(true),
            method: "POST",
          });
          const payload = (await response
            .json()
            .catch(() => ({}))) as ApiThreadResponse;
          if (!response.ok || !payload.feedback || !payload.token) {
            throw new Error(payload.error ?? copy.submitError);
          }

          const nextStoredThread = {
            id: payload.feedback.id,
            token: payload.token,
          };
          writeStoredThread(nextStoredThread);
          setStoredThread(nextStoredThread);
          setThread(payload.feedback);
        }

        setInput("");
      } catch {
        setError(copy.submitError);
      } finally {
        setSending(false);
      }
    },
    [
      buildHeaders,
      copy.submitError,
      input,
      locale,
      patchThread,
      sending,
      storedThread,
    ]
  );

  const handleEmailChoice = useCallback(
    async (wantsEmailReply: boolean) => {
      setEmailChoiceSaving(true);
      setError("");

      try {
        await patchThread({ wantsEmailReply });
      } catch {
        setError(copy.submitError);
      } finally {
        setEmailChoiceSaving(false);
      }
    },
    [copy.submitError, patchThread]
  );

  const handleIdentitySubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const guestName = identityName.trim();
      const guestEmail = identityEmail.trim();
      if (!guestName || !guestEmail || identitySaving) return;
      if (!isValidCrispEmail(guestEmail)) {
        setError(copy.invalidEmail);
        return;
      }

      setIdentitySaving(true);
      setError("");

      try {
        await patchThread({
          guestEmail,
          guestName,
        });
      } catch {
        setError(copy.submitError);
      } finally {
        setIdentitySaving(false);
      }
    },
    [
      copy.invalidEmail,
      copy.submitError,
      identityEmail,
      identityName,
      identitySaving,
      patchThread,
    ]
  );

  const handleCopyMessage = useCallback((message: CrispFeedbackMessage) => {
    const copyPromise = navigator.clipboard?.writeText(message.text);
    void copyPromise?.catch(() => undefined);
  }, []);

  const handleDeleteMessage = useCallback(async () => {
    if (!pendingDeleteMessage || deleteMessageSaving) return;

    setDeleteMessageSaving(true);
    setError("");

    try {
      await patchThread({ deleteFromMessageId: pendingDeleteMessage.id });
      setPendingDeleteMessage(null);
    } catch {
      setError(copy.submitError);
    } finally {
      setDeleteMessageSaving(false);
    }
  }, [
    copy.submitError,
    deleteMessageSaving,
    patchThread,
    pendingDeleteMessage,
  ]);

  const hasAdminReply = Boolean(
    visibleMessages.some((message) => message.role === "admin")
  );
  const hasMessages = visibleMessages.length > 0;
  const showEmailChoice = Boolean(
    thread &&
    hasMessages &&
    (thread.userId || thread.userEmail) &&
    thread.wantsEmailReply === null
  );
  const showIdentityForm = Boolean(
    thread &&
    hasMessages &&
    !thread.userId &&
    !thread.userEmail &&
    (!thread.requesterName || !thread.requesterEmail)
  );
  const showReplyNotice = Boolean(
    hasMessages && thread?.wantsEmailReply === true && !hasAdminReply
  );
  const shouldRenderLauncher = showLauncher || (showLauncherWhenOpen && open);

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.section
            key="harper-support-panel"
            aria-label="Harper 문의 채팅"
            initial={{
              filter: "blur(8px)",
              opacity: 0,
              scale: 0.96,
              y: 28,
            }}
            animate={{
              filter: "blur(0px)",
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              filter: "blur(4px)",
              opacity: 0,
              scale: 0.98,
              y: 16,
            }}
            transition={{
              damping: 32,
              mass: 0.8,
              stiffness: 360,
              type: "spring",
            }}
            className="fixed bottom-[92px] right-4 z-[80] flex h-[min(calc(100dvh-104px),clamp(620px,73dvh,820px))] w-[min(calc(100vw-28px),clamp(380px,25vw,516px))] flex-col overflow-hidden rounded-[14px] border border-neutral-1000-a10 bg-bg-floating font-sans shadow-[0_20px_60px_rgba(0,0,0,0.14)] sm:right-5"
          >
            <WidgetHeader copy={copy} onClose={() => setOpen(false)} />

            <div className="relative flex min-h-0 flex-1 flex-col bg-bg-floating">
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto",
                  hasMessages ? "px-4 py-4" : "flex px-0 py-0"
                )}
              >
                {hasMessages && thread ? (
                  <motion.div layout className="space-y-3">
                    <AnimatePresence initial={false}>
                      {visibleMessages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          copy={copy}
                          deleting={deleteMessageSaving}
                          message={message}
                          onCopy={handleCopyMessage}
                          onRequestDelete={setPendingDeleteMessage}
                        />
                      ))}
                    </AnimatePresence>

                    {showEmailChoice ? (
                      <EmailChoicePrompt
                        copy={copy}
                        disabled={emailChoiceSaving}
                        onSelect={handleEmailChoice}
                      />
                    ) : null}

                    {showIdentityForm ? (
                      <IdentityForm
                        copy={copy}
                        email={identityEmail}
                        name={identityName}
                        onEmailChange={setIdentityEmail}
                        onNameChange={setIdentityName}
                        onSubmit={handleIdentitySubmit}
                        saving={identitySaving}
                      />
                    ) : null}

                    {showReplyNotice ? (
                      <motion.p
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-lg bg-black/5 px-3 py-2 text-[12px] leading-5 text-black/80"
                        dangerouslySetInnerHTML={{ __html: copy.replyNotice }}
                      />
                    ) : null}

                    <div ref={messagesEndRef} />
                  </motion.div>
                ) : (
                  <EmptyState copy={copy} />
                )}
              </div>

              <Composer
                copy={copy}
                error={error}
                input={input}
                onChange={setInput}
                onSubmit={handleSubmitMessage}
                sending={sending}
              />
              <AnimatePresence>
                {pendingDeleteMessage ? (
                  <DeleteMessageConfirm
                    copy={copy}
                    deleting={deleteMessageSaving}
                    onCancel={() => {
                      if (deleteMessageSaving) return;
                      setPendingDeleteMessage(null);
                    }}
                    onConfirm={() => void handleDeleteMessage()}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {shouldRenderLauncher ? (
        <div className="fixed bottom-4 right-4 z-[81] sm:bottom-5 sm:right-5">
          <Launcher
            copy={copy}
            hasAdminReply={hasAdminReply}
            open={open}
            onToggle={() => setOpen((current) => !current)}
          />
        </div>
      ) : null}
    </>
  );
}
