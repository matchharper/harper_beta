import type { ReactNode } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";

/** The same one-question input for application preparation and Role follow-ups. */
export function QuestionComposer(props: {
  title: ReactNode;
  question?: ReactNode;
  index: number;
  count: number;
  value: string;
  busy: boolean;
  error?: string;
  closeLabel: string;
  onChange: (value: string) => void;
  onNavigate: (offset: number) => void;
  onAnswer: () => void;
  onSkip: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useCareerT();
  const submit = () => {
    if (props.value.trim() && !props.busy) props.onAnswer();
  };
  return (
    <ChatComposerSurface
      data-preparation-questions=""
      aria-busy={props.busy}
      style={careerTimelineTypographyStyle}
      className={`flex max-h-[min(540px,70dvh)] flex-col p-3 md:p-4 ${careerTimelineMessageTextClassName}`}
    >
      <div className="grid shrink-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <strong className="row-start-2 min-w-0 break-words text-inherit font-medium sm:row-start-1">
          {props.title}
        </strong>
        <div className="row-start-1 flex items-center justify-between gap-2 text-xs text-neutral-muted sm:col-start-2 sm:justify-end">
          <div className="flex items-center gap-1">
            <MuteButton
              variant="transparent"
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
            disabled={props.busy}
            onClick={props.onClose}
          >
            <X size={16} />
          </MuteButton>
        </div>
      </div>
      {props.question && (
        <div className="min-h-0 max-h-[min(300px,38dvh)] overflow-y-auto overscroll-contain whitespace-pre-wrap py-4 [overflow-wrap:anywhere]">
          {props.question}
        </div>
      )}
      <form
        className="mt-2 flex shrink-0 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          unstyled
          autoResize
          rows={1}
          className="min-h-8 max-h-24 flex-1 resize-none bg-transparent outline-none focus:ring-0 focus:shadow-none focus:bg-transparent py-1 text-[16px] leading-[inherit] md:text-[length:inherit]"
          value={props.value}
          disabled={props.busy}
          aria-label={t("career.prep.answerInput", "답변 입력")}
          placeholder={t("career.prep.answerInput", "답변 입력")}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key !== "Enter" ||
              e.shiftKey ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return;
            e.preventDefault();
            if (!e.repeat) submit();
          }}
        />
        {props.value.trim() && (
          <MuteButton
            type="submit"
            variant="primary"
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
