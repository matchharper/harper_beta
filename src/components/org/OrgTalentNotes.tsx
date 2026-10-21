import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateOrgFeedItem } from "@/hooks/org/useOrg";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import type { OrgTalentDetailResponse } from "@/lib/org/server";

export function OrgTalentNotes({
  detail,
  canManage,
}: {
  detail: OrgTalentDetailResponse;
  canManage: boolean;
}) {
  const { c, locale } = useOrgLocale();
  const [draft, setDraft] = useState("");
  const create = useCreateOrgFeedItem();
  const notes = detail.feed.filter((item) => item.kind === "org_note");
  return (
    <section
      id="candidate-notes"
      className="mt-10 border-t border-neutral-1000-a05 pt-8"
    >
      <h2 className="mb-4 text-[17px] font-medium">{c("메모", "Notes")}</h2>
      <div className="space-y-5">
        {notes.map((note) => (
          <article key={note.id}>
            <div className="mb-1 flex gap-3 text-xs text-neutral-muted">
              <span>{note.actor?.name || c("팀원", "Team member")}</span>
              <time dateTime={note.createdAt}>
                {formatKstRelativeDate(note.createdAt, { locale })}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6">{note.text}</p>
          </article>
        ))}
      </div>
      {canManage && (
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || create.isPending) return;
            create.mutate(
              {
                recommendationId: detail.recommendation.recommendationId,
                roleId: detail.role.roleId,
                talentId: detail.talent.userId,
                workspaceId: detail.workspace.workspaceId,
                text: draft.trim(),
              },
              { onSuccess: () => setDraft("") }
            );
          }}
        >
          <Textarea
            aria-label={c("메모", "Note")}
            placeholder={c("메모 남기기", "Add a note")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={3}
            disabled={create.isPending}
          />
          {create.error && (
            <p role="alert" className="mt-2 text-xs text-critical">
              {create.error.message}
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <MuteButton
              type="submit"
              disabled={!draft.trim() || create.isPending}
            >
              {c("메모 추가", "Add note")}
            </MuteButton>
          </div>
        </form>
      )}
    </section>
  );
}
