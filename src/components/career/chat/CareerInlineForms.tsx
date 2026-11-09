import { useCallback, useId, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useCareerFormReference } from "./CareerFormReferenceProvider";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Radio } from "@/components/ui/radio";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";
import { useCareerT } from "@/i18n/useCareerT";
import { CareerFormField } from "./CareerFormCard";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";
import { getCareerFormInitialValues, parseCareerForm, parseCareerFormResponse, type CareerForm, type CareerFormValue, type CareerFormResponse } from "@/lib/career/forms/schema";

type FormEntry = { form: CareerForm; responses: CareerFormResponse[] };
const formKey = (conversationId: string | undefined, formId: number) => ["career-form-references", conversationId, formId] as const;

type Draft = { form: CareerForm; values: Record<string, CareerFormValue>; actionId?: string };
const isDraft = (value: unknown): value is Draft => Boolean(value && typeof value === "object" &&
  parseCareerForm((value as Draft).form) && (value as Draft).values && typeof (value as Draft).values === "object");

/** A reference reads existing forms. It never creates, reopens or submits one. */
export function CareerInlineForms({ formIds, grouped = false }: { formIds: number[]; grouped?: boolean }) {
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
  const [failedForms, setFailedForms] = useState<number[]>([]);
  const lock = useRef(false);
  const request = useRef<{ signature: string; id: string } | undefined>(undefined);
  const carousel = useRef<HTMLDivElement>(null);
  const conversationId = context?.conversationId ?? undefined;
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
  const entries = allEntries.filter(entry => ownsForm(entry.form.formId));
  const latest = entries.map(entry => entry.form);
  // A saved answer is authoritative, even when another reference still has a draft.
  const shown = latest.map(form => form.state === "open" ? drafts[form.formId]?.form ?? form : form);
  const editable = latest.filter(form => form.state === "open" && !form.hidden);
  const changed = editable.some(form => drafts[form.formId] && drafts[form.formId].form.revision !== form.revision);
  const unavailable = !conversationId || queries.some((query, index) => ownsForm(formIds[index]) && (query.isError || !query.data));
  const failed = failedForms.some(formId => !latest.some(form => form.formId === formId && form.state === "answered"));
  const update = (form: CareerForm, values: Record<string, CareerFormValue>, actionId?: string) => {
    setDrafts(current => ({ ...current, [form.formId]: { form, values, ...(actionId ? { actionId } : {}) } }));
  };
  const submit = async (singleAction?: string) => {
    if (!conversationId || lock.current || changed || unavailable || !editable.length) return;
    const submittedDrafts = { ...drafts };
    const responses = editable.map(form => ({ formId: form.formId, revision: form.revision,
      values: drafts[form.formId]?.values ?? getCareerFormInitialValues(form),
      ...((singleAction ?? drafts[form.formId]?.actionId) ? { actionId: singleAction ?? drafts[form.formId]?.actionId } : {}),
    }));
    const signature = JSON.stringify(responses);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const requestId = request.current.id;
    const clearSubmittedDrafts = () => setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key, value]) =>
      !responses.some(response => response.formId === Number(key)) || JSON.stringify(value) !== JSON.stringify(submittedDrafts[key]))));
    const reconcile = () => Promise.all(queries.map(query => query.refetch()));
    lock.current = true; setPending(true); setFailedForms([]);
    try {
      const result = await fetchWithAuth("/api/talent/forms", { method: "POST",
        body: JSON.stringify({ conversationId, requestId, responses }) });
      if (!result.ok) throw new Error("Response not confirmed");
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
      await reconcile();
    } catch {
      // The server may have committed before the connection failed. Read the receipt
      // before offering a retry; an unchanged retry keeps its idempotency identity.
      const refreshed = await reconcile();
      const committed = responses.every(response => refreshed.some(query => query.data?.responses.some(saved =>
        saved.formId === response.formId && saved.revision === response.revision && saved.requestId === `${requestId}:${response.formId}`)));
      if (committed) clearSubmittedDrafts();
      else setFailedForms(responses.map(response => response.formId));
    } finally {
      for (const key of ["career-message-history", "career-open-forms", "career-action-items"])
        void client.invalidateQueries({ queryKey: [key, conversationId] });
      lock.current = false; setPending(false);
    }
  };
  const closedText = t("career.forms.closed", "종료된 질문이에요.");
  const answeredText = t("career.forms.answered", "답변을 보냈어요.");
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
          return <div key={form.formId} data-career-form-id={form.formId} data-career-form-revision={form.revision}
            className="career-glass shrink-0 snap-start scroll-mt-20 w-full max-w-[640px] space-y-4 p-4">
            {form.title && <h3 className="text-base font-medium">{form.title}</h3>}
            {stale && <div role="status">{t("career.forms.changed", "질문이 변경됐어요. 최신 내용을 확인해 주세요.")}
              <MuteButton onClick={() => {
                const preserved = Object.fromEntries(Object.entries(values).filter(([key]) => {
                  const item = form.items.find(item => item.id === key);
                  return item && !["checkbox", "select", "multiselect"].includes(item.type) &&
                    JSON.stringify(item) === JSON.stringify(current.items.find(item => item.id === key));
                }));
                update(current, { ...getCareerFormInitialValues(current), ...preserved });
              }}>{t("career.forms.load_latest", "최신 질문 확인")}</MuteButton></div>}
            {!stale && (current.state !== "open") && <p role="status">{current.state === "answered" ? answeredText : closedText}</p>}
            {form.items.map(item => <div key={item.id} className="space-y-2">
              <label htmlFor={`${id}-${form.formId}-${item.id}`} className="block text-sm font-medium">{item.label}</label>
              {item.description && <p className="text-sm text-neutral-muted whitespace-pre-wrap">{item.description}</p>}
              <CareerFormField item={item} id={`${id}-${form.formId}-${item.id}`} value={values[item.id]} disabled={disabled} readOnly={current.state !== "open"}
                onChange={value => update(form, { ...values, [item.id]: value }, draft?.actionId)} />
            </div>)}
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
      {failed && <p role="alert" className="text-sm text-critical">{t("career.forms.batch_failed", "답변 전송을 확인하지 못했어요. 최신 질문을 확인한 뒤 다시 보내 주세요. 작성 내용은 유지돼요.")}</p>}
      {editable.length > 0 && (grouped || !shown[0]?.positive && !shown[0]?.negative) &&
        <MuteButton variant="dark" disabled={pending || changed || unavailable} onClick={() => void submit()}>
          {t("career.forms.send_answers", "답변 보내기")}
        </MuteButton>}
    </div>}
  </section>;
}
