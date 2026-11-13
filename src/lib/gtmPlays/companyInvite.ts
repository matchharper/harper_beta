/**
 * #2 회사 메일 → /org: the company opens Harper from the mail's button (/org?gtm=<mail id>), signs in, and
 * gets a Role made from the posting the mail was about, with the mail's Harper members evaluated for it and
 * put in "연결을 요청할 후보". Shared by the /org client and the server (no server imports here).
 */

/** Where the browser keeps the mail id from the button until the person is signed in with a workspace. */
export const GTM_COMPANY_INVITE_STORAGE_KEY = "harper:gtm-company-invite";

/** How long a company mail's button keeps working. */
export const GTM_COMPANY_INVITE_VALID_MS = 90 * 86_400_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGtmCompanyInviteId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * evaluating: Harper is reading the mail's people against the new Role (a few minutes).
 * publishing: evaluated; the people who fit are being written into "연결을 요청할 후보".
 * done: everyone the mail named was put in the list or cannot be shown now.
 * role_limit: the plan's active Role limit kept the Role a draft.
 */
export type GtmCompanyInviteStage = "evaluating" | "publishing" | "done" | "role_limit";

export type GtmCompanyInviteState = {
  mailId: string;
  roleId: string;
  roleName: string;
  stage: GtmCompanyInviteStage;
  /** People the mail showed. */
  total: number;
  /** Of them, now in this Role's candidate list. */
  published: number;
};

export type GtmCompanyInviteClaim =
  | { status: "claimed"; state: GtmCompanyInviteState }
  /** Not a company invite, expired, or its Role was deleted: continue as a normal visit. */
  | { status: "unavailable" }
  /** A member who cannot create Roles in this workspace. */
  | { status: "forbidden" }
  /** Harper's own staff: never creates a Role in the workspace they are looking at. */
  | { status: "internal" }
  /** This server does not write GTM changes (GTM_PLAYS_WRITES). */
  | { status: "off" };

/** What the sign-in screen says before sign-in: which posting and how many people. */
export type GtmCompanyInviteTeaser = {
  companyName: string | null;
  title: string;
  count: number;
  language: "ko" | "en";
};

/**
 * The person who claimed the invite in a workspace they just signed up for sees the Role first; onboarding
 * (company details, plan) is offered from a card instead of being required up front.
 */
export type GtmSignupInvite = {
  mailId: string;
  roleId: string;
  claimedBy: string;
  claimedAt: string;
};
