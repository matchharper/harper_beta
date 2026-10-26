import { Plus, X } from "lucide-react";
import { RoleSectionHeading } from "@/components/org/role-overview/RoleOverviewShared";
import { ReferenceCards } from "@/components/org/role-start/RoleReferenceList";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  MAX_REFERENCE_ROWS,
  referenceLink,
  referenceRowFromInput,
  type RoleStartReferenceRow,
} from "@/lib/org/roleStart/referenceRows";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";

export type ReferenceDraft = { key: string; input: string };
const emptyDraft = (): ReferenceDraft => ({
  key: crypto.randomUUID(),
  input: "",
});

export function referenceRowsToSend(
  drafts: ReferenceDraft[]
): RoleStartReferenceRow[] | null {
  const rows = drafts
    .filter((draft) => draft.input.trim())
    .map((draft) => referenceRowFromInput(draft.input));
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
    <Tag
      aria-label={group ? label : undefined}
      className="grid gap-1.5"
      role={group ? "group" : undefined}
    >
      <span className="text-[13px] font-medium text-neutral-primary">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-neutral-soft">
            {c("선택", "Optional")}
          </span>
        ) : null}
      </span>
      {children}
    </Tag>
  );
}

/** One free-text field per person; links and the team's own reasons use the existing reference reader. */
export function RoleReferenceInput({
  busy,
  drafts,
  onDraftsChange,
  onRemove,
  onSubmit,
  recorded,
}: {
  busy: boolean;
  drafts: ReferenceDraft[];
  onDraftsChange: (drafts: ReferenceDraft[]) => void;
  onRemove: (referenceId: string) => void;
  onSubmit?: (rows: RoleStartReferenceRow[]) => void;
  recorded: RoleStartBriefView["references"];
}) {
  const { c } = useOrgLocale();
  const recordedLinks = new Set(
    recorded.map((item) => referenceLink(item.url)).filter(Boolean)
  );
  const room =
    MAX_REFERENCE_ROWS -
    recorded.length -
    drafts.filter(
      (draft) =>
        !recordedLinks.has(referenceRowFromInput(draft.input)?.url ?? null)
    ).length;
  const rows = referenceRowsToSend(drafts);
  return (
    <div className="grid gap-3">
      <RoleSectionHeading
        title={c("참고 프로필 (선택)", "Reference profiles (optional)")}
      />
      <ReferenceCards busy={busy} onRemove={onRemove} references={recorded} />
      {drafts.map((draft, index) => (
        <div className="flex items-start gap-2" key={draft.key}>
          <Textarea
            aria-label={c(
              "참고 프로필 {p0} 링크와 이유",
              "Reference person {p0}: link and reason",
              { p0: String(index + 1) }
            )}
            autoResize
            className="flex-1"
            disabled={busy}
            onChange={(event) =>
              onDraftsChange(
                drafts.map((item) =>
                  item.key === draft.key
                    ? { ...item, input: event.target.value }
                    : item
                )
              )
            }
            placeholder={c(
              "링크드인 링크를 넣어 주세요. 이 분을 참고하고 싶은 이유가 있다면 함께 적어 주세요.",
              "Add a LinkedIn link and, if you like, why this person is a good reference."
            )}
            rows={3}
            value={draft.input}
          />
          <MuteButton
            aria-label={c("참고 프로필 지우기", "Remove reference profile")}
            disabled={busy}
            onClick={() =>
              onDraftsChange(drafts.filter((item) => item.key !== draft.key))
            }
            size="sm"
            variant="transparent"
          >
            <X className="size-3.5" />
          </MuteButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {room > 0 ||
        (recordedLinks.size > 0 && drafts.length < MAX_REFERENCE_ROWS) ? (
          <MuteButton
            disabled={busy}
            onClick={() => onDraftsChange([...drafts, emptyDraft()])}
          >
            <Plus className="size-3.5" />
            {c("프로필 추가", "Add a profile")}
          </MuteButton>
        ) : null}
        {room <= 0 ? (
          <span className="text-[12px] text-neutral-soft">
            {recordedLinks.size > 0
              ? c(
                  "참고 프로필은 5명까지예요. 이미 있는 분의 링크만 더 넣을 수 있어요.",
                  "Up to 5 reference profiles. Only a recorded person's link can be added."
                )
              : c("참고 프로필은 5명까지예요.", "Up to 5 reference profiles.")}
          </span>
        ) : null}
        {onSubmit && drafts.some((draft) => draft.input.trim()) ? (
          <MuteButton
            disabled={busy || !rows?.length || room < 0}
            onClick={() => rows && onSubmit(rows)}
            variant="dark"
          >
            {c("참고 프로필 보내기", "Send reference profiles")}
          </MuteButton>
        ) : null}
      </div>
    </div>
  );
}
