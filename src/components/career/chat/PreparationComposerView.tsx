import { useEffect, type ReactNode, type Ref } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";

/** The existing Apply with Harper item layout; data and persistence live in its callers. */
export function PreparationComposerView({
  closeRef,
  ...props
}: {
  title: ReactNode;
  titleAside?: ReactNode;
  itemId?: string;
  inputKey?: string;
  variant?: "question" | "suggestion";
  body?: ReactNode;
  actions?: ReactNode;
  responseFlash?: string;
  index: number;
  count: number;
  value: string;
  busy: boolean;
  error?: string;
  inputLabel?: string;
  closeLabel: string;
  closeHasDialog?: boolean;
  closeRef?: Ref<HTMLButtonElement>;
  onChange: (value: string) => void;
  onNavigate: (offset: number) => void;
  onAnswer: () => void;
  onSkip: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useCareerT();
  const { busy, index, count, onNavigate } = props;
  const suggestion = props.variant === "suggestion";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        busy ||
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.closest(
          'input,textarea,select,button,[contenteditable="true"],[role="dialog"],[role="combobox"]'
        )
      )
        return;
      const offset =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (offset && index + offset >= 0 && index + offset < count) {
        event.preventDefault();
        onNavigate(offset);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, index, count, onNavigate]);
  const submit = () => {
    if (props.value.trim() && !props.busy) props.onAnswer();
  };
  const title = (
    <strong
      className={
        suggestion
          ? "min-w-0 break-words text-inherit font-medium"
          : "row-start-2 min-w-0 break-words text-inherit font-medium sm:row-start-1"
      }
    >
      {props.title}
    </strong>
  );
  return (
    <ChatComposerSurface
      data-preparation-questions=""
      data-suggestion-id={props.itemId}
      data-response-flash={props.responseFlash}
      aria-busy={props.busy}
      style={careerTimelineTypographyStyle}
      className={cn(
        "flex max-h-[min(540px,70dvh)] flex-col p-3 md:p-4",
        suggestion &&
          "transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
        props.responseFlash && "ring-1 ring-primary/20",
        careerTimelineMessageTextClassName
      )}
    >
      <div className="grid shrink-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        {suggestion ? (
          <div className="row-start-2 flex min-w-0 items-start gap-2 sm:row-start-1">
            {title}
            {props.titleAside}
          </div>
        ) : (
          title
        )}
        <div className="row-start-1 flex items-center justify-between gap-2 text-xs text-neutral-muted sm:col-start-2 sm:justify-end">
          <div className="flex items-center gap-1">
            <MuteButton
              variant="transparent"
              className={
                suggestion ? "border-0 bg-transparent shadow-none" : undefined
              }
              aria-label={t("career.prep.previous", "이전 항목")}
              disabled={props.busy || props.index <= 0}
              onClick={() => props.onNavigate(-1)}
            >
              <ChevronLeft size={16} />
            </MuteButton>
            <span>
              {props.index + 1} / {props.count}
            </span>
            <MuteButton
              variant="transparent"
              className={
                suggestion ? "border-0 bg-transparent shadow-none" : undefined
              }
              aria-label={t("career.prep.next", "다음 항목")}
              disabled={props.busy || props.index >= props.count - 1}
              onClick={() => props.onNavigate(1)}
            >
              <ChevronRight size={16} />
            </MuteButton>
          </div>
          <MuteButton
            variant="transparent"
            aria-label={props.closeLabel}
            aria-haspopup={props.closeHasDialog ? "dialog" : undefined}
            ref={closeRef}
            disabled={props.busy}
            onClick={props.onClose}
          >
            <X size={16} />
          </MuteButton>
        </div>
      </div>
      {suggestion ? (
        <div className="relative flex min-h-0 max-h-[min(300px,38dvh)] flex-col">
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain py-4 [overflow-wrap:anywhere]">
            {props.body}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-linear-to-b from-white/50 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-linear-to-t from-white/50 to-transparent"
          />
        </div>
      ) : props.body ? (
        <div className="min-h-0 max-h-[min(300px,38dvh)] overflow-y-auto overscroll-contain whitespace-pre-wrap py-4 [overflow-wrap:anywhere]">
          {props.body}
        </div>
      ) : null}
      {props.actions}
      <form
        className="mt-2 flex shrink-0 items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          key={props.inputKey}
          unstyled
          autoResize
          rows={1}
          className="min-h-8 max-h-24 flex-1 resize-none bg-transparent outline-none focus:ring-0 focus:shadow-none focus:bg-transparent py-1 text-[16px] leading-[inherit] md:text-[length:inherit]"
          value={props.value}
          disabled={props.busy}
          aria-label={
            props.inputLabel ?? t("career.prep.answerInput", "답변 입력")
          }
          placeholder={
            props.inputLabel ?? t("career.prep.answerInput", "답변 입력")
          }
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return;
            event.preventDefault();
            if (!event.repeat) submit();
          }}
        />
        {props.value.trim() && (
          <MuteButton
            type="submit"
            variant="primary"
            className={suggestion ? "size-8 rounded-full p-0" : undefined}
            disabled={props.busy}
            aria-label={t("career.prep.saveNext", "답변 저장 후 다음")}
          >
            <ArrowUp size={16} />
          </MuteButton>
        )}
        <MuteButton type="button" disabled={props.busy} onClick={props.onSkip}>
          {t("career.prep.skip", "건너뛰기")}
        </MuteButton>
      </form>
      {props.error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {props.error}
        </p>
      )}
      {props.children}
    </ChatComposerSurface>
  );
}

export function PreparationEditableText(props: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const t = useCareerT();
  return (
    <Textarea
      unstyled
      autoResize
      rows={1}
      readOnly={props.busy}
      value={props.value}
      aria-label={t("career.application.suggestions.edit", "제안 문구 수정")}
      placeholder={t("career.application.suggestions.deleted", "이 문구 삭제")}
      className="block w-full resize-none border-0 bg-transparent px-2 py-1.5 -mx-2 text-left text-[16px] font-[inherit] leading-[inherit] text-[color:inherit] whitespace-pre-wrap break-words outline-none shadow-none placeholder:text-[color:inherit] focus:bg-transparent focus:outline-none focus:ring-0 focus:shadow-none md:text-[length:inherit]"
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function PreparationChangeEdit(props: {
  target?: string;
  originalText?: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const t = useCareerT();
  return (
    <div className="space-y-1.5 border-t border-neutral-1000-a05 pt-2">
      {props.target && (
        <p className="text-xs text-neutral-muted">{props.target}</p>
      )}
      {props.originalText && (
        <>
          <p className="text-xs text-neutral-muted">
            {t("career.prep.original", "원문")}
          </p>
          <del className="block whitespace-pre-wrap text-critical">
            {props.originalText}
          </del>
        </>
      )}
      <p className="text-xs text-neutral-muted">
        {t("career.prep.example", "수정 예시")}
      </p>
      <div className="text-neutral-primary">
        <PreparationEditableText
          value={props.value}
          busy={props.busy}
          onChange={props.onChange}
        />
      </div>
    </div>
  );
}

type DecisionAction = {
  id: string;
  label: string;
  selected?: boolean;
  onClick: () => void;
};
export function PreparationDecisionActions(props: {
  positive?: DecisionAction;
  negative?: DecisionAction;
  busy: boolean;
}) {
  return (
    <div className="grid auto-rows-fr grid-cols-2 shrink-0 gap-2 bg-linear-to-t from-white to-transparent">
      {[props.negative, props.positive].map((action) =>
        action ? (
          <MuteButton
            key={action.id}
            className={cn(
              action === props.positive
                ? "bg-neutral-primary text-white hover:bg-neutral-primary/80"
                : "text-red-600",
              action.selected ? "bg-action text-white hover:bg-action/80" : "",
              "rounded-full"
            )}
            aria-pressed={action.selected === true}
            disabled={props.busy}
            onClick={action.onClick}
          >
            {action.label}
          </MuteButton>
        ) : null
      )}
    </div>
  );
}

export function PreparationOptionList(props: {
  options: { id: string; label: string; description?: string }[];
  selectedIds?: string[];
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid auto-rows-fr max-h-[min(144px,20dvh)] shrink-0 gap-1 overflow-y-auto">
      {props.options.map((option, index) => (
        <CardButton
          key={option.id}
          disabled={props.busy}
          className="flex w-full items-center justify-start gap-2 rounded-xl min-h-10 sm:min-h-9 px-2 py-1 text-left text-[length:inherit] text-sm font-normal leading-[inherit]"
          selected={props.selectedIds?.includes(option.id)}
          onClick={() => props.onSelect(option.id)}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black text-xs text-white">
            {index + 1}
          </span>
          <span>
            {option.label}
            {option.description ? `: ${option.description}` : ""}
          </span>
        </CardButton>
      ))}
    </div>
  );
}
