import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { BookmarkMinus } from "lucide-react";
import { useState } from "react";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { MuteButton } from "@/components/ui/button";
import { useOrgCandidateSave } from "@/hooks/org/useOrgCandidateSave";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  ReviewPipelineColumnShell,
  ReviewPipelineColumnHeader,
} from "@/components/review-pipeline/ReviewPipelinePrimitives";
import { buildOrgHref } from "@/lib/org/routes";
import { OrgCandidateCard } from "./OrgCandidateCard";

export function OrgSavedCandidates({
  column = true,
}: {
  /** A pipeline column; otherwise the content of the board's 저장함 tab. */
  column?: boolean;
}) {
  const { c } = useOrgLocale();
  const router = useRouter();
  const highlighted = new Set(
    String(router.query.highlight ?? "")
      .split(",")
      .filter(Boolean)
  );
  const { board, profileLabelsError, profileLabelsLoading } = useOrgJobsBoard();
  const { workspaceId } = useOrgJobsNavigation();
  const { permissions } = useOrgWorkspace();
  const save = useOrgCandidateSave();
  const [error, setError] = useState("");
  const items = (board?.items ?? [])
    .filter((item) => item.savedAt)
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!));
  const content = (
    <>
      {column ? (
        <ReviewPipelineColumnHeader
          compact
          countPlacement="end"
          label={c("저장함", "Saved")}
          count={items.length}
        />
      ) : null}
      <div className="min-h-0 space-y-1.5 overflow-y-auto px-1.5 py-1.5">
        {error && (
          <p role="alert" className="text-xs text-critical">
            {error}
          </p>
        )}
        {items.map((item) => {
          const name = item.talent.name || c("후보자", "Candidate");
          return (
            <div
              className={cn(
                "rounded-lg transition-shadow duration-300",
                highlighted.has(item.recommendationId) &&
                  "ring-2 ring-neutral-900 ring-offset-2 ring-offset-neutral-50"
              )}
              data-pipeline-highlight={
                highlighted.has(item.recommendationId) ? "" : undefined
              }
              key={item.recommendationId}
            >
              <OrgCandidateCard
                item={item}
                onSelect={() =>
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
                profileLabelsError={profileLabelsError}
                profileLabelsLoading={profileLabelsLoading}
                topRight={
                  permissions.canManageCandidates ? (
                    <MuteButton
                      aria-label={c("{name} 저장 해제", "Unsave {name}", {
                        name,
                      })}
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
                      size="sm"
                      title={c("저장 해제", "Unsave")}
                      variant="transparent"
                    >
                      <BookmarkMinus className="size-4" />
                    </MuteButton>
                  ) : null
                }
                withStatus={false}
              />
            </div>
          );
        })}
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
    <section aria-label={c("저장함", "Saved")} className="mt-4">
      {content}
    </section>
  );
}
