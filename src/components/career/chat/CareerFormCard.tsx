import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatAssistantContent } from "@/components/chat/ChatTimeline";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import type { CareerMessagePayload } from "@/components/career/types";
import {
  findCareerFormAction,
  getCareerFormContent,
  getCareerFormInitialValues,
  type CareerForm,
  type CareerFormAction,
  type CareerFormItem,
  type CareerFormResponse,
  type CareerFormValue,
} from "@/lib/career/forms/schema";
import { formatCareerFormValue } from "@/lib/career/forms/format";
import { PreparationDocumentPicker } from "./PreparationDocumentPicker";

export type CareerFormSubmission = Pick<
  CareerFormResponse,
  "actionId" | "itemId" | "values" | "message" | "skipped" | "answers"
>;
const EMPTY_RESPONSES: CareerFormResponse[] = [];

export function careerFormOptions(
  item: CareerFormItem
): { id: string; label: string; description?: string }[] {
  const options = getCareerFormContent(item).options;
  return Array.isArray(options)
    ? options.flatMap((option) => {
        if (typeof option === "string" && option !== "")
          return [{ id: option, label: option }];
        if (
          option &&
          typeof option === "object" &&
          typeof option.id === "string" &&
          option.id !== "" &&
          typeof option.label === "string"
        )
          return [
            {
              id: option.id,
              label: option.label,
              ...(typeof option.description === "string"
                ? { description: option.description }
                : {}),
            },
          ];
        return [];
      })
    : [];
}

export function CareerFormField({
  item,
  id,
  value,
  disabled,
  onChange,
}: {
  item: CareerFormItem;
  id: string;
  value: CareerFormValue | undefined;
  disabled: boolean;
  onChange: (value: CareerFormValue) => void;
}) {
  const content = getCareerFormContent(item);
  if (item.type === "text")
    return (
      <Input
        id={id}
        disabled={disabled}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (item.type === "textarea" || item.type === "change")
    return (
      <>
        {item.type === "change" && typeof content.originalText === "string" ? (
          <del className="block whitespace-pre-wrap text-sm text-neutral-muted">
            {content.originalText}
          </del>
        ) : null}
        <Textarea
          id={id}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </>
    );
  if (item.type === "checkbox")
    return (
      <Checkbox
        id={id}
        disabled={disabled}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  if (item.type === "select")
    return (
      <Select
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {careerFormOptions(item).map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  if (item.type === "multiselect")
    return (
      <div id={id} className="space-y-2">
        {careerFormOptions(item).map((option) => (
          <Checkbox
            key={option.id}
            disabled={disabled}
            label={option.label}
            checked={Array.isArray(value) && value.includes(option.id)}
            onChange={(event) => {
              const selected = Array.isArray(value) ? value : [];
              onChange(
                event.target.checked
                  ? [...selected, option.id]
                  : selected.filter((entry) => entry !== option.id)
              );
            }}
          />
        ))}
      </div>
    );
  if (item.type === "document")
    return (
      <PreparationDocumentPicker
        id={id}
        disabled={disabled}
        selectedId={typeof value === "string" ? value : undefined}
        onPick={onChange}
      />
    );
  return (
    <div id={id}>
      <ChatAssistantContent
        variant="career"
        content={
          typeof item.content === "string"
            ? item.content
            : typeof content.value === "string"
              ? content.value
              : formatCareerFormValue(item.content)
        }
        renderEmailLinksAsText
      />
    </div>
  );
}

export function CareerFormView({
  form,
  disabled = false,
  responses = EMPTY_RESPONSES,
  onRespond,
}: {
  form: CareerForm;
  disabled?: boolean;
  responses?: CareerFormResponse[];
  onRespond: (submission: CareerFormSubmission) => void | Promise<void>;
}) {
  const [values, setValues] = useState(() => getCareerFormInitialValues(form));
  const edited = useRef(new Set<string>());
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      for (const response of responses)
        if (response.revision === form.revision)
          for (const [id, value] of Object.entries(response.values))
            if (!edited.current.has(id)) next[id] = value;
      return next;
    });
  }, [form.revision, responses]);
  const setValue = (id: string, value: CareerFormValue) => {
    edited.current.add(id);
    setValues((current) => ({ ...current, [id]: value }));
  };
  const actions = (
    positive?: CareerFormAction,
    negative?: CareerFormAction,
    itemId?: string
  ) => (
    <div className="flex flex-row gap-2 w-full">
      {[negative, positive].map((action) =>
        action ? (
          <MuteButton
            key={action.id}
            type="button"
            variant={action === positive ? "dark" : "default"}
            className="w-full rounded-full"
            disabled={disabled}
            onClick={() =>
              void onRespond({
                actionId: action.id,
                ...(itemId ? { itemId } : {}),
                values: itemId
                  ? Object.hasOwn(values, itemId)
                    ? { [itemId]: values[itemId] }
                    : {}
                  : values,
              })
            }
          >
            {action.label}
          </MuteButton>
        ) : null
      )}
    </div>
  );
  if (form.hidden) return null;
  return (
    <section
      data-career-form-id={form.formId}
      data-career-form-revision={form.revision}
      className="my-3 w-full max-w-[640px] space-y-5 rounded-3xl bg-black/4 p-4"
    >
      {form.title ? (
        <h3 className="text-base font-normal text-neutral-primary">
          {form.title}
        </h3>
      ) : null}
      {form.items.map((item) => {
        const content = getCareerFormContent(item);
        const id = `career-form-${form.formId}-${form.revision}-${item.id}`;
        const response = responses
          .filter(
            (entry) =>
              entry.revision === form.revision && entry.itemId === item.id
          )
          .at(-1);
        const selected =
          response && findCareerFormAction(form, response.actionId, item.id);
        return (
          <div key={item.id} className="space-y-2">
            <label
              htmlFor={id}
              className="block text-sm font-medium text-neutral-primary"
            >
              {item.label}
            </label>
            {item.description ||
            typeof content.description === "string" ||
            typeof content.reason === "string" ? (
              <div className="space-y-2 whitespace-pre-wrap text-sm text-neutral-muted">
                {item.description ??
                  (typeof content.description === "string"
                    ? content.description
                    : null)}
                {typeof content.reason === "string" ? (
                  <p>{content.reason}</p>
                ) : null}
              </div>
            ) : null}
            <CareerFormField
              item={item}
              id={id}
              disabled={disabled}
              value={values[item.id]}
              onChange={(value) => setValue(item.id, value)}
            />
            {item.positive || item.negative
              ? actions(item.positive, item.negative, item.id)
              : null}
            {selected ? (
              <p className="text-xs text-neutral-muted">{selected.label}</p>
            ) : null}
          </div>
        );
      })}
      {form.positive || form.negative
        ? actions(form.positive, form.negative)
        : null}
    </section>
  );
}

export function useCareerFormController(form: CareerForm) {
  const context = useOptionalCareerChatPanelContext();
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const t = useCareerT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [responses, setResponses] = useState<CareerFormResponse[]>([]);
  const pendingRequest = useRef<{
    signature: string;
    requestId: string;
  } | null>(null);
  const responseLock = useRef(false);
  const conversationId = context?.conversationId;
  useEffect(() => {
    if (!conversationId || form.hidden) return;
    const controller = new AbortController();
    void fetchWithAuth(
      `/api/talent/forms?conversationId=${encodeURIComponent(conversationId)}&formId=${form.formId}&revision=${form.revision}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        setResponses((current) => [
          ...new Map(
            [
              ...(result.responses?.map(
                (entry: { response: CareerFormResponse }) => entry.response
              ) ?? []),
              ...current,
            ].map((entry: CareerFormResponse) => [entry.requestId, entry])
          ).values(),
        ]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, fetchWithAuth, form.formId, form.revision, form.hidden]);

  const respond = async (
    submission: CareerFormSubmission,
    requestId?: string
  ) => {
    if (!context || !conversationId || responseLock.current) return false;
    responseLock.current = true;
    setPending(true);
    setError("");
    const signature = JSON.stringify(submission);
    if (requestId || pendingRequest.current?.signature !== signature)
      pendingRequest.current = {
        signature,
        requestId: requestId ?? crypto.randomUUID(),
      };
    let responseSaved = false;
    try {
      const response = await fetchWithAuth("/api/talent/forms", {
        method: "POST",
        body: JSON.stringify({
          ...submission,
          formId: form.formId,
          revision: form.revision,
          conversationId,
          requestId: pendingRequest.current.requestId,
        }),
      });
      const payload = (await response.json()) as {
        message?: CareerMessagePayload;
        error?: string;
      };
      if (!payload.message) throw new Error(payload.error);
      responseSaved = true;
      const message = payload.message;
      if (message.formResponse)
        setResponses((current) => [
          ...current.filter(
            (entry) => entry.requestId !== message.formResponse!.requestId
          ),
          message.formResponse!,
        ]);
      void queryClient.invalidateQueries({
        queryKey: ["career-message-history", conversationId],
      });
      if (!response.ok)
        throw new Error(payload.error);
      let continued = false;
      await context.onSendChatMessage({
        text: message.content,
        formResponseMessageId: Number(message.id),
        onSuccess: () => { continued = true; },
      });
      if (!continued)
        setError(t(
          "career.forms.continueError",
          "응답은 저장됐지만 대화를 이어가지 못했어요. 다시 눌러 주세요."
        ));
      // Keep the request identity for an unchanged click, including retries
      // after a lost response. Editing this form creates a new request.
      return continued;
    } catch {
      setError(
        responseSaved ? t(
          "career.forms.continueError",
          "응답은 저장됐지만 대화를 이어가지 못했어요. 다시 눌러 주세요."
        ) : t(
          "career.forms.saveError",
          "응답을 저장하지 못했어요. 다시 시도해 주세요."
        )
      );
      return false;
    } finally {
      responseLock.current = false;
      setPending(false);
    }
  };
  return {
    responses,
    disabled: !context || !context.user || !conversationId || pending,
    pending,
    respond,
    error,
  };
}

export function CareerFormCard({ form }: { form: CareerForm }) {
  const { responses, disabled, respond, error } = useCareerFormController(form);
  return (
    <>
      <CareerFormView
        key={`${form.formId}:${form.revision}`}
        form={form}
        responses={responses}
        disabled={disabled}
        onRespond={async (submission) => {
          await respond(submission);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : null}
    </>
  );
}
