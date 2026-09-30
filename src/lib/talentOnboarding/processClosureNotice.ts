import type { PendingProcessClosureNotice } from "@/lib/talentOnboarding/tools";

export async function commitDeliveredProcessClosureNotices(args: {
  admin: any;
  notices: Iterable<PendingProcessClosureNotice>;
  talentId: string;
}) {
  for (const notice of args.notices) {
    const { error } = await args.admin.rpc(
      "commit_internal_process_closure_notice_v1",
      {
        p_metadata: {
          closureKind: notice.closureKind,
          companyName: notice.companyName,
          currentStage: notice.currentStage,
          deliveryState: "committed",
          roleName: notice.roleName,
          sentChannel: "career_chat",
        },
        p_recommendation_id: notice.recommendationId,
        p_talent_id: args.talentId,
        p_text: `Harper가 ${notice.companyName} - ${notice.roleName} 역할의 프로세스 종료 안내를 Career 대화에 포함하고 종료 상태로 전환했습니다.`,
        p_user_id: "harper",
      }
    );
    if (error) throw new Error(error.message ?? "Failed to record process closure notification");
  }
}
