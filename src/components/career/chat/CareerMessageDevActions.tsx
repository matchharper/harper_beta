import { Copy, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CareerMessage } from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import { MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { cn } from "@/lib/utils";

export const CareerMessageDevActions = ({
  isUser,
  message,
  onDeleteMessage,
}: {
  isUser: boolean;
  message: CareerMessage;
  onDeleteMessage: (messageId: string | number) => boolean | Promise<boolean>;
}) => {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dismissedUntilPointerLeaves, setDismissedUntilPointerLeaves] =
    useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const logCareerEvent = useCareerLogEvent();
  const messageId = Number(message.id);

  useEffect(() => {
    if (!deleteArmed) return;

    const actions = actionsRef.current;
    const ownerDocument = actions?.ownerDocument;
    if (!actions || !ownerDocument) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || actions.contains(target)) return;

      const messageContainer = actions.closest(
        "[data-career-message-container]"
      );
      setDeleteArmed(false);
      setDismissedUntilPointerLeaves(
        Boolean(messageContainer?.contains(target))
      );

      const activeElement = ownerDocument.activeElement;
      if (activeElement && actions.contains(activeElement)) {
        (activeElement as HTMLElement).blur();
      }
    };

    ownerDocument.addEventListener(
      "pointerdown",
      handleOutsidePointerDown,
      true
    );
    return () =>
      ownerDocument.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true
      );
  }, [deleteArmed]);

  useEffect(() => {
    if (!dismissedUntilPointerLeaves) return;

    const messageContainer = actionsRef.current?.closest(
      "[data-career-message-container]"
    );
    if (!messageContainer) return;

    const handlePointerLeave = () => setDismissedUntilPointerLeaves(false);
    messageContainer.addEventListener("pointerleave", handlePointerLeave, {
      once: true,
    });
    return () =>
      messageContainer.removeEventListener("pointerleave", handlePointerLeave);
  }, [dismissedUntilPointerLeaves]);

  if (!Number.isSafeInteger(messageId) || messageId <= 0 || message.typing) {
    return null;
  }

  const handleCopy = async () => {
    logCareerEvent("click_chat_dev_message_copy", {
      messageId,
      messageRole: message.role,
      messageType: message.messageType,
    });

    try {
      await navigator.clipboard.writeText(message.content);
      // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
      showToast({ message: "메시지를 복사했습니다.", variant: "white" });
    } catch {
      // career-i18n-skip-next-line: dev controls text is intentionally Korean-only.
      showToast({ message: "메시지를 복사하지 못했습니다.", variant: "white" });
    }
  };

  const handleDelete = async () => {
    if (!deleteArmed) {
      logCareerEvent("click_chat_dev_message_delete", {
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
      logCareerEvent("confirm_chat_dev_message_delete", {
        messageId,
        messageRole: message.role,
        messageType: message.messageType,
      });
    }
    if (!deleted) setDeleteArmed(false);
  };

  return (
    <div
      ref={actionsRef}
      data-career-i18n-skip="true"
      onFocus={() => setDismissedUntilPointerLeaves(false)}
      className={cn(
        "mt-1 flex transition-opacity duration-150",
        isUser ? "self-end" : "self-start",
        dismissedUntilPointerLeaves
          ? "pointer-events-none opacity-0"
          : deleteArmed
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      )}
    >
      <MuteButton
        aria-label="메시지 복사"
        size="sm"
        title="복사"
        variant="transparent"
        onClick={() => void handleCopy()}
      >
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      </MuteButton>
      <MuteButton
        aria-label={
          deleteArmed
            ? "메시지 삭제를 확정하려면 다시 누르세요."
            : "메시지 삭제"
        }
        disabled={deleting}
        size="sm"
        title={deleteArmed ? "확인" : "삭제"}
        variant={deleteArmed ? "critical" : "transparent"}
        onClick={() => void handleDelete()}
      >
        {deleteArmed ? (
          "확인"
        ) : (
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </MuteButton>
    </div>
  );
};
