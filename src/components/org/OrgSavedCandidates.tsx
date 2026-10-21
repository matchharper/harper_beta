import { useRouter } from "next/router";
import { BookmarkMinus } from "lucide-react";
import { useState } from "react";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { CardButton, MuteButton } from "@/components/ui/button";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  ReviewPipelineColumnShell,
  ReviewPipelineColumnHeader,
} from "@/components/review-pipeline/ReviewPipelinePrimitives";
import { buildOrgHref } from "@/lib/org/routes";
import { OrgCriteriaBars } from "./OrgCriteriaBars";

export function OrgSavedCandidates({ column = true }: { column?: boolean }) {
  const { c } = useOrgLocale();
  const router = useRouter();
  const { board } = useOrgJobsBoard();
  const { workspaceId } = useOrgJobsNavigation();
  const { permissions } = useOrgWorkspace();
  const save = useOrgCandidateSave();
  const [error, setError] = useState("");
  const items = (board?.items ?? [])
    .filter((item) => item.savedAt)
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!));
  const content = (
    <>
      <ReviewPipelineColumnHeader
        compact
        countPlacement="end"
        label={c("저장함", "Saved")}
        count={items.length}
      />
      <div className="min-h-0 space-y-2 overflow-y-auto px-2.5 py-3">
        {error && (
          <p role="alert" className="text-xs text-critical">
            {error}
          </p>
        )}
        {items.map((item) => (
          <article
            key={item.recommendationId}
            className="relative isolate rounded-lg p-4"
          >
            <CardButton
              className="absolute inset-0 z-0 h-full border-neutral-1000-a05 p-0 shadow-none"
              aria-label={c("{name} 프로필 보기", "View {name}'s profile", {
                name: item.talent.name || c("후보자", "Candidate"),
              })}
              onClick={() =>
                void router.push(
                  buildOrgHref({
                    orgId: workspaceId,
                    page: "role",
                    roleId: item.roleId,
                    tab: "inbox",
                    inboxStage: item.stage,
                    detail: {
                      roleId: item.roleId,
                      talentId: item.talentId,
                      recommendationId: item.recommendationId,
                      workspaceId,
                    },
                  }) + "&review=saved"
                )
              }
            >
              <span className="sr-only">
                {item.talent.name || c("후보자", "Candidate")}
              </span>
            </CardButton>
            <div className="pointer-events-none relative z-10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-medium">
                  {item.talent.name || c("후보자", "Candidate")}
                </h3>
                {permissions.canManageCandidates && (
                  <MuteButton
                    className="pointer-events-auto"
                    variant="transparent"
                    size="sm"
                    aria-label={c("{name} 저장 해제", "Unsave {name}", {
                      name: item.talent.name || c("후보자", "Candidate"),
                    })}
                    title={c("저장 해제", "Unsave")}
                    disabled={save.isPending}
                    onClick={() => {
                      setError("");
                      save.mutate(
                        {
                          workspaceId,
                          roleId: item.roleId,
                          talentId: item.talentId,
                          recommendationId: item.recommendationId,
                          saved: false,
                        },
                        { onError: (error) => setError(error.message) }
                      );
                    }}
                  >
                    <BookmarkMinus className="size-4" />
                  </MuteButton>
                )}
              </div>
              <p className="mb-3 truncate text-xs text-neutral-muted">
                {item.talent.headline || item.roleName}
              </p>
              <div className="pointer-events-auto w-fit">
                <OrgCriteriaBars evaluations={item.criteriaEvaluations} />
              </div>
            </div>
          </article>
        ))}
        {!items.length && (
          <p className="py-6 text-center text-xs text-neutral-soft">
            {c("저장한 후보자가 없습니다.", "No saved candidates.")}
          </p>
        )}
      </div>
    </>
  );
  return column ? (
    <ReviewPipelineColumnShell
      aria-label={c("저장함", "Saved")}
      className="!flex !h-full !min-h-0 !w-[320px] !flex-col !border-0 !bg-transparent !ring-0"
    >
      {content}
    </ReviewPipelineColumnShell>
  ) : (
    <section className="mb-6">{content}</section>
  );
}
