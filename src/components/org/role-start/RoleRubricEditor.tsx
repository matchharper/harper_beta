import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isProtectedNote } from "@/lib/org/roleStart/brief";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { RoleBriefFields } from "@/components/org/role-start/RoleBriefFields";
import { RoleSectionHeading } from "@/components/org/role-overview/RoleOverviewShared";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";
import { useToastStore } from "@/store/useToastStore";
import { expectOrgCriteriaRecheck } from "@/store/useOrgCriteriaRecheckStore";

/**
 * Rubric editing from the candidate board. Saving goes through the same
 * update path as the 매칭 기준 tab: a new Brief version, and candidates in the
 * inbox are reviewed again only for criteria that changed.
 */
export function RoleRubricEditor({
  onClose,
  onSaved,
  roleId,
  workspaceId,
}: {
  onClose: () => void;
  onSaved: () => void;
  roleId: string;
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const addToast = useToastStore((state) => state.add);
  const queryClient = useQueryClient();
  const queryKey = ["org", "role-rubric", workspaceId, roleId];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchWithInternalAuth<{ rubric: RoleStartBriefView; briefHash: string }>(
        `/api/org/role-start?roleId=${encodeURIComponent(roleId)}&workspaceId=${encodeURIComponent(workspaceId)}&include=rubric`
      ),
  });
  const server = query.data?.rubric ?? null;
  const serverJson = JSON.stringify(server);
  const [draft, setDraft] = useState<RoleStartBriefView | null>(server);
  useEffect(() => {
    if (serverJson !== "null") setDraft(JSON.parse(serverJson));
  }, [serverJson]);
  const save = useMutation({
    mutationFn: (body: { brief?: RoleStartBriefView; request?: string; briefHash?: string }) =>
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
      if (conflict) void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (result) => {
      setDraft(result.rubric);
      void queryClient.invalidateQueries({ queryKey });
      onSaved();
      if (result.judging) expectOrgCriteriaRecheck(roleId);
      addToast({
        message: result.judging
          ? c("기준을 바꿨어요. 바뀐 기준으로 후보를 다시 보고 있어요.", "Criteria updated. Reviewing candidates again for the changed criteria.")
          : c("기준을 바꿨어요.", "Criteria updated."),
        variant: "success",
      });
    },
  });

  if (query.isLoading || !draft) {
    return (
      <div className="flex min-h-24 items-center text-[13px] text-neutral-muted">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {c("불러오는 중입니다.", "Loading.")}
      </div>
    );
  }
  const dirty = JSON.stringify(draft) !== serverJson;
  const invalid =
    draft.criteria.some((item) => !item.name.trim() || !item.criteria.trim()) || Boolean(draft.otherNotes?.some(isProtectedNote));
  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <RoleSectionHeading
          description={c(
            "바뀐 기준은 앞으로 추천할 분에게 적용돼요. 지금 인박스 후보는 다시 보지만 빼지는 않아요.",
            "Changed criteria apply to people recommended from now on. Candidates in the inbox are reviewed again but not removed."
          )}
          title={c("기준 고치기", "Edit criteria")}
        />
        <MuteButton onClick={onClose} size="sm" variant="transparent">
          {c("닫기", "Close")}
        </MuteButton>
      </div>
      <RoleBriefFields
        busy={save.isPending}
        dirty={dirty}
        draft={draft}
        onRequest={(request) => save.mutate({ request })}
        setDraft={(update) =>
          setDraft((current) =>
            current === null ? current : typeof update === "function" ? update(current) : update
          )
        }
      />
      {dirty ? (
        <OrgUnsavedChangesBar
          canSave={!invalid}
          hasChanges={dirty}
          onCancel={() => setDraft(JSON.parse(serverJson))}
          // The draft follows the loaded Brief, so the loaded hash is the one it was edited from.
          onSave={() => save.mutate({ brief: draft, briefHash: query.data?.briefHash })}
          pending={save.isPending}
        />
      ) : null}
    </div>
  );
}
