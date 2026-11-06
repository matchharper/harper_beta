import { v5 as uuidv5 } from "uuid";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

// Explicit company interactions and server-confirmed billing outcomes.
// Candidate actions persisted in talent_progress keep their own history.
export const ORG_ACTION_LABELS = {
  org_billing_purchase_modal_opened: "결제 모달 열기",
  org_billing_purchase_modal_closed: "결제 모달 닫기",
  org_billing_checkout_submitted: "결제창 이동 요청",
  org_billing_checkout_returned: "결제창에서 복귀",
  org_billing_checkout_succeeded: "결제창 준비 완료",
  org_billing_checkout_failed: "결제창 준비 실패",
  org_billing_confirm_succeeded: "구매 슬롯 반영 확인",
  org_billing_confirm_pending: "구매 슬롯 반영 대기",
  org_billing_confirm_failed: "구매 슬롯 확인 실패",
  org_billing_portal_succeeded: "결제 관리 화면 준비 완료",
  org_billing_portal_failed: "결제 관리 화면 준비 실패",
  org_billing_cancel_succeeded: "슬롯 갱신 취소",
  org_billing_cancel_failed: "슬롯 갱신 취소 실패",
  org_billing_resume_succeeded: "슬롯 갱신 재개",
  org_billing_resume_failed: "슬롯 갱신 재개 실패",
  org_billing_assign_succeeded: "슬롯 역할 배정",
  org_billing_assign_failed: "슬롯 역할 배정 실패",
  org_billing_payment_paid: "구독 결제 완료",
  org_billing_payment_failed: "구독 결제 실패",
  org_billing_payment_action_required: "구독 결제 추가 인증 필요",
  org_resume_opened: "이력서·자료 열기",
  org_invitation_sent: "팀원 초대 발송",
  org_invitation_cancelled: "팀원 초대 취소",
  org_member_access_saved: "팀원 접근 범위 저장",
  org_team_created: "팀 생성",
  org_team_saved: "팀 설정 저장",
  org_team_deleted: "팀 삭제",
  org_member_left: "팀원 탈퇴",
  org_member_removed: "팀원 제거",
  org_member_authority_changed: "팀원 권한 변경",
  org_slack_connected: "Slack 연결",
  org_slack_disconnected: "Slack 연결 해제",
  org_slack_channel_connected: "Slack 채널 연결",
  org_slack_channel_created: "Slack 채널 생성 및 연결",
  org_slack_channel_disconnected: "Slack 채널 연결 해제",
} as const;
export type OrgActionType = keyof typeof ORG_ACTION_LABELS;
export const ORG_ACTION_TYPES = Object.keys(
  ORG_ACTION_LABELS
) as OrgActionType[];
export type OrgActionMetadata = {
  workspaceId: string;
  source?: string;
  interval?: string | null;
  quantity?: number | null;
  amount?: number;
  currency?: string;
  result?: string;
  invoiceId?: string;
  errorCode?: string;
  targetUserId?: string;
  targetLabel?: string;
  resourceId?: string;
  before?: string;
  after?: string;
  teamIds?: string[];
  memberIds?: string[];
  roleIds?: string[];
  talentId?: string;
  resumeFileName?: string | null;
  kind?: "storage" | "link" | "document";
};

// Never turn an already completed action into an API failure because logging failed.
export async function recordOrgAction(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  actorUserId: string;
  type: OrgActionType;
  metadata: OrgActionMetadata;
}) {
  try {
    const { error } = await args.admin.from("logs").insert({
      user_id: args.actorUserId,
      type: args.type,
      meta_data: args.metadata,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[org/action-log]", {
      type: args.type,
      workspaceId: args.metadata.workspaceId,
      error,
    });
    return false;
  }
}

// Pass and request decisions, with their reason and channel, are recorded in
// company_decision_events by pass/request_company_intro_v2 in the same
// transaction as the card change; Ops reads them there. A reason typed on the
// web Pass button is also shown to the company team as a candidate note, as
// before. The note is a convenience copy, so a failed write is only logged.
export async function recordOrgPassReasonNote(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  workspaceId: string;
  introCandidateId: string;
  reason?: string;
}) {
  const reason = args.reason?.trim();
  if (!reason) return;
  try {
    const { data: intro, error } = await (
      args.admin.from("company_intro_candidates" as any) as any
    )
      .select("id, role_id, talent_id, requested_by_company_user_id, status")
      .eq("id", args.introCandidateId)
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!intro?.requested_by_company_user_id || intro.status !== "passed") return;
    const { error: noteError } = await args.admin.from("talent_progress").upsert(
      {
        id: uuidv5(`org-company-intro-pass-reason:${intro.id}`, uuidv5.URL),
        kind: "org_note",
        role_id: intro.role_id,
        talent_id: intro.talent_id,
        company_user_id: intro.requested_by_company_user_id,
        text: reason,
        metadata: {
          org: true,
          workspaceId: args.workspaceId,
          introCandidateId: intro.id,
          decision: "pass",
        },
        open_to_talent: false,
        open_to_company: true,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (noteError) throw noteError;
  } catch (error) {
    console.error("[org/pass-reason-note]", {
      introCandidateId: args.introCandidateId,
      error,
    });
  }
}
