export type WorkspaceSignupState = {
  createdBy: string;
  companyConfirmedAt?: string;
  planSelectedAt?: string;
  plan?: "free" | "slot";
  researchStatus: "idle" | "pending" | "ready" | "failed";
  researchStartedAt?: string;
};
export type SignupCompany = {
  name: string;
  description: string;
  linkedinUrl: string;
  location?: string;
  totalFundingRaised?: string;
  mainInvestors?: string;
  lastFundingStage?: string;
  lastFundingRoundDescription?: string;
  sources: { title: string; url: string }[];
};
export type SignupEntry = {
  status:
    | "new"
    | "created"
    | "member"
    | "invited"
    | "invite_required"
    | "work_email_required";
  workspaceId?: string;
  domain?: string;
};
export function signupErrorMessage(error: unknown, locale: "ko" | "en") {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [string, string]> = {
    signup_invalid_company: [
      "회사명과 소개, LinkedIn 회사 페이지 주소를 확인해 주세요.",
      "Check the company name, description, and LinkedIn company page URL.",
    ],
    signup_work_email_required: [
      "인증된 회사 이메일로 로그인해 주세요. 개인 메일로는 새 회사를 만들 수 없어요.",
      "Sign in with a verified work email to create a company workspace.",
    ],
    signup_company_exists: [
      "이미 등록된 회사예요. 회사의 Harper 관리자에게 초대를 요청해 주세요.",
      "This company already has a workspace. Ask your Harper administrator for an invitation.",
    ],
    signup_payment_pending: [
      "결제를 아직 확인하고 있어요. 잠시 후 다시 확인해 주세요.",
      "Your payment is still being confirmed. Please check again shortly.",
    ],
    signup_paid_plan_active: [
      "이미 유료 구독이 있어요. 결제 확인을 눌러 이어서 진행해 주세요.",
      "A paid subscription is already active. Confirm payment to continue.",
    ],
    signup_company_required: [
      "회사 정보를 먼저 확인해 주세요.",
      "Confirm your company details first.",
    ],
    signup_setup_required: [
      "회사 정보와 요금제 선택을 완료해 주세요.",
      "Complete your company details and plan selection first.",
    ],
  };
  return (messages[code] ?? [
    "진행하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.",
    "We couldn’t complete that step. Your entries are saved; please try again.",
  ])[locale === "ko" ? 0 : 1];
}
