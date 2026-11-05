import { useCareerOpenForms } from "@/hooks/career/useCareerOpenForms";
import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useId,
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
  CareerFormCard,
  careerFormOptions,
  type CareerFormSubmission,
} from "./CareerFormCard";
import { PreviewUI } from "./elements/DocumentPreviewCards";

const formKey = (form: CareerForm) => `${form.formId}:${form.revision}`;
const SuggestionContext = createContext<{
  active?: CareerForm;
  pending: CareerForm[];
  unavailable: boolean;
  retry: () => void;
  open: (form?: CareerForm) => void;
  close: (form: CareerForm) => void;
} | null>(null);

export function CareerSuggestionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { conversationId } = useCareerChatPanelContext();
  const query = useCareerOpenForms(conversationId);
  const [selected, setSelected] = useState<{
    conversationId: typeof conversationId;
    form: CareerForm;
    isOpen: boolean;
  }>();
  const pending = query.data?.forms ?? [];
  // Revisions and resolutions can arrive through chat or another device.
  const active =
    selected?.isOpen && selected.conversationId === conversationId
      ? (pending.find((form) => form.formId === selected.form.formId) ??
        (query.data ? pending[0] : selected.form))
      : undefined;
  if (selected && query.data && pending.length === 0) setSelected(undefined);
  const open = (form?: CareerForm) =>
    setSelected((current) => {
      const next =
        form ??
        (current?.conversationId === conversationId
          ? pending.find((item) => item.formId === current.form.formId)
          : undefined) ??
        pending[0];
      return next ? { conversationId, form: next, isOpen: true } : undefined;
    });
  const close = useCallback(
    (form: CareerForm) =>
      setSelected((current) =>
        current ? { ...current, form, isOpen: false } : current,
      ),
    [],
  );
  return (
    <SuggestionContext.Provider
      value={{
        active,
        pending,
        unavailable: query.isError,
        retry: () => {
          void query.refetch();
        },
        open,
        close,
      }}
    >
      {children}
    </SuggestionContext.Provider>
  );
}

export function CareerSuggestionHistory({ form }: { form: CareerForm }) {
  const context = useContext(SuggestionContext);
  if (form.hidden) return null;
  return (
    <PreviewUI
      onClick={() => context?.open(form)}
      icon={<MessageCircleDashed className="h-5 w-5 text-neutral-primary/40" />}
      title={form.title ?? form.items.map((item) => item.label).join(" · ")}
      description={form.items.map((item) => item.label).join(" · ")}
    />
  );
}

export function CareerSuggestionComposerSlot({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  const context = useContext(SuggestionContext);
  const t = useCareerT();
  const form = context?.active;
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    if (form) context?.close(form);
    triggerRef.current?.focus();
  };
  return (
    <>
      <div
        id={panelId}
        hidden={!form}
        className="career-response-scroll"
      >
        {form ? (
          form.kind === "suggestion" ? (
            <SuggestionComposer
              key={formKey(form)}
              form={form}
              onClose={close}
            />
          ) : (
            <CareerFormCard key={formKey(form)} form={form} />
          )
        ) : null}
      </div>
      {actions ||
      (context && (context.pending.length > 0 || context.unavailable)) ? (
        <div className="flex min-w-0 items-center gap-2 px-2 pb-2">
          {context && context.pending.length > 0 ? (
            <div className="flex shrink-0 items-center gap-2">
              <MuteButton
                ref={triggerRef}
                size="sm"
                variant={form ? "dark" : "default"}
                className={form ? "bg-surface-inverse text-on-inverse" : undefined}
                aria-expanded={Boolean(form)}
                aria-controls={panelId}
                onClick={() => (form ? close() : context.open())}
              >
                {t("career.forms.openCount", "답변 대기 {count}개", {
                  values: { count: context.pending.length },
                })}
              </MuteButton>
              {form && context.pending.length > 1 ? (
                <MuteButton
                  size="sm"
                  variant="transparent"
                  onClick={() => {
                    const index = context.pending.findIndex(
                      (item) => item.formId === form.formId,
                    );
                    context.open(
                      context.pending[(index + 1) % context.pending.length],
                    );
                  }}
                >
                  {t("career.forms.next", "다음")}
                </MuteButton>
              ) : null}
              {form ? (
                <MuteButton size="sm" variant="transparent" onClick={close}>
                  {t("career.forms.close", "닫기")}
                </MuteButton>
              ) : null}
            </div>
          ) : null}
          {actions || context?.unavailable ? (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&>*]:shrink-0">
              {context?.unavailable ? (
                <MuteButton size="sm" onClick={context.retry}>
                  {t("career.forms.retryStatus", "답변 대기 다시 불러오기")}
                </MuteButton>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
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
    const batch: CareerFormSubmission = { values: {}, answers: [result] };
    const signature = JSON.stringify(batch);
    const previous = requestIdentity.current ?? (typeof drafts.responseSignature === "string" && typeof drafts.responseRequestId === "string"
      ? { signature: drafts.responseSignature, requestId: drafts.responseRequestId } : undefined);
    const identity = previous?.signature === signature ? previous : { signature, requestId: crypto.randomUUID() };
    requestIdentity.current = identity;
    setDrafts(current => ({ ...current, responseSignature: signature, responseRequestId: identity.requestId }));
    submitting.current = true;
    try {
      if (!(await respond(batch, identity.requestId))) return;
      const nextAnswers = { ...answers, [item.id]: result };
      setLocalAnswers(current => ({ ...current, [item.id]: result }));
      const next = form.items.find(field => !nextAnswers[field.id]);
      setDrafts(current => ({ ...current, [`dirty:${item.id}`]: false, currentItemId: next?.id ?? item.id }));
      if (!next) { clearAnswers(); clearDrafts(); }
    } finally { submitting.current = false; }
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
