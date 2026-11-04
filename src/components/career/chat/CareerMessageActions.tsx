import { CAREER_BUBBLE_BREAK } from "@/lib/career/conversationVersion";
import { useChatMessageFocus } from "@/components/chat/useChatMessageFocus";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CareerMessage } from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerMessageTime } from "@/lib/career/messageTime";
import { cn } from "@/lib/utils";

export const CareerMessageActions = ({
  message,
  onDeleteMessage,
}: {
  message: CareerMessage;
  onDeleteMessage?: (messageId: string | number) => boolean | Promise<boolean>;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contextPoint, setContextPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const logCareerEvent = useCareerLogEvent();
  const messageId = Number(message.id);
  const enabled =
    Number.isSafeInteger(messageId) && messageId > 0 && !message.typing;
  const contextAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          new DOMRect(contextPoint?.x ?? 0, contextPoint?.y ?? 0, 0, 0),
      },
    }),
    [contextPoint]
  );
  const {
    selection: focusedMessage,
    closing: focusClosing,
    close: closeFocus,
    targetRef: focusTargetRef,
  } = useChatMessageFocus(actionsRef, enabled);

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    []
  );

  useEffect(() => {
    const container = actionsRef.current?.closest<HTMLElement>(
      "[data-career-message-container]"
    );
    if (!enabled || !container) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    const context = (event: MouseEvent) => {
      if (mobile.matches || !(event.target instanceof Element)) return;
      if (!event.target.closest("[data-chat-message-bubble]")) return;
      if (
        event.target.closest(
          "a, button, input, textarea, select, [contenteditable=true]"
        )
      )
        return;
      event.preventDefault();
      setDeleteArmed(false);
      setContextPoint({ x: event.clientX, y: event.clientY });
    };
    const breakpoint = () => {
      setContextPoint(null);
      setDeleteArmed(false);
    };
    container.addEventListener("contextmenu", context);
    mobile.addEventListener("change", breakpoint);
    return () => {
      container.removeEventListener("contextmenu", context);
      mobile.removeEventListener("change", breakpoint);
    };
  }, [enabled]);

  useEffect(() => {
    if (!contextPoint) return;
    const dismiss = () => {
      setContextPoint(null);
      setDeleteArmed(false);
    };
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [contextPoint]);

  if (!enabled) return null;

  const handleCopy = async () => {
    logCareerEvent("click_chat_message_copy", {
      messageId,
      messageRole: message.role,
      messageType: message.messageType,
    });

    try {
      await navigator.clipboard.writeText(message.role === "assistant" ? message.content.replaceAll(CAREER_BUBBLE_BREAK, "\n\n") : message.content);
      setCopied(true);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({
        message: t(
          "career.chat.message.copy_failed",
          "메시지를 복사하지 못했습니다."
        ),
        variant: "white",
      });
    }
  };

  const handleDelete = async () => {
    if (!onDeleteMessage || deleting) return;
    if (!deleteArmed) {
      logCareerEvent("click_chat_message_delete", {
        messageId,
        messageRole: message.role,
        messageType: message.messageType,
      });
      setDeleteArmed(true);
      return;
    }

    setDeleting(true);
    const deleted = await onDeleteMessage(message.id);
    setDeleting(false);
    if (deleted) {
      setContextPoint(null);
      setDeleteArmed(false);
      void closeFocus();
      logCareerEvent("confirm_chat_message_delete", {
        messageId,
        messageRole: message.role,
        messageType: message.messageType,
      });
    }
    if (!deleted) setDeleteArmed(false);
  };

  const menu = (
    <ChatComposerSurface
      className={cn(
        "pointer-events-auto w-56 max-w-full select-none rounded-2xl",
        focusedMessage && "chat-message-focus-menu",
        focusClosing && "chat-message-focus-menu-closing pointer-events-none"
      )}
    >
      <time
        className="block px-4 pt-3 pb-2 text-xs text-neutral-soft"
        dateTime={message.createdAt || undefined}
      >
        {formatCareerMessageTime(message.createdAt, locale)}
      </time>
      <button
        type="button"
        aria-label={t("career.chat.message.copy", "메시지 복사")}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-neutral-primary transition-colors hover:bg-white/20 active:bg-neutral-1000-a05 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10"
        onClick={() => void handleCopy()}
      >
        <span aria-hidden="true" className="relative size-5 shrink-0">
          <Copy
            className={cn(
              "absolute size-5 transition-[translate,opacity,filter] duration-500 ease-in-out motion-reduce:transition-none",
              copied
                ? "translate-x-1.5 opacity-0 blur-[3px]"
                : "translate-x-0 opacity-100 blur-[0px]"
            )}
          />
          <Check
            className={cn(
              "absolute size-5 transition-[translate,opacity,filter] duration-500 ease-in-out motion-reduce:transition-none",
              copied
                ? "translate-x-0 opacity-100 blur-[0px]"
                : "-translate-x-1.5 opacity-0 blur-[3px]"
            )}
          />
        </span>
        {t("career.profile.documents.copy_content", "복사")}
        <span role="status" className="sr-only">
          {copied
            ? t("career.chat.message.copy_success", "메시지를 복사했습니다.")
            : ""}
        </span>
      </button>
      {onDeleteMessage && (
        <button
          type="button"
          aria-label={
            deleteArmed
              ? t(
                  "career.chat.message.delete_confirm",
                  "메시지 삭제를 확정하려면 다시 누르세요."
                )
              : t("career.chat.message.delete", "메시지 삭제")
          }
          disabled={deleting}
          className="flex min-h-12 w-full items-center gap-3 border-t border-neutral-1000-a05 px-4 text-left text-sm text-critical transition-colors disabled:opacity-50 hover:bg-white/20 active:bg-neutral-1000-a05 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10"
          onClick={() => void handleDelete()}
        >
          <Trash2 className="size-5" />
          {deleteArmed
            ? t(
                "career.common.internal_connection_onboarding_modal.0z48n2w",
                "확인"
              )
            : t("career.profile.context.delete", "삭제")}
        </button>
      )}
    </ChatComposerSurface>
  );

  return (
    <>
      <TalentCareerModal
        open={Boolean(focusedMessage)}
        onClose={() => {
          void closeFocus();
          setDeleteArmed(false);
        }}
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (
            target instanceof Element &&
            target.closest("[data-chat-message-lifted]")
          ) {
            event.preventDefault();
          }
        }}
        ariaLabel={t("career.chat.message.copy", "메시지 복사")}
        showCloseButton={false}
        backdropClassName={cn(
          "chat-message-focus-backdrop bg-black/[0.06] backdrop-blur-none",
          focusClosing && "chat-message-focus-backdrop-closing"
        )}
        panelClassName="chat-message-focus-panel pointer-events-none! w-fit max-w-full border-0 bg-transparent shadow-none overflow-visible"
        bodyClassName="overflow-visible"
      >
        <div
          className={cn(
            "flex max-w-full select-none flex-col items-center gap-5",
            focusClosing && "pointer-events-none"
          )}
        >
          <div
            ref={focusTargetRef}
            aria-hidden="true"
            className="pointer-events-none max-w-[calc(100vw-32px)] max-h-[min(56dvh,calc(100dvh-240px))] shrink-0"
            style={{
              width: (focusedMessage?.width ?? 0) * 1.025,
              height: (focusedMessage?.height ?? 0) * 1.025,
            }}
          />
          {menu}
        </div>
      </TalentCareerModal>
      <div
        ref={actionsRef}
        hidden
        data-career-message-actions-open={contextPoint ? "true" : undefined}
      />
      <Popover
        open={Boolean(contextPoint)}
        onOpenChange={(open) => {
          if (!open) {
            setContextPoint(null);
            setDeleteArmed(false);
          }
        }}
      >
        <PopoverAnchor virtualRef={contextAnchor} />
        <PopoverContent
          surface={false}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label={t("career.chat.message.copy", "메시지 복사")}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {menu}
        </PopoverContent>
      </Popover>
    </>
  );
};
