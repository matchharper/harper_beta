"use client";

import { useCallback, useEffect, useRef, useState, useId } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { BareButton, PrimaryButton, MuteButton } from "@/components/ui/button";
import { useCareerMobileChatClose } from "@/components/career/mobile/CareerMobileChatCloseContext";
import { Radio } from "@/components/ui/radio";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import RichText from "@/components/ui/rich-text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import {
  applicationFieldId,
  type ApplicationFieldAnswer,
} from "@/lib/career/simulation/applicationReview";
import type { ApplicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import type { PreparationResponse } from "@/lib/career/simulation/preparation";
import { PreparationDocumentPicker } from "./PreparationDocumentPicker";

export function ApplicationReviewEntry({
  messageId,
  roleId,
  version,
  inline = false,
}: {
  messageId?: number;
  roleId?: string;
  version?: number;
  inline?: boolean;
}) {
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [applications, setApplications] = useState<ApplicationReviewView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = messageId
      ? `messageId=${messageId}`
      : `roleId=${encodeURIComponent(roleId ?? "")}`;
    void fetchWithAuth(`/api/talent/application-review?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok)
          setApplications((await response.json()).applications ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [fetchWithAuth, messageId, roleId, version]);
  if (!applications.length) return null;
  if (inline)
    return (
      <div className="mt-4 w-full min-w-0">
        {applications.map((application) => (
          <ApplicationReviewPanel
            key={application.messageId}
            initial={application}
          />
        ))}
      </div>
    );
  return (
    <div className="my-3 flex flex-wrap gap-2">
      {applications.map((application, index) => (
        <MuteButton
          key={application.messageId}
          onClick={() => setSelected(application.messageId)}
        >
          <FileText className="size-4" aria-hidden />
          {t("career.application.review.open", "지원서 확인")}
          {applications.length > 1 ? ` · ${applications.length - index}` : ""}
        </MuteButton>
      ))}
      {selected && (
        <ApplicationReviewPanel
          key={selected}
          initial={
            applications.find(
              (application) => application.messageId === selected
            )!
          }
          onClose={() => setSelected(null)}
          onSaved={(saved) =>
            setApplications((previous) =>
              previous.map((application) =>
                application.messageId === saved.messageId ? saved : application
              )
            )
          }
        />
      )}
    </div>
  );
}

export function ApplicationReviewPanel({
  initial,
  onClose,
  onSaved,
}: {
  initial: ApplicationReviewView;
  onClose?: () => void;
  onSaved?: (view: ApplicationReviewView) => void;
}) {
  const router = useRouter();
  const closeMobileChat = useCareerMobileChatClose();
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [view, setView] = useState(initial);
  const [changes, setChanges] = useState<
    Record<string, ApplicationFieldAnswer>
  >({});
  const [responses, setResponses] = useState<
    Record<string, PreparationResponse>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openDocument = (documentId: string) => {
    closeMobileChat?.();
    onClose?.();
    void router.push(getCareerDocumentHref(documentId));
  };
  const lock = useRef(false);
  const [localRevision, setLocalRevision] = useState(initial.review?.revision);
  const storageKey = `harper-application-review:${initial.messageId}`;
  const polling =
    !!view.browser &&
    ["queued", "running", "waiting"].includes(view.browser.status);
  const refresh = useCallback(async () => {
    const response = await fetchWithAuth(
      `/api/talent/application-review?messageId=${initial.messageId}`
    );
    if (!response.ok) throw new Error();
    const incoming = (await response.json()).applications?.[0];
    if (incoming) setView(incoming);
  }, [fetchWithAuth, initial.messageId]);
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (local?.revision === initial.review?.revision) {
        setChanges(local.changes);
        setLocalRevision(local.revision);
      }
    } catch {
      /* Local cache is optional; saved server values remain available. */
    }
  }, [storageKey, initial.review?.revision]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!lock.current) await refresh().catch(() => {});
      if (!disposed && polling) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [refresh, polling]);
  useEffect(() => setResponses({}), [view.batch?.id]);
  const instanceId = useId();
  const review = view.review!;
  const browser = view.browser;
  const running =
    !!browser && ["queued", "running", "waiting"].includes(browser.status);
  const locked =
    running ||
    !!browser?.transmissionAttemptedAt ||
    browser?.status === "succeeded" ||
    browser?.status === "uncertain";
  const dirty = Object.keys(changes).length > 0;
  const edit = (answer: ApplicationFieldAnswer) => {
    if (!dirty) setLocalRevision(review.revision);
    const next = {
      ...changes,
      [answer.fieldId]: { ...changes[answer.fieldId], ...answer },
    };
    setChanges(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          revision: dirty ? localRevision : review.revision,
          changes: next,
        })
      );
    } catch {
      /* Server save remains available. */
    }
  };
  const command = async (
    operation: string,
    extra: Record<string, unknown> = {}
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let commandRevision = dirty ? localRevision : review.revision;
      if (operation === "start" && dirty) {
        const savedResponse = await fetchWithAuth(
          "/api/talent/application-review",
          {
            method: "POST",
            body: JSON.stringify({
              messageId: view.messageId,
              operation: "save",
              requestId: crypto.randomUUID(),
              reviewRevision: commandRevision,
              answers: Object.values(changes),
            }),
          }
        );
        if (!savedResponse.ok) throw new Error();
        const saved = (await savedResponse.json()).application;
        commandRevision = saved.review.revision;
        setLocalRevision(commandRevision);
        setView(saved);
        onSaved?.(saved);
        setChanges({});
        localStorage.removeItem(storageKey);
      }
      const response = await fetchWithAuth("/api/talent/application-review", {
        method: "POST",
        body: JSON.stringify({
          messageId: view.messageId,
          operation,
          requestId: crypto.randomUUID(),
          reviewRevision: commandRevision,
          ...extra,
        }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setView(data.application);
      onSaved?.(data.application);
      if (operation === "save") {
        setChanges({});
        setLocalRevision(data.application.review.revision);
        localStorage.removeItem(storageKey);
      }
    } catch {
      setError(
        t(
          "career.application.review.error",
          "요청을 완료하지 못했어요. 입력한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요."
        )
      );
      await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const canStart =
    view.ready &&
    review.form.submission?.status === "supported" &&
    !locked &&
    view.status === "active";
  const batch = view.batch;
  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {view.applicationUrl && !running && browser?.status !== "succeeded" && (
        <a
          className="text-sm underline underline-offset-4"
          href={view.applicationUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("career.application.review.direct", "지원 사이트 열기")}
        </a>
      )}
      {view.status === "ended" && !locked && (
        <MuteButton disabled={busy} onClick={() => void command("resume")}>
          {t("career.application.review.resume", "이어서 작성")}
        </MuteButton>
      )}
      {running && (
        <MuteButton disabled={busy} onClick={() => void command("stop")}>
          {t("career.application.review.stop", "중단하기")}
        </MuteButton>
      )}
      {dirty && !locked && (
        <PrimaryButton
          disabled={busy || view.status !== "active"}
          onClick={() =>
            void command("save", { answers: Object.values(changes) })
          }
        >
          {t("career.application.review.save", "변경사항 저장")}
        </PrimaryButton>
      )}
      {canStart && (
        <PrimaryButton disabled={busy} onClick={() => void command("start")}>
          {t("career.application.review.start", "최종 제출 확인")}
        </PrimaryButton>
      )}
    </div>
  );
  const content = (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-critical-700">
          {error}
        </p>
      )}
      {dirty && localRevision !== review.revision && (
        <p role="alert" className="text-sm text-critical-700">
          {t(
            "career.application.review.conflict",
            "다른 곳에서 지원서가 수정됐어요. 필요한 입력을 복사한 뒤 새로고침해 주세요."
          )}
        </p>
      )}
      {view.resumeDocumentId && (
        <BareButton
          type="button"
          onClick={() => openDocument(view.resumeDocumentId!)}
          className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
        >
          <FileText className="size-4" aria-hidden />
          {t("career.application.review.resumeFile", "이력서 열기")}
        </BareButton>
      )}
      {review.documents?.map((document) => (
        <BareButton
          key={document.documentId}
          type="button"
          onClick={() => openDocument(document.documentId)}
          className="flex w-fit items-center gap-2 text-sm underline underline-offset-4"
        >
          <FileText className="size-4 shrink-0" aria-hidden />
          {document.title}
        </BareButton>
      ))}
      {running && !batch && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          {batch
            ? t("career.application.review.waiting", "확인이 필요해요")
            : t(
                "career.application.review.running",
                "지원 사이트에 입력하고 있어요"
              )}
        </p>
      )}
      {browser?.result && (
        <div role="status" className="space-y-2">
          <p className="font-medium">
            {browser.status === "succeeded"
              ? t("career.application.review.sent", "지원 완료")
              : browser.status === "uncertain"
                ? t(
                    "career.application.review.uncertain",
                    "제출 여부 확인 필요"
                  )
                : t(
                    "career.application.review.incomplete",
                    "지원이 완료되지 않았어요"
                  )}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {browser.result.summary}
          </p>
        </div>
      )}
      <fieldset
        disabled={busy || locked || view.status !== "active"}
        className="min-w-0 space-y-5 [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_input:disabled]:text-neutral-primary [&_textarea:disabled]:text-neutral-primary"
      >
        {review.form.fields.map((field, index) => {
          const id = applicationFieldId(index),
            answer = {
              ...review.fields.find((value) => value.fieldId === id),
              ...changes[id],
            };
          const label = `${field.label}${field.required ? " *" : ""}`,
            inputId = `${instanceId}-application-${view.messageId}-${id}`;
          const type = field.type.toLowerCase();
          const multiple =
            field.multiple === true ||
            ["checkbox", "select-multiple", "multiselect"].includes(type);
          const singleChoice =
            (type === "checkbox" || type === "radio") && !field.options.length;
          return (
            <div
              key={id}
              className={
                singleChoice
                  ? "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1"
                  : "min-w-0 space-y-2"
              }
            >
              <label
                htmlFor={inputId}
                className={
                  singleChoice
                    ? "col-start-2 row-start-1 cursor-pointer text-sm leading-6"
                    : "block text-sm font-medium leading-6"
                }
              >
                {label}
              </label>
              {field.instructions && (
                <p
                  className={`${singleChoice ? "col-start-2" : ""} whitespace-pre-wrap text-sm text-neutral-muted`}
                >
                  {field.instructions}
                </p>
              )}
              {type === "file" || type === "file-or-url" ? (
                <>
                  <PreparationDocumentPicker
                    disabled={busy || locked || view.status !== "active"}
                    selectedId={answer.documentId ?? undefined}
                    readOnly={locked || view.status !== "active"}
                    id={inputId}
                    onPick={(documentId) =>
                      edit({ fieldId: id, documentId, value: "" })
                    }
                  />
                  {type === "file-or-url" && (
                    <Input
                      type="url"
                      aria-label={`${field.label} URL`}
                      placeholder="https://"
                      value={answer.value ?? ""}
                      onChange={(event) =>
                        edit({
                          fieldId: id,
                          value: event.target.value,
                          documentId: null,
                        })
                      }
                    />
                  )}
                  {answer.documentId && !locked && view.status === "active" && (
                    <MuteButton
                      onClick={() => edit({ fieldId: id, documentId: null })}
                    >
                      {t("career.application.review.removeFile", "첨부 해제")}
                    </MuteButton>
                  )}
                </>
              ) : (type === "checkbox" || type === "radio") &&
                !field.options.length ? (
                <ApplicationChoiceControl
                  className="col-start-1 row-start-1 mt-1"
                  id={inputId}
                  name={type === "radio" ? field.name : undefined}
                  type={type}
                  checked={answer.value === "true"}
                  onChange={(event) => {
                    if (type === "radio" && field.name) {
                      const next = { ...changes };
                      if (!dirty) setLocalRevision(review.revision);
                      review.form.fields.forEach((other, otherIndex) => {
                        if (other.type === "radio" && other.name === field.name)
                          next[applicationFieldId(otherIndex)] = {
                            fieldId: applicationFieldId(otherIndex),
                            value: String(otherIndex === index),
                          };
                      });
                      setChanges(next);
                      try {
                        localStorage.setItem(
                          storageKey,
                          JSON.stringify({
                            revision: dirty ? localRevision : review.revision,
                            changes: next,
                          })
                        );
                      } catch {}
                    } else
                      edit({
                        fieldId: id,
                        value: String(event.target.checked),
                      });
                  }}
                />
              ) : field.options.length ? (
                <div
                  id={inputId}
                  role="group"
                  aria-label={label}
                  className="space-y-2"
                >
                  {field.options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 text-sm leading-6"
                    >
                      <ApplicationChoiceControl
                        className="mt-1"
                        type={multiple ? "checkbox" : "radio"}
                        name={inputId}
                        checked={
                          multiple
                            ? (answer.values?.includes(option) ?? false)
                            : answer.value === option
                        }
                        onChange={(event) =>
                          edit(
                            multiple
                              ? {
                                  fieldId: id,
                                  values: event.target.checked
                                    ? [...(answer.values ?? []), option]
                                    : (answer.values ?? []).filter(
                                        (value) => value !== option
                                      ),
                                }
                              : { fieldId: id, value: option }
                          )
                        }
                      />
                      <span className="min-w-0 break-words">{option}</span>
                    </label>
                  ))}
                </div>
              ) : type === "textarea" ? (
                <Textarea
                  id={inputId}
                  value={answer.value ?? ""}
                  maxLength={field.maxLength ?? undefined}
                  rows={5}
                  onChange={(event) =>
                    edit({ fieldId: id, value: event.target.value })
                  }
                />
              ) : (
                <Input
                  id={inputId}
                  type={
                    ["email", "tel", "url", "number", "date"].includes(type)
                      ? type
                      : "text"
                  }
                  value={answer.value ?? ""}
                  maxLength={field.maxLength ?? undefined}
                  onChange={(event) =>
                    edit({ fieldId: id, value: event.target.value })
                  }
                />
              )}
              {field.fileTypes.length > 0 && (
                <p className="text-xs text-neutral-muted">
                  {field.fileTypes.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {batch && (
        <section className="space-y-4 border-t border-neutral-1000-a10 pt-4">
          {batch.kind === "submission" && (
            <p className="text-sm font-medium">{batch.items[0]?.title}</p>
          )}
          {batch.kind === "submission" && browser?.request && (
            <>
              <p className="break-all text-sm">{browser.request.url}</p>
              <dl className="space-y-3">
                {browser.request.fields.map((field, index) => (
                  <div key={index}>
                    <dt className="text-sm font-medium">{field.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sm">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {browser.files?.map((file) => (
                <p key={file.documentId} className="text-sm">
                  {file.name}
                </p>
              ))}
            </>
          )}
          {batch.kind !== "submission" && batch.review && (
            <RichText content={batch.review.markdown} />
          )}
          {batch.kind !== "submission" &&
            batch.items.map((item) => (
              <fieldset key={item.id} disabled={busy} className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  {item.title}
                </legend>
                {item.options?.length ? (
                  item.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <ApplicationChoiceControl
                        className="mt-1"
                        type="radio"
                        name={`${instanceId}-${item.id}`}
                        checked={responses[item.id]?.optionId === option.id}
                        onChange={() =>
                          setResponses((previous) => ({
                            ...previous,
                            [item.id]: {
                              decision: "answer",
                              optionId: option.id,
                              text: option.label,
                              reviewId: batch.review?.id,
                            },
                          }))
                        }
                      />
                      {option.label}
                    </label>
                  ))
                ) : item.inputKind === "material" ? (
                  <PreparationDocumentPicker
                    disabled={busy}
                    selectedId={responses[item.id]?.documentId}
                    onPick={(documentId) =>
                      setResponses((previous) => ({
                        ...previous,
                        [item.id]: {
                          decision: "document",
                          documentId,
                          reviewId: batch.review?.id,
                        },
                      }))
                    }
                  />
                ) : (
                  <Textarea
                    aria-label={item.title}
                    value={responses[item.id]?.text ?? ""}
                    onChange={(event) =>
                      setResponses((previous) => ({
                        ...previous,
                        [item.id]: {
                          decision: "answer",
                          text: event.target.value,
                          reviewId: batch.review?.id,
                        },
                      }))
                    }
                  />
                )}
              </fieldset>
            ))}
          {batch.kind === "submission" ? (
            <div className="flex flex-wrap gap-2">
              {batch.items[0]?.options?.map((option) => (
                <PrimaryButton
                  key={option.id}
                  disabled={busy}
                  onClick={() =>
                    void command("answers", {
                      batchId: batch.id,
                      responses: {
                        [batch.items[0].id]: {
                          decision: "answer",
                          optionId: option.id,
                          text: option.label,
                          reviewId: batch.review?.id,
                        },
                      },
                    })
                  }
                >
                  {option.label}
                </PrimaryButton>
              ))}
            </div>
          ) : (
            <PrimaryButton
              disabled={busy || batch.items.some((item) => !responses[item.id])}
              onClick={() =>
                void command("answers", { batchId: batch.id, responses })
              }
            >
              {t("career.application.review.confirm", "확인한 내용으로 계속")}
            </PrimaryButton>
          )}
        </section>
      )}
    </div>
  );
  if (onClose)
    return (
      <TalentCareerModal
        open
        onClose={onClose}
        title={view.roleName}
        ariaLabel={t("career.application.review.open", "지원서 확인")}
        panelClassName="max-w-3xl"
        bodyClassName="bg-neutral-50 p-4 sm:p-5"
        footer={footer}
      >
        {content}
      </TalentCareerModal>
    );
  return (
    <section
      aria-label={t("career.application.review.open", "지원서 확인")}
      className="w-full min-w-0 rounded-2xl border border-neutral-1000-a05 bg-neutral-50 p-4 text-neutral-primary sm:p-5"
    >
      <div className="mb-5 flex items-start gap-2.5">
        <FileText
          className="mt-0.5 size-5 shrink-0 text-neutral-muted"
          aria-hidden
        />
        <h3 className="min-w-0 text-sm font-semibold leading-6">
          {view.roleName}
        </h3>
      </div>
      {content}
      <div className="mt-5">{footer}</div>
    </section>
  );
}

function ApplicationChoiceControl({
  type,
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type: "checkbox" | "radio";
}) {
  if (type === "checkbox")
    return <Checkbox {...props} className={className} size="medium" />;
  return <Radio {...props} className={className} size="medium" />;
}
