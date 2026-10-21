export type OrgHomeActivityKind =
  | "intro_sent"
  | "pending_connection"
  | "intro_accepted"
  | "candidate_message"
  | "candidate_response"
  | "company_question"
  | "meeting_requested"
  | "meeting_confirmed";
export type OrgHomeActivity = {
  id: string;
  kind: OrgHomeActivityKind;
  createdAt: string;
  text: string;
  talentId: string;
  talentName: string;
  recommendationId: string;
  roleId: string;
  roleName: string;
  meetingStartsAt?: string | null;
};
