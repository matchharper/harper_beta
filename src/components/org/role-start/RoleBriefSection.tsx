import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { RoleSectionHeading } from "@/components/org/role-overview/RoleOverviewShared";
import { RoleBriefFields } from "@/components/org/role-start/RoleBriefFields";
import { RoleReferenceInput, type ReferenceDraft } from "@/components/org/role-start/RoleReferenceInput";
import { RoleReferenceList } from "@/components/org/role-start/RoleReferenceList";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { roleMatchingBriefQueryOptions } from "@/hooks/org/roleMatchingBriefQuery";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { criterionLevel } from "@/lib/org/roleCriteria";
import { isProtectedNote } from "@/lib/org/roleStart/brief";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";
import { useOrgAgentLiveChatStore } from "@/store/useOrgAgentLiveChatStore";
import { useToastStore } from "@/store/useToastStore";

/**
 * The Role's Brief as one view: 요약, 필수 조건 (profile facts and criteria
 * checked on the career) and 평가 기준 with 중요도. Grade signals stay hidden.
 * Editing uses the board panel's path, so the saved Brief text and the
 * criteria list are written together from the same Brief.
 */
export function RoleBriefSection({
  roleId,
  showBottomBorder = false,
  workspaceId,
}: {
  roleId: string;
  showBottomBorder?: boolean;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const queryClient = useQueryClient();
  // Under "org", so a finished chat turn (which refreshes every org query) shows its Brief edit.
  const queryKey = ["org", "role-rubric", workspaceId, roleId];
  // After an add, look again every few seconds (up to ~30s) until a new person shows.
  const [awaiting, setAwaiting] = useState<{ count: number; until: number } | null>(null);
  // A chat turn for this Role is running: it may be editing the Brief.
  const chatRunning = useOrgAgentLiveChatStore((state) =>
    Object.entries(state.chats).some(([key, chat]) => key.endsWith(`:${workspaceId}:${roleId}`) && chat.isStreaming)
  );
  const query = useQuery({
    ...roleMatchingBriefQueryOptions(workspaceId, roleId),
    refetchInterval: (current) =>
      chatRunning || current.state.data?.session?.briefEdit === "running"
        ? 2_000
        : awaiting && Date.now() < awaiting.until && (current.state.data?.rubric?.references.length ?? 0) <= awaiting.count
          ? 3_000
          : false,
  });
  // A chat edit of this Brief: locked while it runs, one line if it failed.
  const briefEdit = query.data?.session?.briefEdit ?? null;
  const locked = briefEdit === "running";
  const server = query.data?.rubric ?? null;
  const serverJson = JSON.stringify(server);
  const [editing, setEditing] = useState(false);
  // Null until the person changes something; until then the saved Brief is the draft.
  const [edited, setEdited] = useState<RoleStartBriefView | null>(null);
  // The Brief the edit started from: a Brief changed elsewhere since then is not overwritten.
  const [editedHash, setEditedHash] = useState<string | null>(null);
  // The summary when the edit started: only a change from it counts as the team's own summary.
  const [editStartSummary, setEditStartSummary] = useState<string | null>(null);
  const draft = edited ?? server;
  const save = useMutation({
    mutationFn: (body: { brief?: RoleStartBriefView; request?: string; briefHash?: string; summaryEdited?: boolean }) =>
      fetchWithInternalAuth<{ rubric: RoleStartBriefView; judging: number }>("/api/org/role-start", {
        body: JSON.stringify({ action: "update_rubric", roleId, workspaceId, ...body }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onError: (cause) => {
      const conflict = (cause as { status?: number }).status === 409;
      addToast({
        message: conflict
          ? c("그사이 다른 곳에서 바뀌었어요. 새로 불러온 뒤 다시 저장해 주세요.", "It changed elsewhere meanwhile. Reload and save again.")
          : cause instanceof Error ? cause.message : c("기준을 바꾸지 못했어요.", "Could not update the criteria."),
        variant: "error",
      });
      if (conflict) {
        setEdited(null);
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSuccess: (result) => {
      setEdited(null);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey });
      addToast({
        message: result.judging
          ? c("기준을 바꿨어요. 바뀐 기준으로 후보를 다시 보고 있어요.", "Criteria updated. Reviewing candidates again for the changed criteria.")
          : c("기준을 바꿨어요.", "Criteria updated."),
        variant: "success",
      });
    },
  });

  // 참고 인물: new rows are sent from here; recorded ones can be removed.
  const [referenceDrafts, setReferenceDrafts] = useState<ReferenceDraft[]>([]);
  const references = useMutation({
    mutationFn: (body: { action: "add_references"; people: unknown[] } | { action: "remove_reference"; referenceId: string }) =>
      fetchWithInternalAuth<{ ok?: boolean; queued?: boolean }>("/api/org/role-start", {
        body: JSON.stringify({ roleId, workspaceId, ...body }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onError: (cause) =>
      addToast({ message: cause instanceof Error ? cause.message : c("요청을 처리하지 못했어요.", "Request failed."), variant: "error" }),
    onSuccess: (_result, body) => {
      void queryClient.invalidateQueries({ queryKey });
      if (body.action === "add_references") {
        setReferenceDrafts([]);
        setAwaiting({ count: query.data?.rubric?.references.length ?? 0, until: Date.now() + 30_000 });
        addToast({ message: c("참고 인물을 받았어요. 읽은 뒤 여기에 보여요.", "Got the reference people. They show here once read."), variant: "success" });
      }
    },
  });

  if (query.isError) {
    return (
      <OrgSection className={showBottomBorder ? "last:border-b" : undefined}>
        <div className="flex min-h-24 items-center gap-3 text-[13px] text-neutral-muted">
          {c("기준을 불러오지 못했어요.", "Could not load the criteria.")}
          <MuteButton onClick={() => void query.refetch()} variant="transparent">
            {c("다시 불러오기", "Retry")}
          </MuteButton>
        </div>
      </OrgSection>
    );
  }
  if (query.isLoading || !draft) {
    return (
      <OrgSection className={showBottomBorder ? "last:border-b" : undefined}>
        <div className="flex min-h-24 items-center text-[13px] text-neutral-muted">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {c("불러오는 중입니다.", "Loading.")}
        </div>
      </OrgSection>
    );
  }
  const dirty = JSON.stringify(draft) !== serverJson;
  const setDraft = (update: RoleStartBriefView | ((current: RoleStartBriefView) => RoleStartBriefView)) => {
    if (edited === null) {
      setEditedHash(query.data?.briefHash ?? null);
      setEditStartSummary(draft?.summary ?? null);
    }
    setEdited((current) => {
      const base = current ?? draft;
      return typeof update === "function" ? update(base) : update;
    });
  };
  // A note about age, gender or another protected trait is not saved: fixed first.
  const invalid =
    draft.criteria.some((item) => !item.name.trim() || !item.criteria.trim()) || Boolean(draft.otherNotes?.some(isProtectedNote));
  const shown = server ?? draft;

  return (
    <OrgSection className={showBottomBorder ? "last:border-b" : undefined}>
      <div aria-busy={locked} className="relative">
      {locked ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-bg-weak/70" role="status">
          <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-neutral-soft" />
          <span className="text-[13px] text-neutral-muted">
            {c("채팅에서 요청한 Brief 수정을 반영하는 중이에요.", "Applying the Brief change you asked for in chat.")}
          </span>
        </div>
      ) : null}
      {briefEdit === "error" ? (
        <p className="mb-2 text-[13px] text-red-700">
          {c("채팅에서 요청한 Brief 수정을 반영하지 못했어요. 다시 요청해 주세요.", "Could not apply the Brief change from chat. Please ask again.")}
        </p>
      ) : null}
      <div className="mb-3 flex items-start justify-between gap-4">
        <RoleSectionHeading
          description={c(
            "Harper가 후보를 찾고 추천할 때 쓰는 기준이에요.",
            "Harper finds and recommends candidates with this Brief."
          )}
          size="large"
          title={c("Brief", "Brief")}
        />
        {canManage && !editing ? (
          <MuteButton disabled={save.isPending || locked} onClick={() => setEditing(true)} variant="transparent">
            {c("수정하기", "Edit")}
          </MuteButton>
        ) : null}
      </div>

      {editing ? (
        <Textarea
          aria-label={c("요약", "Summary")}
          className="min-h-24 text-[14px] leading-6"
          disabled={save.isPending}
          maxLength={4_000}
          onChange={(event) => {
            const summary = event.target.value;
            setDraft((current) => ({ ...current, summary }));
          }}
          placeholder={c("이 역할에서 찾는 사람을 짧게 적어 주세요.", "Describe in short who this role is looking for.")}
          value={draft.summary}
        />
      ) : shown.summary ? (
        <p className="whitespace-pre-wrap text-[14px] leading-6 text-neutral-primary">{shown.summary}</p>
      ) : null}

      {editing ? (
        <>
          <RoleBriefFields
            busy={save.isPending}
            dirty={dirty}
            draft={draft}
            onRequest={(request) => save.mutate({ request })}
            setDraft={setDraft}
          />
          <div className="mt-4 flex justify-end">
            <MuteButton
              disabled={save.isPending}
              onClick={() => {
                setEdited(null);
                setEditing(false);
              }}
              variant="transparent"
            >
              {c("닫기", "Close")}
            </MuteButton>
          </div>
          {dirty ? (
            <OrgUnsavedChangesBar
              canSave={!invalid}
              hasChanges={dirty}
              onCancel={() => setEdited(null)}
              onSave={() =>
                save.mutate({
                  brief: draft,
                  briefHash: editedHash ?? query.data?.briefHash ?? undefined,
                  summaryEdited: draft.summary !== (editStartSummary ?? server?.summary),
                })
              }
              pending={save.isPending}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="mt-8 pb-6">
            <RoleSectionHeading title={c("평가 기준", "Evaluation criteria")} />
            {shown.hardConditions.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {shown.hardConditions.map((condition) => (
                  <span className="rounded-md bg-bg-weak px-2.5 py-1 text-[13px]" key={condition.id}>
                    <span className="mr-1.5 text-[11px] text-neutral-soft">{c("필수", "Required")}</span>
                    {condition.label}
                  </span>
                ))}
              </div>
            ) : null}
            {shown.criteria.length ? (
              <div className="mt-3 grid gap-3">
                {shown.criteria.map((item) => (
                  <CriterionCard
                    criterion={item}
                    key={item.id ?? item.name}
                    label={criterionLevel(item) === "required" ? c("필수", "Required") : criterionLevel(item) === "nice" ? c("있으면 좋음", "Nice to have") : c("중요", "Important")}
                  />
                ))}
              </div>
            ) : !shown.hardConditions.length ? (
              <p className="mt-3 text-[13px] leading-5 text-neutral-muted">{c("평가 기준이 없어요.", "No evaluation criteria.")}</p>
            ) : null}
            {canManage ? (
              <div className="mt-8">
                <RoleReferenceInput
                  busy={references.isPending}
                  drafts={referenceDrafts}
                  onDraftsChange={setReferenceDrafts}
                  onRemove={(referenceId) => references.mutate({ action: "remove_reference", referenceId })}
                  onSubmit={(people) => references.mutate({ action: "add_references", people })}
                  recorded={shown.references}
                          />
              </div>
            ) : (
              <RoleReferenceList references={shown.references} />
            )}
          </div>
        </>
      )}
      </div>
    </OrgSection>
  );
}

/** One criterion as the 매칭 기준 tab shows it: name, level and what counts. */
function CriterionCard({
  criterion,
  label,
}: {
  criterion: RoleStartBriefView["criteria"][number];
  label?: string;
}) {
  return (
    <div className="rounded-md bg-bg-basement px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-primary">
        <BadgeCheck className="size-4 shrink-0 text-positive" />
        <span>{criterion.name}</span>
        {label || criterion.reference ? (
          <span className="font-normal text-neutral-soft">
            {[label, criterion.reference].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">{criterion.criteria}</p>
    </div>
  );
}
