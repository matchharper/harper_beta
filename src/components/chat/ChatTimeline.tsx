import { ArrowUp, LoaderCircle } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { BareButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

export const CHAT_USER_BUBBLE_CLASS =
  "mt-1 ml-auto w-fit max-w-[min(820px,92%)] self-end rounded-[14px] bg-black px-3 py-1.5 text-neutral-00";

export const CHAT_ASSISTANT_BUBBLE_CLASS =
  "w-fit max-w-[min(920px,100%)] self-start text-neutral-primary";

export const CHAT_ASSISTANT_CONTENT_INHERIT_CLASS = [
  "text-[inherit] leading-[inherit]",
  "[&_blockquote]:text-[inherit] [&_blockquote]:leading-[inherit]",
  "[&_li]:text-[inherit] [&_li]:leading-[inherit]",
  "[&_ol]:text-[inherit] [&_ol]:leading-[inherit]",
  "[&_p]:text-[inherit] [&_p]:leading-[inherit]",
  "[&_table]:text-[inherit] [&_table]:leading-[inherit]",
  "[&_ul]:text-[inherit] [&_ul]:leading-[inherit]",
].join(" ");

export function getChatMessageDateKey(createdAt: string) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousChatMessageDateKey<
  TMessage extends { createdAt: string },
>(messages: TMessage[], currentIndex: number) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const dateKey = getChatMessageDateKey(messages[index].createdAt);
    if (dateKey) return dateKey;
  }
  return "";
}

export function ChatDateDivider({
  ariaLabel,
  className,
  label,
}: {
  ariaLabel?: string;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="separator"
      className="flex justify-center py-2"
      aria-label={ariaLabel}
    >
      <span
        className={cn(
          "rounded-full bg-bg-weak px-2.5 py-0.5 font-light text-neutral-soft",
          className
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function ChatAssistantLabel({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("font-medium text-neutral-primary", className)}>
      {children ?? (
        <Image
          src="/svgs/harper-h-mark.svg"
          alt="Harper"
          width={18}
          height={18}
          className="mt-2"
        />
      )}
    </div>
  );
}

export function ChatAssistantContent({
  className,
  content,
  linkClassName,
  onHarperLinkClick,
  renderEmailLinksAsText = false,
}: {
  className?: string;
  content: string;
  linkClassName?: string;
  onHarperLinkClick?: (href: string) => void;
  renderEmailLinksAsText?: boolean;
}) {
  return (
    <RichText
      className={className}
      content={content}
      linkClassName={linkClassName}
      onHarperLinkClick={onHarperLinkClick}
      renderEmailLinksAsText={renderEmailLinksAsText}
    />
  );
}

export function ChatAssistantPending({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 py-1 text-neutral-muted",
        className
      )}
      role="status"
    >
      <LoaderCircle
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin text-neutral-soft"
      />
      <span>{label}</span>
    </div>
  );
}

export function ChatMessageBubbleFrame({
  active = false,
  children,
  className,
  isUser,
  startAdornment,
  typographyClassName,
  unstyled = false,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  isUser: boolean;
  startAdornment?: ReactNode;
  typographyClassName?: string;
  unstyled?: boolean;
}) {
  return (
    <article
      className={cn(
        !unstyled && "transition-colors duration-300",
        !unstyled && typographyClassName,
        !unstyled &&
          (isUser ? CHAT_USER_BUBBLE_CLASS : CHAT_ASSISTANT_BUBBLE_CLASS),
        !unstyled && !isUser && active && "ring-1 ring-neutral-1000-a05",
        className
      )}
    >
      <div className="flex items-start gap-2">
        {startAdornment}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </article>
  );
}

export type ChatChoice = {
  label: string;
  value: string;
};

export function ChatChoiceList({
  choices,
  className,
  disabled = false,
  hint,
  keyPrefix = "choice",
  onSelect,
  typographyClassName,
}: {
  choices: ChatChoice[];
  className?: string;
  disabled?: boolean;
  hint?: ReactNode;
  keyPrefix?: string;
  onSelect?: (choice: ChatChoice, index: number) => void | Promise<void>;
  typographyClassName?: string;
}) {
  if (choices.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-3 flex max-w-[520px] min-w-[320px] w-full flex-col gap-2",
        className
      )}
    >
      {choices.map((choice, index) => (
        <BareButton
          key={`${keyPrefix}-${index}-${choice.value}`}
          type="button"
          onClick={() => void onSelect?.(choice, index)}
          disabled={disabled || !onSelect}
          className={cn(
            "flex cursor-pointer min-h-11 w-full items-center justify-start rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 py-2 text-left text-base font-medium leading-5 text-neutral-primary transition-colors hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-55",
            typographyClassName
          )}
        >
          <span className="wrap-break-word min-w-0">{choice.label}</span>
        </BareButton>
      ))}
      {disabled || !onSelect || !hint ? null : (
        <div className="text-xs text-neutral-muted">{hint}</div>
      )}
    </div>
  );
}

export function ChatLoadOlderButton({
  className,
  disabled = false,
  label,
  loading = false,
  loadingLabel,
  onClick,
}: {
  className?: string;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  loadingLabel: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <BareButton
      type="button"
      onClick={() => void onClick()}
      disabled={disabled || loading}
      className={cn(
        "inline-flex gap-2 h-8 items-center justify-center rounded-[8px] bg-bg-floating px-4 text-xs text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-basement hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {loading ? loadingLabel : label}
      <ArrowUp className="h-3 w-3" strokeWidth={1.8} />
    </BareButton>
  );
}
