import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { MuteButton } from "@/components/ui/button";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import { useCareerT } from "@/i18n/useCareerT";
import {
  careerFormValueSchema,
  careerSuggestionAnswerSchema,
  getCareerSuggestionAnswers,
  type CareerSuggestionAnswer,
  getCareerFormContent,
  getCareerFormInitialValues,
  type CareerForm,
  type CareerFormItem,
  type CareerFormAction,
  type CareerFormResponse,
  type CareerFormValue,
} from "@/lib/career/forms/schema";
import { QuestionComposer } from "./QuestionComposer";
import {
  PreparationComposerView,
  PreparationChangeEdit,
  PreparationDecisionActions,
  PreparationOptionList,
} from "./PreparationComposerView";
import { FileText, Info, MessageCircleDashed } from "lucide-react";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";
import {
  useCareerFormController,
  CareerFormField,
  careerFormOptions,
  type CareerFormSubmission,
} from "./CareerFormCard";
import { PreviewUI } from "./elements/DocumentPreviewCards";

const formKey = (form: CareerForm) => `${form.formId}:${form.revision}`;
function isAnswered(
  form: CareerForm,
  responses: Pick<CareerFormResponse, "formId" | "revision" | "itemId">[]
) {
  const matching = responses.filter(
    (r) => r.formId === form.formId && r.revision === form.revision
  );
  return (
    matching.some((r) => !r.itemId) ||
    form.items.every((item) => matching.some((r) => r.itemId === item.id))
  );
}
const SuggestionContext = createContext<{
  active?: CareerForm;
  open: (form: CareerForm) => void;
  close: (form: CareerForm) => void;
} | null>(null);

export function CareerSuggestionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { messages, conversationId } = useCareerChatPanelContext();
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const lastUser = messages[lastUserIndex];
  const userMessageKey = lastUser?.clientRequestId ?? lastUser?.id;
  const [selected, setSelected] = useState<{
    form: CareerForm;
    conversationId: typeof conversationId;
    userMessageKey: typeof userMessageKey;
  }>();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const forms = useMemo(() => {
    const latest = new Map<number, CareerForm>();
    for (const message of messages) {
      const form = message.careerForm;
      if (
        form &&
        (!latest.has(form.formId) ||
          latest.get(form.formId)!.revision <= form.revision)
      )
        latest.set(form.formId, form);
    }
    return [...latest.values()].filter(
      (form) => form.kind === "suggestion" && !form.hidden
    );
  }, [messages]);
  const responses = messages.flatMap((m) =>
    m.formResponse ? [m.formResponse] : []
  );
  // A reply can contain prose and several form presentation messages. Only the
  // current assistant turn may open automatically; older turns remain in history.
  const currentForms = new Set(
    messages.slice(lastUserIndex + 1).flatMap((message) =>
      message.role === "assistant" && message.careerForm
        ? [formKey(message.careerForm)]
        : []
    )
  );
  const selectionIsCurrent = selected?.conversationId === conversationId &&
    selected?.userMessageKey === userMessageKey;
  if (selected && !selectionIsCurrent) setSelected(undefined);
  const active =
    (selectionIsCurrent && selected &&
    forms.some((form) => formKey(form) === formKey(selected.form))
      ? selected.form
      : undefined) ??
    forms.find(
      (form) => currentForms.has(formKey(form)) &&
        !closed.has(formKey(form)) && !isAnswered(form, responses)
    );
  const open = useCallback((form: CareerForm) => {
    setClosed((current) => {
      const next = new Set(current);
      next.delete(formKey(form));
      return next;
    });
    setSelected({ form, conversationId, userMessageKey });
  }, [conversationId, userMessageKey]);
  const close = useCallback((form: CareerForm) => {
    setClosed((current) => new Set(current).add(formKey(form)));
    setSelected(undefined);
  }, []);
  const value = useMemo(() => ({ active, open, close }), [active, open, close]);
  return <SuggestionContext.Provider value={value}>{children}</SuggestionContext.Provider>;
}

export function CareerSuggestionHistory({ form }: { form: CareerForm }) {
  const context = useContext(SuggestionContext);
  if (form.hidden) return null;
  return (
    <PreviewUI
      onClick={() => context?.open(form)}
      icon={<MessageCircleDashed className="h-5 w-5 text-black/40" />}
      title={form.title ?? form.items.map((item) => item.label).join(" · ")}
      description={form.items.map((item) => item.label).join(" · ")}
    />
  );
}

export function CareerSuggestionComposerSlot({
  children,
}: {
  children: ReactNode;
}) {
  const context = useContext(SuggestionContext);
  const form = context?.active;
  if (!context || !form) return children;
  return (
    <SuggestionComposer
      key={formKey(form)}
      form={form}
      onClose={() => context.close(form)}
    />
  );
}

const isFormValue = (value: unknown): value is CareerFormValue =>
  careerFormValueSchema.safeParse(value).success;
const isSuggestionAnswer = (value: unknown): value is CareerSuggestionAnswer =>
  careerSuggestionAnswerSchema.safeParse(value).success;

function SuggestionComposer({
  form,
  onClose,
}: {
  form: CareerForm;
  onClose: () => void;
}) {
  const { responses, disabled, pending, respond, error } =
    useCareerFormController(form);
  const { user, conversationId } = useCareerChatPanelContext();
  const scope = `harper-suggestion:v1:${user?.id}:${conversationId}:${formKey(form)}`;
  const [drafts, setDrafts, clearDrafts] =
    useApplicationComposerDraft<CareerFormValue>(scope, isFormValue);
  const [localAnswers, setLocalAnswers, clearAnswers] =
    useApplicationComposerDraft<CareerSuggestionAnswer>(
      `${scope}:answers`,
      isSuggestionAnswer
    );
  const requestIdentity = useRef<{
    signature: string;
    requestId: string;
  } | null>(null);
  const submitting = useRef(false);
  const answers = {
    ...getCareerSuggestionAnswers(form, responses),
    ...localAnswers,
  };
  for (const field of form.items)
    if (drafts[`dirty:${field.id}`] === true) delete answers[field.id];
  const item =
    form.items.find((field) => field.id === drafts.currentItemId) ??
    form.items.find((field) => !answers[field.id]) ??
    form.items[0];
  const index = form.items.findIndex((field) => field.id === item?.id);
  const values = getCareerFormInitialValues(form);
  for (const answer of Object.values(answers))
    Object.assign(values, answer.values);
  for (const field of form.items) {
    const value = drafts[`value:${field.id}`];
    if (value !== undefined) values[field.id] = value;
  }
  if (!item) return null;
  const saved = answers[item.id];
  const isText = item.type === "text" || item.type === "textarea";
  const reply =
    drafts[`reply:${item.id}`] ??
    (saved?.skipped ? "" : saved?.message) ??
    (isText ? values[item.id] : "");
  const text = typeof reply === "string" ? reply : "";
  if (isText) values[item.id] = text;
  const answer = async (submission: CareerFormSubmission) => {
    if (submitting.current) return;
    const result: CareerSuggestionAnswer = {
      itemId: item.id,
      actionId: submission.actionId,
      message: submission.message,
      skipped: submission.skipped,
      values: submission.values,
    };
    const nextAnswers = { ...answers, [item.id]: result };
    setLocalAnswers((current) => ({ ...current, [item.id]: result }));
    const next = form.items.find((field) => !nextAnswers[field.id]);
    setDrafts((current) => ({
      ...current,
      [`dirty:${item.id}`]: false,
      currentItemId: next?.id ?? item.id,
    }));
    if (next) return;
    const batch: CareerFormSubmission = {
      values: {},
      answers: form.items.map((field) => nextAnswers[field.id]),
    };
    const signature = JSON.stringify(batch);
    const previous =
      requestIdentity.current ??
      (typeof drafts.batchSignature === "string" &&
      typeof drafts.batchRequestId === "string"
        ? { signature: drafts.batchSignature, requestId: drafts.batchRequestId }
        : null);
    const identity =
      previous?.signature === signature
        ? previous
        : { signature, requestId: crypto.randomUUID() };
    requestIdentity.current = identity;
    setDrafts((current) => ({
      ...current,
      batchSignature: signature,
      batchRequestId: identity.requestId,
    }));
    submitting.current = true;
    try {
      if (!(await respond(batch, identity.requestId))) return;
      clearAnswers();
      clearDrafts();
      onClose();
    } finally {
      submitting.current = false;
    }
  };
  const edit = (key: string, value: CareerFormValue) => {
    setDrafts((current) => ({
      ...current,
      [key]: value,
      [`dirty:${item.id}`]: true,
    }));
  };
  return (
    <CareerSuggestionItemView
      form={form}
      item={item}
      index={index}
      values={values}
      text={text}
      busy={disabled}
      error={error}
      selectedActionId={saved?.actionId}
      onChangeText={(value) => edit(`reply:${item.id}`, value)}
      onChangeValue={(id, value) => edit(`value:${id}`, value)}
      onNavigate={(offset) => {
        if (!pending && form.items[index + offset])
          setDrafts((current) => ({
            ...current,
            currentItemId: form.items[index + offset].id,
          }));
      }}
      onRespond={answer}
      onClose={onClose}
    />
  );
}

/** Uses the actual Apply with Harper item renderer, with saved-form callbacks. */
export function CareerSuggestionItemView(props: {
  form: CareerForm;
  item: CareerFormItem;
  index: number;
  values: Record<string, CareerFormValue>;
  text: string;
  busy: boolean;
  error?: string;
  selectedActionId?: string;
  onChangeText: (value: string) => void;
  onChangeValue: (id: string, value: CareerFormValue) => void;
  onNavigate: (offset: number) => void;
  onRespond: (submission: CareerFormSubmission) => Promise<void>;
  onClose: () => void;
}) {
  const t = useCareerT();
  const { form, item, values, busy, onRespond } = props;
  const content = getCareerFormContent(item);
  const description =
    item.description ??
    (typeof content.description === "string" ? content.description : undefined);
  const reason =
    typeof content.reason === "string" ? content.reason : undefined;
  const isText = item.type === "text" || item.type === "textarea";
  const isProposal = item.type === "change";
  const action = (value?: CareerFormAction) =>
    value
      ? {
          id: value.id,
          label: value.label,
          selected: props.selectedActionId === value.id,
          onClick: () =>
            void onRespond({
              itemId: item.id,
              actionId: value.id,
              values: Object.hasOwn(values, item.id)
                ? { [item.id]: values[item.id] }
                : {},
            }),
        }
      : undefined;
  const proposalActions = isProposal ? (
    <PreparationDecisionActions
      busy={busy}
      positive={
        action(item.positive) ?? {
          id: "accept",
          label: t("career.application.suggestions.accept", "적용"),
          onClick: () =>
            void onRespond({
              itemId: item.id,
              message: t("career.application.suggestions.accept", "적용"),
              values: Object.hasOwn(values, item.id)
                ? { [item.id]: values[item.id] }
                : {},
            }),
        }
      }
      negative={
        action(item.negative) ?? {
          id: "ignore",
          label: t("career.application.suggestions.ignore", "적용하지 않기"),
          onClick: () =>
            void onRespond({
              itemId: item.id,
              message: t(
                "career.application.suggestions.ignore",
                "적용하지 않기"
              ),
              values: {},
            }),
        }
      }
    />
  ) : null;
  const explanation = (
    <>
      {description ? (
        <p className="whitespace-pre-wrap">{description}</p>
      ) : null}
      {reason && (isText || !description) ? (
        <p className="whitespace-pre-wrap">{reason}</p>
      ) : null}
    </>
  );
  const body = (
    <>
      {explanation}
      {item.type === "change" ? (
        <PreparationChangeEdit
          target={
            typeof content.target === "string" ? content.target : undefined
          }
          originalText={
            typeof content.originalText === "string"
              ? content.originalText
              : undefined
          }
          value={
            typeof values[item.id] === "string"
              ? (values[item.id] as string)
              : ""
          }
          busy={busy}
          onChange={(value) => props.onChangeValue(item.id, value)}
        />
      ) : !isText && item.type !== "select" ? (
        <>
          <label
            className="sr-only"
            htmlFor={`career-form-${form.formId}-${form.revision}-${item.id}`}
          >
            {item.label}
          </label>
          <CareerFormField
            item={item}
            id={`career-form-${form.formId}-${form.revision}-${item.id}`}
            value={values[item.id]}
            disabled={busy}
            onChange={(value) => props.onChangeValue(item.id, value)}
          />
        </>
      ) : null}
    </>
  );
  const choices =
    item.type === "select" ? (
      <PreparationOptionList
        options={careerFormOptions(item)}
        selectedIds={
          typeof values[item.id] === "string" ? [values[item.id] as string] : []
        }
        busy={busy}
        onSelect={(id) => {
          props.onChangeValue(item.id, id);
          const option = careerFormOptions(item).find(
            (option) => option.id === id
          );
          if (option)
            void onRespond({
              itemId: item.id,
              message: option.label,
              values: { [item.id]: id },
            });
        }}
      />
    ) : null;
  const actions =
    proposalActions || choices ? (
      <>
        {choices}
        {proposalActions}
      </>
    ) : undefined;
  const shared = {
    itemId: item.id,
    title: item.label,
    index: props.index,
    count: form.items.length,
    value: props.text,
    busy,
    error: props.error,
    closeLabel: t("career.internal_call.answers.close", "닫기"),
    onClose: props.onClose,
    onChange: props.onChangeText,
    onNavigate: props.onNavigate,
    onAnswer: () =>
      void onRespond({ itemId: item.id, message: props.text, values: {} }),
    onSkip: () =>
      void onRespond({
        itemId: item.id,
        skipped: true,
        message: t("career.prep.skip", "건너뛰기"),
        values: {},
      }),
    actions,
  };
  if (isText)
    return (
      <QuestionComposer
        {...shared}
        question={description || reason ? explanation : undefined}
      />
    );
  return (
    <PreparationComposerView
      {...shared}
      variant="suggestion"
      inputLabel={t("career.prep.directInput", "하퍼에게 직접 말하기…")}
      body={body}
      titleAside={
        reason && description ? (
          <ResponsiveLightTooltip
            className="w-auto shrink-0"
            mobileAriaLabel={t("career.simulation.basis", "판단 근거")}
            triggerClassName="shrink-0"
            trigger={
              <Info
                size={16}
                aria-label={t("career.simulation.basis", "판단 근거")}
              />
            }
          >
            {reason}
          </ResponsiveLightTooltip>
        ) : undefined
      }
    />
  );
}
