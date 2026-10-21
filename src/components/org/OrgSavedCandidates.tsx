import { useRouter } from "next/router";
import { Bookmark } from "lucide-react";
import { useOrgJobsBoard, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { MuteButton } from "@/components/ui/button";
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
  const items = (board?.items ?? [])
    .filter((item) => item.savedAt)
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!));
  const content = (
    <>
      <ReviewPipelineColumnHeader
        label={c("저장함", "Saved")}
        count={items.length}
      />
      <div className="space-y-2 p-3">
        {items.map((item) => (
          <article
            key={item.recommendationId}
            className="rounded-lg border border-neutral-1000-a05 p-3"
          >
            <MuteButton
              variant="transparent"
              className="mb-3 w-full justify-start p-0 text-left"
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
                  })
                )
              }
            >
              <Bookmark className="mr-2 size-3.5 shrink-0 text-neutral-soft" />
              <span className="truncate">
                {item.talent.name || c("후보자", "Candidate")}
              </span>
            </MuteButton>
            <p className="mb-3 truncate text-xs text-neutral-muted">
              {item.talent.headline || item.roleName}
            </p>
            <OrgCriteriaBars evaluations={item.criteriaEvaluations} />
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
    <ReviewPipelineColumnShell aria-label={c("저장함", "Saved")}>
      {content}
    </ReviewPipelineColumnShell>
  ) : (
    <section className="mb-6">{content}</section>
  );
}
