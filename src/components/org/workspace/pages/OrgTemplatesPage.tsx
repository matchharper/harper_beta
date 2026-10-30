import { useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgMessageTemplates } from "@/hooks/org/useOrgMessageTemplates";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import {
  findUnknownOrgIntroFields,
  normalizeOrgMessageTemplateContent,
  ORG_DEFAULT_MEETING_DURATION,
  ORG_MEETING_DURATIONS,
  ORG_MESSAGE_TEMPLATE_LIMIT,
  type OrgMessageTemplate,
  type OrgMessageTemplateContent,
  type OrgMessageTemplateKind,
} from "@/lib/org/messageTemplates";
import {
  insertAtCursor,
  OrgIntroFieldHelp,
} from "@/components/org/OrgIntroFieldHelp";
import { OrgPageHeader } from "../OrgPageHeader";
import { OrgSection, OrgSectionHeader } from "../OrgSection";

type Draft = OrgMessageTemplateContent["intro_email"];

const EMPTY_DRAFT: Draft = {
  body: "",
  durationMinutes: ORG_DEFAULT_MEETING_DURATION,
  meetingPurpose: "",
  subject: "",
};

function draftFrom(template: OrgMessageTemplate): Draft {
  return { ...EMPTY_DRAFT, ...template.content };
}

function contentFrom<K extends OrgMessageTemplateKind>(
  kind: K,
  draft: Draft
): OrgMessageTemplateContent[K] | null {
  return normalizeOrgMessageTemplateContent(kind, draft);
}

/** The team's saved templates, managed in one place outside the dialogs. */
export function OrgTemplatesPage() {
  const { c } = useOrgLocale();
  const { permissions, workspace } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  return (
    <div className="max-w-[1100px] space-y-7 pb-12">
      <OrgPageHeader
        title="Templates"
        description={c(
          "팀이 함께 쓰는 템플릿이에요. 연결 창에서 불러와 쓰고, {p0}개까지 저장할 수 있어요.",
          "Templates your team shares. Load them in the connect dialog; you can keep up to {p0}.",
          { p0: ORG_MESSAGE_TEMPLATE_LIMIT }
        )}
      />
      <TemplateSection
        canManage={canManage}
        description={c(
          "소개 메일을 직접 쓸 때 불러와요. 면접 예약 링크의 주제와 길이도 함께 불러와요.",
          "Load these when you write your own intro email, with the booking link's topic and length."
        )}
        kind="intro_email"
        title={c("소개 메일", "Intro email")}
        workspaceId={workspace.workspaceId}
      />
    </div>
  );
}

function TemplateSection<K extends OrgMessageTemplateKind>({
  canManage,
  description,
  kind,
  title,
  workspaceId,
}: {
  canManage: boolean;
  description: string;
  kind: K;
  title: string;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const { remove, save, templates, templatesQuery } = useOrgMessageTemplates({
    kind,
    workspaceId,
  });
  // "new" while adding one; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // The field a value chip goes into.
  const [field, setField] = useState<"body" | "subject">("body");
  const busy = save.isPending || remove.isPending;
  // A mistyped value such as {내이름} would reach candidates as written.
  const hasUnknownFields =
    findUnknownOrgIntroFields(draft.subject, draft.body).length > 0;
  const canAdd =
    canManage &&
    templatesQuery.isSuccess &&
    templates.length < ORG_MESSAGE_TEMPLATE_LIMIT &&
    editing !== "new";

  // Templates are numbered 1–3; a deleted number is reused first.
  const nextName = () => {
    const names = new Set(templates.map((template) => template.name));
    for (let number = 1; number <= ORG_MESSAGE_TEMPLATE_LIMIT; number += 1) {
      const name = c("템플릿 {p0}", "Template {p0}", { p0: number });
      if (!names.has(name)) return name;
    }
    return c("템플릿 {p0}", "Template {p0}", { p0: templates.length + 1 });
  };
  const fail = (error: unknown) =>
    setMessage(
      localizedOrgErrorMessage(
        error,
        locale,
        c("템플릿을 저장하지 못했어요.", "Couldn't save the template.")
      )
    );
  const open = (id: string, next: Draft) => {
    setEditing(id);
    setDraft(next);
    setMessage("");
  };
  const close = () => {
    setEditing(null);
    setMessage("");
  };
  const submit = (template: OrgMessageTemplate<K> | null) => {
    if (hasUnknownFields) return;
    const content = contentFrom(kind, draft);
    if (!content) {
      setMessage(
        c("제목과 내용을 입력해 주세요.", "Add a subject and a body.")
      );
      return;
    }
    setMessage("");
    save.mutate(
      {
        content,
        id: template?.id ?? null,
        name: template?.name ?? nextName(),
      },
      { onError: fail, onSuccess: close }
    );
  };

  const editor = (template: OrgMessageTemplate<K> | null) => (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-bg-floating p-4 text-[13px]">
      <div className="text-neutral-primary">{template?.name ?? nextName()}</div>
      <label className="block space-y-1.5">
        <span className="text-[12px] text-neutral-muted">
          {c("제목", "Subject")}
        </span>
        <Input
          maxLength={200}
          onChange={(event) =>
            setDraft({ ...draft, subject: event.target.value })
          }
          onFocus={() => setField("subject")}
          ref={subjectRef}
          value={draft.subject}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[12px] text-neutral-muted">
          {c("내용", "Body")}
        </span>
        <Textarea
          className="min-h-40"
          maxLength={8000}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          onFocus={() => setField("body")}
          ref={bodyRef}
          rows={8}
          value={draft.body}
        />
      </label>
      <OrgIntroFieldHelp
        body={draft.body}
        disabled={busy}
        onFix={(from, to) =>
          setDraft((current) => ({
            ...current,
            body: current.body.split(from).join(to),
            subject: current.subject.split(from).join(to),
          }))
        }
        onInsert={(value) =>
          insertAtCursor(
            field === "subject" ? subjectRef.current : bodyRef.current,
            value,
            (next) => setDraft((current) => ({ ...current, [field]: next }))
          )
        }
        subject={draft.subject}
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="block space-y-1.5">
          <span className="text-[12px] text-neutral-muted">
            {c(
              "면접 예약 링크 · 미팅 주제",
              "Booking link · what you'll discuss"
            )}
          </span>
          <Input
            maxLength={600}
            onChange={(event) =>
              setDraft({ ...draft, meetingPurpose: event.target.value })
            }
            value={draft.meetingPurpose}
          />
        </label>
        <div className="space-y-1.5">
          <span className="text-[12px] text-neutral-muted">
            {c("길이", "Length")}
          </span>
          <Select
            onValueChange={(value) =>
              setDraft({ ...draft, durationMinutes: Number(value) })
            }
            value={String(draft.durationMinutes)}
          >
            <SelectTrigger aria-label={c("길이", "Length")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORG_MEETING_DURATIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {c("{p0}분", "{p0} min", { p0: minutes })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {message ? (
        <p className="text-[12px] text-critical" role="alert">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <MuteButton disabled={busy} onClick={close} size="sm" type="button">
          {c("취소", "Cancel")}
        </MuteButton>
        <MuteButton
          disabled={busy || hasUnknownFields}
          onClick={() => submit(template)}
          size="sm"
          type="button"
          variant="dark"
        >
          {save.isPending ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : null}
          {c("저장하기", "Save")}
        </MuteButton>
      </div>
    </div>
  );

  let content: ReactNode;
  if (templatesQuery.isPending) {
    content = (
      <p className="text-[13px] text-neutral-muted">
        {c("불러오는 중이에요.", "Loading.")}
      </p>
    );
  } else if (templatesQuery.isError) {
    content = (
      <p className="text-[13px] text-neutral-muted">
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
      </p>
    );
  } else {
    content = (
      <div className="space-y-3">
        {templates.map((template) =>
          editing === template.id ? (
            <div key={template.id}>{editor(template)}</div>
          ) : (
            <div
              className="flex items-start gap-4 rounded-lg border border-neutral-1000-a05 bg-bg-floating p-4 text-[13px]"
              key={template.id}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-neutral-primary">{template.name}</div>
                <TemplateSummary template={template} />
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-1.5">
                  <MuteButton
                    disabled={busy || Boolean(editing)}
                    onClick={() => open(template.id, draftFrom(template))}
                    size="sm"
                    type="button"
                  >
                    {c("수정", "Edit")}
                  </MuteButton>
                  <MuteButton
                    disabled={busy || Boolean(editing)}
                    onClick={() =>
                      remove.mutate(template.id, { onError: fail })
                    }
                    size="sm"
                    type="button"
                    variant="transparent"
                  >
                    {c("삭제", "Delete")}
                  </MuteButton>
                </div>
              ) : null}
            </div>
          )
        )}
        {editing === "new" ? editor(null) : null}
        {!templates.length && editing !== "new" ? (
          <p className="text-[13px] text-neutral-muted">
            {c("아직 저장된 템플릿이 없어요.", "No saved templates yet.")}
          </p>
        ) : null}
        {message && !editing ? (
          <p className="text-[12px] text-critical" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <OrgSection>
      <OrgSectionHeader
        actions={
          canAdd ? (
            <MuteButton
              disabled={busy || Boolean(editing)}
              onClick={() => open("new", EMPTY_DRAFT)}
              size="sm"
              type="button"
            >
              <Plus className="size-3" />
              {c("추가하기", "Add")}
            </MuteButton>
          ) : null
        }
        description={description}
        title={title}
      />
      {content}
    </OrgSection>
  );
}

function TemplateSummary({ template }: { template: OrgMessageTemplate }) {
  const { c } = useOrgLocale();
  const content = template.content;
  return (
    <div className="space-y-0.5 text-neutral-muted">
      <div className="text-neutral-primary">{content.subject}</div>
      <div className="line-clamp-3 whitespace-pre-wrap">{content.body}</div>
      <div>
        {c("면접 예약 링크 {p0}분", "Booking link {p0} min", {
          p0: content.durationMinutes,
        })}
        {content.meetingPurpose ? ` · ${content.meetingPurpose}` : null}
      </div>
    </div>
  );
}
