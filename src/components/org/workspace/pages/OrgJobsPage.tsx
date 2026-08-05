import { useMemo } from "react";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleOverview } from "@/components/org/OrgRoleOverview";
import { OrgRolePicker } from "@/components/org/OrgRolePicker";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { Tabs } from "@/components/ui/tabs";
import {
  OrgJobsProvider,
  useOrgJobsBoard,
  useOrgJobsCandidateActions,
  useOrgJobsDetail,
  useOrgJobsNavigation,
} from "@/hooks/org/useOrgJobs";

function OrgSelectedRoleContent() {
  const { boardQuery } = useOrgJobsBoard();
  const { getPendingStage } = useOrgJobsCandidateActions();
  const { activeView, changeView } = useOrgJobsNavigation();
  const pipelineSummary = useMemo(() => {
    let inProgress = 0;
    let pendingConnection = 0;
    let processStopped = 0;

    for (const item of boardQuery.data?.items ?? []) {
      const stage = getPendingStage(item) ?? item.stage;
      if (stage === "pending_connection") {
        pendingConnection += 1;
      } else if (stage === "process_stopped") {
        processStopped += 1;
      } else if (stage !== "archived") {
        inProgress += 1;
      }
    }

    return { inProgress, pendingConnection, processStopped };
  }, [boardQuery.data?.items, getPendingStage]);
  const countLabel = (count: number) =>
    boardQuery.isLoading ? "–" : String(count);

  return (
    <div className="space-y-7">
      <Tabs
        activeValue={activeView}
        aria-label="Role 화면"
        className="w-full max-w-[540px]"
        itemWidth="equal"
        items={[
          { label: "Role", value: "role" },
          {
            label: (
              <span className="flex flex-col items-center gap-0.5">
                <span>Pipeline</span>
                <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0 text-[11px] font-normal leading-4 text-neutral-soft">
                  <span>
                    {countLabel(pipelineSummary.pendingConnection)}명 연결 대기
                  </span>
                  <span>{countLabel(pipelineSummary.inProgress)}명 진행중</span>
                  <span>
                    {countLabel(pipelineSummary.processStopped)}명 프로세스 종료
                  </span>
                </span>
              </span>
            ),
            value: "pipeline",
          },
        ]}
        onValueChange={(value) =>
          changeView(value === "pipeline" ? "pipeline" : "role")
        }
        size="xlarge"
        variant="cards"
      />
      {activeView === "pipeline" && boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {activeView === "role" ? <OrgRoleOverview /> : <OrgPipeline />}
    </div>
  );
}

function OrgJobsMain() {
  const { boardQuery } = useOrgJobsBoard();
  const { activeRoleId } = useOrgJobsNavigation();
  const isAll = activeRoleId === "all";

  return (
    <div className="space-y-2">
      <OrgPageHeader title={<OrgRolePicker />} />
      {isAll && boardQuery.error instanceof Error ? (
        <OrgErrorState
          message={boardQuery.error.message}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {isAll ? (
        <OrgAllRolesOverview />
      ) : (
        <OrgSelectedRoleContent key={activeRoleId} />
      )}
    </div>
  );
}

function OrgJobsTalentDetail() {
  const { workspaceId } = useOrgJobsNavigation();
  const { activeDetailRecommendationId, activeDetailTalentId } =
    useOrgJobsDetail();

  return (
    <TalentDetailSimpleView
      key={[
        workspaceId,
        activeDetailRecommendationId,
        activeDetailTalentId,
      ].join(":")}
    />
  );
}

export function OrgJobsPage() {
  return (
    <OrgJobsProvider>
      <OrgJobsMain />
      <OrgJobsTalentDetail />
    </OrgJobsProvider>
  );
}
