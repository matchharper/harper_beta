import AppLayout from "@/components/layout/app";
import MatchMemoPanel from "@/components/match/MatchMemoPanel";
import CandidateProfileDetailPage from "@/components/profile/CandidateProfileDetailPage";
import { Loading } from "@/components/ui/loading";
import { useMatchCandidateDetail } from "@/hooks/useMatchWorkspace";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useRouter } from "next/router";

export default function MatchCandidateProfilePage() {
  const router = useRouter();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const candidId =
    typeof router.query.id === "string" ? router.query.id : undefined;
  const roleId =
    typeof router.query.roleId === "string" ? router.query.roleId : null;
  const workspaceId =
    typeof router.query.workspaceId === "string"
      ? router.query.workspaceId
      : null;
  const runId =
    typeof router.query.run === "string" ? router.query.run : undefined;

  const matchDetail = useMatchCandidateDetail({
    candidId,
    roleId,
    workspaceId,
  });
  const candidateDetail = useCandidateDetail(userId, candidId);

  return (
    <AppLayout initialCollapse={true}>
      <div className="flex min-h-screen w-full flex-row items-start justify-between">
        {matchDetail.data ? (
          <div className="w-[30%] min-w-[390px] flex-shrink-0 border-r border-white/10">
            <MatchMemoPanel
              detail={matchDetail.data}
              workspaceId={
                workspaceId ?? matchDetail.data.workspace.companyWorkspaceId
              }
            />
          </div>
        ) : null}

        {candidId && candidateDetail.data ? (
          <CandidateProfileDetailPage
            candidId={candidId}
            runId={runId}
            data={candidateDetail.data}
            isLoading={candidateDetail.isLoading}
            error={candidateDetail.error}
            showConnectionAction={false}
            showShortlistMemo={false}
          />
        ) : (
          <Loading
            isFullScreen={true}
            label="프로필을 불러오는 중입니다"
            className="text-white/65"
          />
        )}
      </div>
    </AppLayout>
  );
}
