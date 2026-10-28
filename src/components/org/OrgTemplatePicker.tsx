import { useState } from "react";
import { Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { useOrgMessageTemplates } from "@/hooks/org/useOrgMessageTemplates";
import {
  normalizeOrgMessageTemplateContent,
  ORG_MESSAGE_TEMPLATE_LIMIT,
  type OrgMessageTemplateContent,
  type OrgMessageTemplateKind,
} from "@/lib/org/messageTemplates";
import { cn } from "@/lib/utils";

/**
 * The team's saved templates for one kind of message (up to three, named
 * 템플릿 1–3). Picking one fills the form; "추가하기" starts a new one that
 * "저장하기" saves from what the form holds.
 */
export function OrgTemplatePicker<K extends OrgMessageTemplateKind>({
  className,
  disabled = false,
  kind,
  onApply,
  showLabel = true,
  value,
  workspaceId,
}: {
  className?: string;
  disabled?: boolean;
  kind: K;
  onApply: (content: OrgMessageTemplateContent[K]) => void;
  showLabel?: boolean;
  value: Record<string, unknown>;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const { remove, save, templates, templatesQuery } = useOrgMessageTemplates({
    kind,
    workspaceId,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A template being written: the fields below are its content until saved.
  const [draftName, setDraftName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const current = normalizeOrgMessageTemplateContent(kind, value);
  const currentJson = current ? JSON.stringify(current) : "";
  const matches = (content: unknown) =>
    Boolean(currentJson) && JSON.stringify(content) === currentJson;
  const selected = draftName
    ? null
    : (templates.find((template) => template.id === selectedId) ??
      templates.find((template) => matches(template.content)) ??
      null);
  const changed = Boolean(selected && current && !matches(selected.content));
  const busy = disabled || save.isPending || remove.isPending;
  const fail = (error: unknown) =>
    setMessage(
      localizedOrgErrorMessage(
        error,
        locale,
        c("템플릿을 저장하지 못했어요.", "Couldn't save the template.")
      )
    );

  // Templates are numbered 1–3; a deleted number is reused first.
  const nextTemplateName = () => {
    const names = new Set(templates.map((template) => template.name));
    for (let number = 1; number <= ORG_MESSAGE_TEMPLATE_LIMIT; number += 1) {
      const name = c("템플릿 {p0}", "Template {p0}", { p0: number });
      if (!names.has(name)) return name;
    }
    return c("템플릿 {p0}", "Template {p0}", { p0: templates.length + 1 });
  };
  const saveDraft = () => {
    if (!draftName) return;
    if (!current) {
      setMessage(
        c(
          "아래 내용을 쓰면 저장할 수 있어요.",
          "Fill in the fields below to save."
        )
      );
      return;
    }
    setMessage("");
    save.mutate(
      { content: current, name: draftName },
      {
        onError: fail,
        onSuccess: (result) => {
          setSelectedId(result.template.id);
          setDraftName(null);
        },
      }
    );
  };

  return (
    <div className={cn("space-y-1.5 text-[12px]", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {showLabel ? (
          <span className="mr-0.5 text-neutral-muted">
            {c("템플릿", "Templates")}
          </span>
        ) : null}
        {templates.map((template) => {
          const active = selected?.id === template.id;
          return (
            <MuteButton
              aria-pressed={active}
              className={cn("max-w-48", active && "border-neutral-800")}
              disabled={busy}
              key={template.id}
              onClick={() => {
                setDraftName(null);
                setSelectedId(template.id);
                setMessage("");
                onApply(template.content);
              }}
              size="sm"
              title={template.name}
              type="button"
              variant={active ? "neutral" : "default"}
            >
              <span className="truncate">{template.name}</span>
            </MuteButton>
          );
        })}
        {draftName ? (
          <MuteButton
            aria-pressed
            className="border-dashed border-neutral-800"
            size="sm"
            type="button"
            variant="neutral"
          >
            {draftName}
          </MuteButton>
        ) : templates.length < ORG_MESSAGE_TEMPLATE_LIMIT &&
          !templatesQuery.isError ? (
          <MuteButton
            className="text-neutral-muted"
            disabled={busy || templatesQuery.isPending}
            onClick={() => {
              setDraftName(nextTemplateName());
              setSelectedId(null);
              setMessage("");
            }}
            size="sm"
            type="button"
            variant="transparent"
          >
            <Plus className="size-3" />
            {c("추가하기", "Add")}
          </MuteButton>
        ) : null}
        {templatesQuery.isError ? (
          <span className="text-neutral-muted">
            {c(
              "저장된 템플릿을 불러오지 못했어요.",
              "Couldn't load saved templates."
            )}{" "}
            <button
              className="underline underline-offset-2"
              onClick={() => void templatesQuery.refetch()}
              type="button"
            >
              {c("다시 시도", "Retry")}
            </button>
          </span>
        ) : null}
      </div>
      {draftName ? (
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-neutral-muted">
            {c(
              "아래 내용을 쓰고 저장해 주세요.",
              "Fill in the fields below, then save."
            )}
          </span>
          <MuteButton
            disabled={busy}
            onClick={saveDraft}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("저장하기", "Save")}
          </MuteButton>
          <MuteButton
            disabled={save.isPending}
            onClick={() => {
              setDraftName(null);
              setMessage("");
            }}
            size="sm"
            type="button"
            variant="transparent"
          >
            {c("취소", "Cancel")}
          </MuteButton>
        </div>
      ) : selected ? (
        <div className="flex items-center gap-3 text-neutral-muted">
          {changed ? (
            <MuteButton
              disabled={busy}
              onClick={() =>
                current &&
                save.mutate(
                  { content: current, id: selected.id, name: selected.name },
                  { onError: fail }
                )
              }
              size="sm"
              type="button"
              variant="dark"
            >
              {c("‘{p0}’에 저장", "Save to ‘{p0}’", { p0: selected.name })}
            </MuteButton>
          ) : null}
          <button
            className="underline-offset-2 hover:text-critical hover:underline"
            disabled={busy}
            onClick={() =>
              remove.mutate(selected.id, {
                onError: fail,
                onSuccess: () => setSelectedId(null),
              })
            }
            type="button"
          >
            {c("‘{p0}’ 삭제", "Delete ‘{p0}’", { p0: selected.name })}
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="text-critical" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
