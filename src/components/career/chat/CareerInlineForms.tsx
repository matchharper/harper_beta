import { useCallback, useId, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useCareerFormReference } from "./CareerFormReferenceProvider";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Radio } from "@/components/ui/radio";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";
import { useCareerT } from "@/i18n/useCareerT";
import { CareerFormCheckboxRow, CareerFormField, isCareerFormCheckbox } from "./CareerFormCard";
import { CareerChecklistRows } from "./CareerChecklistRows";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";
import { formatCareerDocumentLink } from "@/lib/career/documentLinks";
import type { CareerFormErrorCode } from "@/lib/career/forms/responseError";
import { emptyRequiredItems, getCareerFormContent, getCareerFormInitialValues, getCareerSuggestionAnswers, isCareerActionChecklist, parseCareerForm, parseCareerFormResponse, type CareerForm, type CareerFormValue, type CareerFormResponse } from "@/lib/career/forms/schema";

type FormEntry = { form: CareerForm; responses: CareerFormResponse[] };
// The server says why it did not save an answer with a code only; its own text never reaches the screen.
type Refusal = { code: CareerFormErrorCode; retryable: boolean };
// `refusal` is absent when the connection failed. `repeats` counts the same answers failing the same way in a row.
type Failure = { key: string; repeats: number; refusal?: Refusal; forms: CareerForm[]; values: Record<string, CareerFormValue>[] };
const formKey = (conversationId: string | undefined, formId: number) => ["career-form-references", conversationId, formId] as const;

type Draft = { form: CareerForm; values: Record<string, CareerFormValue>; actionId?: string };
const isDraft = (value: unknown): value is Draft => Boolean(value && typeof value === "object" &&
  parseCareerForm((value as Draft).form) && (value as Draft).values && typeof (value as Draft).values === "object");

/**
 * The action "모두 승인" sends for a form: its own approval, unless the person already chose to decline it. A form
 * without an approval keeps the person's own choice.
 */
export function approvedAction(form: CareerForm, chosen?: string) {
  if (chosen && chosen === form.negative?.id) return chosen;
  return form.positive?.id ?? chosen;
}

/** A reference reads existing forms. It never creates, reopens or submits one. */
export function CareerInlineForms({ formIds, grouped = false, origin, onOriginChange }: {
  formIds: number[];
  grouped?: boolean;
  origin?: { conversationId: string; revision: number };
  onOriginChange?: () => void;
}) {
  const context = useOptionalCareerChatPanelContext();
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const client = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(!grouped);
  const reveal = useCallback(() => setOpen(true), []);
  const { ref: formReferenceRef, owns: ownsForm, reveal: revealForm } = useCareerFormReference(formIds, reveal);
  const ownedIds = formIds.filter(ownsForm);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const lastFailure = useRef<{ key: string; repeats: number } | undefined>(undefined);
  const [notified, setNotified] = useState<string>();
  const [notifying, setNotifying] = useState(false);
  const notifyLock = useRef(false);
  // Approving with required answers empty: the first press names them, the next press with the same answers sends.
  const [emptyRequiredNotice, setEmptyRequiredNotice] = useState<{ signature: string; labels: string[] } | null>(null);
  const lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | undefined>(undefined);
  const carousel = useRef<HTMLDivElement>(null);
  const conversationId = origin?.conversationId ?? context?.conversationId ?? undefined;
  const [drafts, setDrafts] = useApplicationComposerDraft<Draft>(
    `career-inline-forms:${context?.user?.id}:${conversationId}`, isDraft);
  const queries = useQueries({ queries: formIds.map(formId => ({
    queryKey: formKey(conversationId, formId),
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<FormEntry> => {
      const result = await fetchWithAuth(`/api/talent/forms?conversationId=${encodeURIComponent(conversationId!)}&formId=${formId}`);
      if (!result.ok) throw new Error("Form unavailable");
      const data = await result.json();
      const form = parseCareerForm(data.form);
      if (!form || form.formId !== formId) throw new Error("Form unavailable");
      const responses = (Array.isArray(data.responses) ? data.responses : [])
        .flatMap((entry: { response?: unknown }) => {
          const response = parseCareerFormResponse(entry.response);
          return response?.formId === formId ? [response] : [];
        });
      return { form, responses };
    },
    refetchOnWindowFocus: true,
    refetchInterval: open ? 5000 : false,
  })) });
  const allEntries = queries.flatMap(query => query.data ? [query.data] : []);
  // A new revision can move this review to a different opportunity.
  const originChanged = Boolean(origin && allEntries.some(entry => entry.form.revision !== origin.revision));
  const entries = allEntries.filter(entry => ownsForm(entry.form.formId) && !originChanged);
  const latest = entries.map(entry => entry.form);
  // A saved answer is authoritative, even when another reference still has a draft.
  const shown = latest.map(form => form.state === "open" && !isCareerActionChecklist(form) ? drafts[form.formId]?.form ?? form : form);
  const editable = latest.filter(form => form.state === "open" && !form.hidden && !isCareerActionChecklist(form));
  const changed = editable.some(form => drafts[form.formId] && drafts[form.formId].form.revision !== form.revision);
  const unavailable = !conversationId || queries.some((query, index) => ownsForm(formIds[index]) && (query.isError || !query.data));
  // A failure stays until a form it covers is answered, for example from another window.
  const failed = failure?.forms.some(form => !latest.some(entry => entry.formId === form.formId && entry.state === "answered")) ? failure : null;
  const errorText: Record<CareerFormErrorCode, string> = {
    form_changed: t("career.forms.error.form_changed", "그사이 질문이 바뀌었거나 닫혔어요. 최신 질문을 확인한 뒤 다시 보내 주세요."),
    file_unavailable: t("career.forms.error.file_unavailable", "고른 파일을 지원서에 붙일 수 없어요. 다른 파일을 고르거나 Harper에게 알려 주세요."),
    file_render_unavailable: t("career.forms.error.file_render_unavailable", "지금은 Harper가 만든 문서를 PDF로 만들 수 없어요. 다시 눌러도 같아요. 직접 올린 파일을 고르거나 Harper에게 알려 주세요."),
    file_render_failed: t("career.forms.error.file_render_failed", "Harper가 만든 문서를 PDF로 만들지 못했어요. 잠시 뒤 다시 눌러 주세요. 계속 안 되면 직접 올린 파일을 고르거나 Harper에게 알려 주세요."),
    invalid_answer: t("career.forms.error.invalid_answer", "보낸 답 중에 받을 수 없는 값이 있어요. 답을 확인한 뒤 다시 보내 주세요."),
    unexpected: t("career.forms.error.unexpected", "답을 저장하지 못했어요. 작성 내용은 그대로예요. 잠시 뒤 다시 눌러 주세요."),
  };
  // Sent as the person's own chat message, so Harper wakes the usual way and can show the review with another file.
  const notifyText: Partial<Record<CareerFormErrorCode, string>> = {
    file_unavailable: t("career.forms.error.notify_message.file_unavailable", "답을 보내려는데 고른 파일을 지원서에 붙일 수 없대. 다른 파일로 다시 보여줘."),
    file_render_unavailable: t("career.forms.error.notify_message.file_render_unavailable", "답을 보내려는데 고른 문서를 지금은 PDF로 만들 수 없대. 내가 올린 원본 파일로 다시 보여줘."),
    file_render_failed: t("career.forms.error.notify_message.file_render_failed", "답을 보내려는데 고른 문서를 PDF로 만드는 게 계속 실패해. 내가 올린 원본 파일로 다시 보여줘."),
    unexpected: t("career.forms.error.notify_message.unexpected", "답을 보내려는데 계속 저장이 안 돼. 확인해줘."),
  };
  // A file that cannot be attached is offered at once; a failure that may pass, once the same press failed twice.
  // The message goes to the open chat, so a review from another conversation does not offer it.
  const notice = failed?.refusal && (!failed.refusal.retryable || failed.repeats > 1) && context?.conversationId === conversationId
    ? notifyText[failed.refusal.code] : undefined;
  const readRefusal = (body: unknown): Refusal => {
    const { code, retryable } = (body ?? {}) as { code?: unknown; retryable?: unknown };
    return typeof code === "string" && Object.hasOwn(errorText, code)
      ? { code: code as CareerFormErrorCode, retryable: retryable === true } : { code: "unexpected", retryable: true };
  };
  const notify = async (shown: Failure, text: string) => {
    if (!context || notifyLock.current) return;
    // Each form with the file chosen in it, as a document link Harper can open.
    const lines = shown.forms.flatMap((form, index) => [form.title, ...form.items.flatMap(item => {
      const documentId = shown.values[index][item.id];
      if (item.type !== "document" || typeof documentId !== "string" || !documentId) return [];
      const content = getCareerFormContent(item);
      return [formatCareerDocumentLink({ id: documentId, title: documentId === content.documentId && typeof content.fileName === "string"
        ? content.fileName : t("career.forms.response.file", "첨부 파일") })];
    })]);
    notifyLock.current = true; setNotifying(true);
    try {
      await context.onSendChatMessage({ text: [text, ...lines].filter(Boolean).join("\n"), onSuccess: () => setNotified(shown.key) });
    } finally {
      notifyLock.current = false; setNotifying(false);
    }
  };
  // Several reviews in one reply (for example applications prepared together) can be approved with one press.
  const approvable = editable.filter(form => form.positive);
  const approving = approvable.filter(form => approvedAction(form, drafts[form.formId]?.actionId) === form.positive?.id).length;
  const update = (form: CareerForm, values: Record<string, CareerFormValue>, actionId?: string) => {
    setDrafts(current => ({ ...current, [form.formId]: { form, values, ...(actionId ? { actionId } : {}) } }));
  };
  const submitChecklistRow = async (form: CareerForm, itemId: string, actionId: string, requestId: string) => {
    if (!conversationId) throw new Error("Conversation unavailable");
    const queryKey = formKey(conversationId, form.formId);
    try {
      const result = await fetchWithAuth("/api/talent/forms", { method: "POST", body: JSON.stringify({
        conversationId, formId: form.formId, revision: form.revision, requestId,
        answers: [{ itemId, actionId, values: {} }], values: {},
      }) });
      if (!result.ok) throw new Error("Response not confirmed");
      const { message } = await result.json();
      const saved = parseCareerFormResponse(message?.formResponse);
      if (!saved || !getCareerSuggestionAnswers(form, [saved])[itemId]) throw new Error("Missing item receipt");
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData<FormEntry>(queryKey, current => {
        if (!current || current.form.revision !== form.revision) return current;
        const responses = [...current.responses.filter(entry => entry.requestId !== saved.requestId), saved];
        return { ...current, responses };
      });
    } catch (error) {
      const refreshed = await queries[formIds.indexOf(form.formId)].refetch();
      if (!getCareerSuggestionAnswers(form, refreshed.data?.responses ?? [])[itemId]) throw error;
    } finally {
      for (const key of ["career-message-history", "career-open-forms", "career-action-items"])
        void client.invalidateQueries({ queryKey: [key, conversationId] });
    }
  };
  const submit = async (singleAction?: string, approveAll = false) => {
    if (!conversationId || lock.current || changed || unavailable || !editable.length) return;
    const submittedDrafts = { ...drafts };
    const responses = editable.map(form => {
      const actionId = approveAll ? approvedAction(form, drafts[form.formId]?.actionId) : singleAction ?? drafts[form.formId]?.actionId;
      return { formId: form.formId, revision: form.revision,
        values: drafts[form.formId]?.values ?? getCareerFormInitialValues(form), ...(actionId ? { actionId } : {}) };
    });
    const signature = JSON.stringify(responses);
    const emptyRequired = responses.flatMap(response => {
      const form = editable.find(entry => entry.formId === response.formId);
      return form && response.actionId && response.actionId === form.positive?.id
        ? emptyRequiredItems(form, response.values).map(item => item.label) : [];
    });
    if (emptyRequired.length && emptyRequiredNotice?.signature !== signature) {
      setEmptyRequiredNotice({ signature, labels: emptyRequired });
      return;
    }
    setEmptyRequiredNotice(null);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const requestId = request.current.id;
    const clearSubmittedDrafts = () => setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key, value]) =>
      !responses.some(response => response.formId === Number(key)) || JSON.stringify(value) !== JSON.stringify(submittedDrafts[key]))));
    const reconcile = () => Promise.all(queries.map(query => query.refetch()));
    const fail = (refusal?: Refusal) => {
      const key = JSON.stringify([signature, refusal?.code ?? null]);
      const repeats = lastFailure.current?.key === key ? lastFailure.current.repeats + 1 : 1;
      lastFailure.current = { key, repeats };
      setFailure({ key, repeats, refusal, forms: editable, values: responses.map(response => response.values) });
    };
    let refusal: Refusal | undefined;
    lock.current = true; setPending(true); setFailure(null);
    try {
      const result = await fetchWithAuth("/api/talent/forms", { method: "POST",
        body: JSON.stringify({ conversationId, requestId, responses }) });
      if (!result.ok) {
        refusal = readRefusal(await result.json().catch(() => null));
        // Below 500 the server refused before saving, so there is no receipt to read. A changed form is reloaded.
        if (result.status < 500) {
          if (refusal.code === "form_changed") await reconcile();
          fail(refusal);
          return;
        }
        throw new Error("Response not confirmed");
      }
      const data = await result.json();
      const saved = (Array.isArray(data.message?.formResponses) ? data.message.formResponses : [])
        .flatMap((value: unknown) => { const response = parseCareerFormResponse(value); return response ? [response] : []; });
      for (const response of saved as CareerFormResponse[]) {
        await client.cancelQueries({ queryKey: formKey(conversationId, response.formId) });
        client.setQueryData<FormEntry>(formKey(conversationId, response.formId), current => !current || current.form.revision !== response.revision ? current : {
          form: { ...current.form, state: "answered" },
          responses: [...current.responses.filter(item => item.requestId !== response.requestId), response],
        });
      }
      clearSubmittedDrafts();
      lastFailure.current = undefined;
      await reconcile();
    } catch {
      // The server may have committed before the connection failed. Read the receipt
      // before offering a retry; an unchanged retry keeps its idempotency identity.
      const refreshed = await reconcile();
      const committed = responses.every(response => refreshed.some(query => query.data?.responses.some(saved =>
        saved.formId === response.formId && saved.revision === response.revision && saved.requestId === `${requestId}:${response.formId}`)));
      if (committed) { clearSubmittedDrafts(); lastFailure.current = undefined; }
      else fail(refusal);
    } finally {
      for (const key of ["career-message-history", "career-open-forms", "career-action-items"])
        void client.invalidateQueries({ queryKey: [key, conversationId] });
      lock.current = false; setPending(false);
    }
  };
  const closedText = t("career.forms.closed", "종료된 질문이에요.");
  if (originChanged) return <MuteButton onClick={onOriginChange}>
    {t("career.forms.load_latest", "최신 질문 확인")}
  </MuteButton>;
  return <section ref={formReferenceRef} className="w-full min-w-0 space-y-3" data-career-form-group={formIds.join(",")}>
    {allEntries.filter(entry => !ownsForm(entry.form.formId)).map(({ form }) =>
      <MuteButton key={form.formId} onClick={() => revealForm(form.formId)}>
        {form.title ?? t("career.forms.open_group", "질문 {count}개 보기").replace("{count}", "1")}<ArrowDown className="size-4" />
      </MuteButton>)}
    {grouped && ownedIds.length > 0 && <MuteButton aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {t("career.forms.open_group", "질문 {count}개 보기").replace("{count}", String(ownedIds.length))}
    </MuteButton>}
    {open && ownedIds.length > 0 && <div id={id} className="space-y-3">
      {conversationId && queries.some(query => query.isPending) && <p role="status">{t("career.forms.loading", "질문을 불러오는 중이에요.")}</p>}
      {(!conversationId || queries.some(query => query.isError)) && <div role="alert">{t("career.forms.unavailable", "질문을 불러오지 못했어요.")}
        <MuteButton onClick={() => queries.forEach(query => void query.refetch())}>{t("career.forms.retry", "다시 불러오기")}</MuteButton></div>}
      {grouped && latest.length > 1 && <nav aria-label={t("career.forms.navigation", "폼 이동")} className="flex gap-2 overflow-x-auto">
        {shown.map((form, index) => <MuteButton key={form.formId} className="shrink-0 max-w-64 truncate" onClick={() => {
          const element = carousel.current?.children[index] as HTMLElement | undefined;
          if (element) carousel.current?.scrollTo({ left: element.offsetLeft - (carousel.current?.offsetLeft ?? 0), behavior: "smooth" });
        }}>{form.title ?? String(index + 1)}</MuteButton>)}
      </nav>}
      <div ref={carousel} className={grouped ? "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2" : "space-y-4"}>
        {shown.map((form, index) => {
          const current = latest[index];
          const draft = current.state === "open" ? drafts[form.formId] : undefined;
          const recorded = entries[index].responses.filter(response => response.revision === form.revision);
          const values: Record<string, CareerFormValue> = draft?.values ?? Object.assign(getCareerFormInitialValues(form), ...recorded.map(response => response.values));
          const selectedAction = draft?.actionId ?? recorded.at(-1)?.actionId;
          const stale = current.revision !== form.revision;
          const disabled = pending || current.state !== "open" || stale;
          const actions = [form.negative, form.positive].filter(Boolean);
          const checklist = isCareerActionChecklist(form);
          return <div key={form.formId} data-career-form-id={form.formId} data-career-form-revision={form.revision}
            className={`career-glass shrink-0 snap-start scroll-mt-20 w-full max-w-[640px] ${checklist ? "self-start space-y-1 px-4 pt-4 pb-1 sm:px-5" : "space-y-4 p-4"}`}>
            {form.title && <h3 className={checklist ? "text-base font-semibold leading-6" : "text-base font-medium"}>{form.title}</h3>}
            {stale && <div role="status">{t("career.forms.changed", "질문이 변경됐어요. 최신 내용을 확인해 주세요.")}
              <MuteButton onClick={() => {
                const preserved = Object.fromEntries(Object.entries(values).filter(([key]) => {
                  const item = form.items.find(item => item.id === key);
                  return item && !["checkbox", "consent", "select", "multiselect"].includes(item.type) &&
                    JSON.stringify(item) === JSON.stringify(current.items.find(item => item.id === key));
                }));
                update(current, { ...getCareerFormInitialValues(current), ...preserved });
              }}>{t("career.forms.load_latest", "최신 질문 확인")}</MuteButton></div>}
            {/* 답변한 폼은 저장된 값과 대화 기록이 결과를 보여 주므로 상태 문구를 넣지 않는다. 종료된 폼만 알린다. */}
            {!stale && current.state !== "open" && current.state !== "answered" && <p role="status">{closedText}</p>}
            {checklist ? <CareerChecklistRows key={form.revision} form={form} responses={recorded}
              unavailable={!conversationId || !!form.hidden || queries[formIds.indexOf(form.formId)].isError}
              apply={(itemId, actionId, requestId) => submitChecklistRow(form, itemId, actionId, requestId)} />
              : form.items.map(item => {
              const fieldId = `${id}-${form.formId}-${item.id}`;
              const required = item.required && <span className="ml-1.5 text-xs font-normal text-critical">{t("career.forms.required", "필수")}</span>;
              const description = item.description && <p className="text-sm text-neutral-muted whitespace-pre-wrap">{item.description}</p>;
              const field = { item, id: fieldId, value: values[item.id], disabled, readOnly: current.state !== "open",
                onChange: (value: CareerFormValue) => update(form, { ...values, [item.id]: value }, draft?.actionId) };
              return isCareerFormCheckbox(item)
                ? <CareerFormCheckboxRow key={item.id} {...field} badge={required}>{description}</CareerFormCheckboxRow>
                : <div key={item.id} className="space-y-2">
                  <label htmlFor={fieldId} className="block text-sm font-medium">{item.label}{required}</label>
                  {description}
                  <CareerFormField {...field} />
                </div>;
            })}
            {current.state !== "open" && selectedAction && <p className="text-sm">{actions.find(action => action?.id === selectedAction)?.label}</p>}
            {current.state === "open" && actions.length > 0 && <div className="flex flex-wrap gap-4">
              {actions.map(action => grouped
                ? <Radio key={action!.id} name={`${id}-${form.formId}-action`} value={action!.id} label={action!.label}
                    disabled={disabled} checked={selectedAction === action!.id} onChange={() => update(form, values, action!.id)} />
                : <MuteButton key={action!.id} variant={action === form.positive ? "dark" : "default"} className={action === form.positive ? "bg-black text-white" : undefined} disabled={disabled || unavailable} onClick={() => void submit(action!.id)}>{action!.label}</MuteButton>)}
            </div>}
          </div>;
        })}
      </div>
      {emptyRequiredNotice && <p role="alert" className="text-sm text-critical">
        {t("career.forms.required_empty", "필수 칸이 비어 있어요: {labels}. 비어 있으면 지원서 제출이 막힐 수 있어요. 이대로 보내려면 한 번 더 눌러 주세요.")
          .replace("{labels}", emptyRequiredNotice.labels.join(", "))}
      </p>}
      {failed && <div className="space-y-2">
        <p role="alert" className="text-sm text-critical">{failed.refusal ? errorText[failed.refusal.code]
          : t("career.forms.batch_failed", "답변 전송을 확인하지 못했어요. 최신 질문을 확인한 뒤 다시 보내 주세요. 작성 내용은 유지돼요.")}</p>
        {notice && notified !== failed.key && <MuteButton disabled={notifying} onClick={() => void notify(failed, notice)}>
          {t("career.forms.error.notify", "Harper에게 알리기")}
        </MuteButton>}
      </div>}
      {editable.length > 0 && (grouped || !shown[0]?.positive && !shown[0]?.negative) && <div className="flex flex-wrap gap-2">
        <MuteButton variant="dark" disabled={pending || changed || unavailable} onClick={() => void submit()}>
          {t("career.forms.send_answers", "답변 보내기")}
        </MuteButton>
        {grouped && approvable.length > 1 &&
          <MuteButton variant="dark" disabled={pending || changed || unavailable || !approving} onClick={() => void submit(undefined, true)}>
            {t("career.forms.approve_all", "모두 승인 ({count})").replace("{count}", String(approving))}
          </MuteButton>}
      </div>}
    </div>}
  </section>;
}
