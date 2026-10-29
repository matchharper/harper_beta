import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FilePenLine } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import type {
  InternalCallAnswer,
  InternalCallQuestionForm,
} from "@/lib/career/internalCallAnswers";
import { QuestionComposer } from "./QuestionComposer";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";

const Context = createContext<{
  open?: (callId: string) => Promise<void>;
  call: InternalCallQuestionForm | null;
  completed: Set<string>;
  loadingId: string | null;
  error: string;
  close: () => void;
  save?: (responses: InternalCallAnswer[]) => Promise<boolean>;
  submitting: boolean;
}>({
  call: null,
  completed: new Set(),
  loadingId: null,
  error: "",
  close: () => {},
  submitting: false,
});
export const useInternalCallAnswers = () => useContext(Context);

export function InternalCallAnswersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { conversationId, onSendChatMessage } = useCareerChatPanelContext();
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const t = useCareerT();
  const [call, setCall] = useState<InternalCallQuestionForm | null>(null);
  const [completed, setCompleted] = useState(new Set<string>());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const current = useRef(0);
  const open = async (callId: string) => {
    if (lock.current || !conversationId) return;
    const request = ++current.current;
    setLoadingId(callId);
    setError("");
    try {
      const response = await fetchWithAuth(
        `/api/talent/opportunities/internal-call-answers?callId=${encodeURIComponent(callId)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (request !== current.current) return;
      if (
        data.call.replyCompleted ||
        (!data.call.submitted && data.call.status === "completed")
      )
        setCompleted((prev) => new Set(prev).add(callId));
      else setCall(data.call);
    } catch {
      if (request === current.current)
        setError(
          t(
            "career.internal_call.answers.load_error",
            "질문을 불러오지 못했어요. 다시 시도해 주세요."
          )
        );
    } finally {
      if (request === current.current) setLoadingId(null);
    }
  };
  const save = async (responses: InternalCallAnswer[]) => {
    if (!call || !conversationId || lock.current) return false;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      let succeeded = false;
      await onSendChatMessage({
        text: "",
        internalCallAnswerSubmission: {
          callId: call.id,
          questions: call.questions,
          responses,
        },
        onSuccess: () => {
          succeeded = true;
        },
      });
      if (!succeeded) throw new Error("Chat submission did not complete");
      setCompleted((prev) => new Set(prev).add(call.id));
      setCall(null);
      void queryClient.invalidateQueries({ queryKey: ["career-session"] });
      void queryClient.invalidateQueries({
        queryKey: ["career-pending-actions"],
      });
      return true;
    } catch {
      setError(
        t(
          "career.prep.error",
          "처리하지 못했어요. 입력은 유지됩니다. 상태를 확인한 뒤 다시 시도해 주세요."
        )
      );
      return false;
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Context.Provider
      value={{
        call,
        completed,
        loadingId,
        error,
        open,
        save,
        submitting,
        close: () => {
          if (!lock.current) {
            ++current.current;
            setCall(null);
            setError("");
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function InternalCallWriteButton({
  callId,
  disabled,
}: {
  callId: string;
  disabled?: boolean;
}) {
  const ctx = useInternalCallAnswers();
  const t = useCareerT();
  return (
    <div className="min-w-0 flex-1">
      <MuteButton
        className="h-9 w-full text-sm"
        disabled={
          disabled ||
          !ctx.open ||
          ctx.submitting ||
          ctx.loadingId !== null ||
          ctx.completed.has(callId)
        }
        onClick={() => void ctx.open?.(callId)}
      >
        <FilePenLine size={14} />
        {ctx.completed.has(callId)
          ? t("career.internal_call.answers.completed", "답변 완료")
          : t("career.internal_call.answers.write", "작성하기")}
      </MuteButton>
      {!ctx.call && ctx.error && (
        <p role="alert" className="mt-2 text-xs text-critical">
          {ctx.error}
        </p>
      )}
    </div>
  );
}

export function InternalCallAnswersSlot({ children }: { children: ReactNode }) {
  const ctx = useInternalCallAnswers();
  return ctx.call ? (
    <InternalCallQuestionComposer key={ctx.call.id} call={ctx.call} />
  ) : (
    <>{children}</>
  );
}

function InternalCallQuestionComposer({
  call,
}: {
  call: InternalCallQuestionForm;
}) {
  const ctx = useInternalCallAnswers();
  const t = useCareerT();
  const [draft, setDraft, clear] = useApplicationComposerDraft(
    `harper-internal-call-answers:${call.id}`
  );
  const decision = (i: number) =>
    draft[`decision:${i}`] ??
    (typeof call.questionAnswers?.[String(i + 1)] === "string"
      ? "answer"
      : undefined);
  const answerText = (i: number) =>
    draft[`text:${i}`] ?? call.questionAnswers?.[String(i + 1)] ?? "";
  const [index, setIndex] = useState(() => {
    const next = call.questions.findIndex((_, i) => !decision(i));
    return next < 0 ? call.questions.length : next;
  });
  const responses = call.questions.flatMap((_, i): InternalCallAnswer[] =>
    decision(i) === "skip"
      ? [{ questionIndex: i, decision: "skip" }]
      : decision(i) === "answer"
        ? [
            {
              questionIndex: i,
              decision: "answer",
              text: answerText(i),
            },
          ]
        : []
  );
  const answer = (choice: "answer" | "skip") => {
    setDraft((prev) => ({ ...prev, [`decision:${index}`]: choice }));
    const next = call.questions.findIndex((_, i) => i > index && !decision(i));
    const previous = call.questions.findIndex(
      (_, i) => i !== index && !decision(i)
    );
    setIndex(
      next >= 0 ? next : previous >= 0 ? previous : call.questions.length
    );
  };
  if (index >= call.questions.length)
    return (
      <ChatComposerSurface className="p-3 md:p-4">
        <div className="max-h-[min(420px,55dvh)] space-y-4 overflow-y-auto">
          {responses.map((response) => (
            <div key={response.questionIndex}>
              <p className="text-sm font-medium">
                {call.questions[response.questionIndex]}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-muted">
                {response.decision === "answer"
                  ? response.text
                  : t("career.application.questions.skipped", "건너뜀")}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <MuteButton disabled={ctx.submitting} onClick={ctx.close}>
            {t("career.internal_call.answers.close", "닫기")}
          </MuteButton>
          {call.questions.length > 0 && (
            <MuteButton disabled={ctx.submitting} onClick={() => setIndex(0)}>
              {t("career.internal_call.answers.edit", "답변 수정")}
            </MuteButton>
          )}
          <MuteButton
            variant="primary"
            disabled={ctx.submitting}
            onClick={() =>
              void ctx.save?.(responses).then((ok) => {
                if (ok) clear();
              })
            }
          >
            {t("career.internal_call.answers.submit", "제출하기")}
          </MuteButton>
        </div>
        {ctx.error && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {ctx.error}
          </p>
        )}
      </ChatComposerSurface>
    );
  return (
    <QuestionComposer
      title={`${call.companyName} · ${call.roleTitle}`}
      question={call.questions[index]}
      index={index}
      count={call.questions.length}
      value={answerText(index)}
      busy={ctx.submitting}
      error={ctx.error}
      closeLabel={t("career.internal_call.answers.close", "닫기")}
      onClose={ctx.close}
      onNavigate={(offset) => setIndex((i) => i + offset)}
      onChange={(value) =>
        setDraft((prev) => ({
          ...prev,
          [`text:${index}`]: value,
          [`decision:${index}`]: "",
        }))
      }
      onAnswer={() => answer("answer")}
      onSkip={() => answer("skip")}
    />
  );
}
