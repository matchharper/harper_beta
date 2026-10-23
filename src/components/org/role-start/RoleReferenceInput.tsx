import { Paperclip, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RoleSectionHeading, RoleToggleButton } from "@/components/org/role-overview/RoleOverviewShared";
import { ReferenceCards } from "@/components/org/role-start/RoleReferenceList";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { createDraftFileAttachment } from "@/lib/chat/attachmentClient";
import { readRoleCreationAttachments } from "@/lib/org/agent/roleCreationAttachmentClient";
import { ROLE_CREATION_FILE_ACCEPT } from "@/lib/org/agent/roleCreationDocumentTypes";
import {
  likedAnswer,
  MAX_REFERENCE_ROWS,
  referenceLink,
  referenceRowOf,
  type RoleStartReferenceRow,
} from "@/lib/org/roleStart/referenceRows";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";
import { useToastStore } from "@/store/useToastStore";

/** The 마음에 든 점 chips (Korean is what is sent); one place, so the labels can be swapped. */
export const REFERENCE_LIKED_CHIPS: Array<[string, string]> = [
  ["해 본 일", "Work done"],
  ["다룬 기술", "Technologies used"],
  ["맡은 일의 크기", "Scope of work"],
  ["도메인 경험", "Domain experience"],
];

export type ReferenceDraft = { key: string; url: string; text: string; chips: string[]; words: string };

const emptyDraft = (): ReferenceDraft => ({ key: Math.random().toString(36).slice(2), url: "", text: "", chips: [], words: "" });
const isBlank = (draft: ReferenceDraft) => !draft.url.trim() && !draft.text.trim() && !draft.chips.length && !draft.words.trim();

/**
 * The rows to send (blank rows left out), or null when a row has no link or
 * profile, or a link that is not one.
 */
export function referenceRowsToSend(drafts: ReferenceDraft[]): RoleStartReferenceRow[] | null {
  const filled = drafts.filter((draft) => !isBlank(draft));
  const rows = filled.map((draft) =>
    draft.url.trim() && !referenceLink(draft.url)
      ? null
      : referenceRowOf({ url: draft.url, text: draft.text, liked: likedAnswer(draft.chips, draft.words) })
  );
  return rows.every(Boolean) ? (rows as RoleStartReferenceRow[]) : null;
}

/** A label above a field, with an optional "선택" mark (the role facts step's fields). */
export function Field({
  children,
  group,
  label,
  optional,
}: {
  children: React.ReactNode;
  /** Several controls (chips): a group, not one label. */
  group?: boolean;
  label: string;
  optional?: boolean;
}) {
  const { c } = useOrgLocale();
  const Tag = group ? "div" : "label";
  return (
    <Tag aria-label={group ? label : undefined} className="grid gap-1.5" role={group ? "group" : undefined}>
      <span className="text-[13px] font-medium text-neutral-primary">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-neutral-soft">{c("선택", "Optional")}</span> : null}
      </span>
      {children}
    </Tag>
  );
}

/**
 * 참고 인물 (선택): people already recorded (read-only, with 빼기) and new
 * rows, up to 5 people in all. Each new row takes a link, a profile (a file or
 * pasted text) and what the team liked; a row needs a link or a profile.
 * Used on the role facts step and in the 매칭 기준 tab.
 */
export function RoleReferenceInput({
  busy,
  drafts,
  onDraftsChange,
  onRemove,
  onSubmit,
  recorded,
  workspaceId,
}: {
  busy: boolean;
  drafts: ReferenceDraft[];
  onDraftsChange: (drafts: ReferenceDraft[]) => void;
  onRemove: (referenceId: string) => void;
  /** Shows a send button (the 매칭 기준 tab); without it the step sends the rows itself. */
  onSubmit?: (rows: RoleStartReferenceRow[]) => void;
  recorded: RoleStartBriefView["references"];
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileFor, setFileFor] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // A row repeating a recorded person's link adds to that person, so it takes no room.
  const recordedLinks = new Set(recorded.map((item) => referenceLink(item.url)).filter(Boolean));
  const room = MAX_REFERENCE_ROWS - recorded.length - drafts.filter((draft) => !recordedLinks.has(referenceLink(draft.url))).length;
  const update = (key: string, patch: Partial<ReferenceDraft>) =>
    onDraftsChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  const rows = referenceRowsToSend(drafts);
  // A file read finishes later: it updates the rows as they are then, so typing meanwhile is kept.
  const latest = useRef(drafts);
  useEffect(() => {
    latest.current = drafts;
  }, [drafts]);

  const readFile = async (key: string, file: File) => {
    setReading(key);
    try {
      const [read] = await readRoleCreationAttachments({ attachments: [createDraftFileAttachment(file)], workspaceId });
      const now = latest.current;
      const current = now.find((draft) => draft.key === key);
      const text = [current?.text.trim(), read?.text.trim()].filter(Boolean).join("\n\n").slice(0, 12_000);
      if (read?.text && current) onDraftsChange(now.map((draft) => (draft.key === key ? { ...draft, text } : draft)));
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : c("파일을 읽지 못했어요.", "Could not read the file."), variant: "error" });
    } finally {
      setReading(null);
    }
  };

  return (
    <div className="grid gap-3">
      <RoleSectionHeading
        description={c(
          "이런 분 같은 사람을 찾는다면 알려 주세요. 마음에 든 점만 평가 기준에 넣어요.",
          "Tell Harper about people like the one you want. Only what you liked becomes evaluation criteria."
        )}
        title={c("참고 인물 (선택)", "Reference people (optional)")}
      />
      <ReferenceCards busy={busy} onRemove={onRemove} references={recorded} />
      {drafts.map((draft, index) => {
        const badLink = Boolean(draft.url.trim()) && !referenceLink(draft.url);
        const incomplete = !isBlank(draft) && !draft.url.trim() && !draft.text.trim();
        return (
          <div className="grid gap-4 rounded-md bg-bg-basement px-4 py-3" key={draft.key}>
            <div className="flex items-center justify-between text-[13px] font-medium text-neutral-primary">
              {c("새 참고 인물 {p0}", "New reference person {p0}", { p0: String(index + 1) })}
              <MuteButton
                aria-label={c("이 줄 지우기", "Remove this row")}
                disabled={busy}
                onClick={() => onDraftsChange(drafts.filter((item) => item.key !== draft.key))}
                size="sm"
                variant="transparent"
              >
                <X className="size-3.5" />
              </MuteButton>
            </div>
            <Field label={c("링크", "Link")} optional>
              <Input
                disabled={busy}
                onChange={(event) => update(draft.key, { url: event.target.value })}
                placeholder={c("예: 프로필이나 포트폴리오 링크", "e.g. a profile or portfolio link")}
                value={draft.url}
              />
            </Field>
            {badLink ? <p className="text-[12px] text-neutral-muted">{c("링크를 확인해 주세요.", "Check the link.")}</p> : null}
            <Field label={c("프로필·이력서 (파일 또는 글)", "Profile or resume (file or text)")} optional>
              <Textarea
                autoResize
                className="min-h-[72px]"
                disabled={busy || reading === draft.key}
                onChange={(event) => update(draft.key, { text: event.target.value })}
                placeholder={c("이력서나 프로필 내용을 붙여 넣어 주세요", "Paste the resume or profile")}
                rows={3}
                value={draft.text}
              />
            </Field>
            <MuteButton
              className="justify-self-start"
              disabled={busy || reading !== null}
              onClick={() => {
                setFileFor(draft.key);
                fileInput.current?.click();
              }}
              size="sm"
              variant="transparent"
            >
              <Paperclip className="size-3.5" />
              {reading === draft.key ? c("파일을 읽는 중", "Reading the file") : c("파일 첨부", "Attach a file")}
            </MuteButton>
            <Field group label={c("마음에 든 점", "What you liked")} optional>
              <div className="flex flex-wrap gap-1.5">
                {REFERENCE_LIKED_CHIPS.map(([ko, en]) => {
                  const active = draft.chips.includes(ko);
                  return (
                    <RoleToggleButton
                      active={active}
                      disabled={busy}
                      key={ko}
                      onClick={() => update(draft.key, { chips: active ? draft.chips.filter((item) => item !== ko) : [...draft.chips, ko] })}
                    >
                      {c(ko, en)}
                    </RoleToggleButton>
                  );
                })}
              </div>
              <Input
                aria-label={c("마음에 든 점 직접 적기", "What you liked, in your words")}
                disabled={busy}
                onChange={(event) => update(draft.key, { words: event.target.value })}
                placeholder={c("직접 적어도 돼요", "Or write it yourself")}
                value={draft.words}
              />
            </Field>
            {incomplete ? (
              <p className="text-[12px] text-neutral-muted">{c("링크나 프로필을 넣어 주세요.", "Add a link or a profile.")}</p>
            ) : null}
          </div>
        );
      })}
      <input
        accept={ROLE_CREATION_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && fileFor) void readFile(fileFor, file);
        }}
        ref={fileInput}
        type="file"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {room > 0 || (recordedLinks.size > 0 && drafts.length < MAX_REFERENCE_ROWS) ? (
          <MuteButton className="justify-self-start" disabled={busy} onClick={() => onDraftsChange([...drafts, emptyDraft()])} variant="transparent">
            <Plus className="size-3.5" />
            {c("인물 추가", "Add a person")}
          </MuteButton>
        ) : null}
        {room <= 0 ? (
          // At the cap only a recorded person's link can be added (to add what the team liked).
          <span className="text-[12px] text-neutral-soft">
            {recordedLinks.size > 0
              ? c("참고 인물은 5명까지예요. 이미 있는 분의 링크만 더 넣을 수 있어요.", "Up to 5 reference people. Only a recorded person's link can be added.")
              : c("참고 인물은 5명까지예요.", "Up to 5 reference people.")}
          </span>
        ) : null}
        {onSubmit && drafts.some((draft) => !isBlank(draft)) ? (
          <MuteButton disabled={busy || reading !== null || !rows?.length || room < 0} onClick={() => rows && onSubmit(rows)} variant="dark">
            {c("참고 인물 보내기", "Send reference people")}
          </MuteButton>
        ) : null}
      </div>
    </div>
  );
}
