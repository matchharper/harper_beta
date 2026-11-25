/**
 * The job page's one screen: sign-up and the introduction request on one card.
 *
 * What is switched on lives here. At release only the A/B on the listed
 * company workspaces' role postings runs (half of their visitors see the one
 * screen). The other paths are built and stay off until that result is read.
 */
export const OFFICIAL_JOBS_ONESCREEN_EXPERIMENT = "official_jobs_onescreen_v1";
export const OFFICIAL_JOBS_ONESCREEN_COOKIE =
  "harper_official_jobs_onescreen_v1";

export type OfficialJobsOneScreenRollout = {
  /** Role postings of these company workspaces run the A/B. */
  abWorkspaceIds: readonly string[];
  /** Every open role posting shows the one screen, without an A/B. */
  allRolePostings: boolean;
  /** Multi-company postings (no role) show their one screen. */
  bundlePostings: boolean;
  /** A posting whose role closed shows the closed card instead of "not found". */
  closedRoleCard: boolean;
};

export const OFFICIAL_JOBS_ONESCREEN_ROLLOUT: OfficialJobsOneScreenRollout = {
  abWorkspaceIds: ["a9a8ba6e-7db1-4247-992f-7672cbf91286"],
  allRolePostings: false,
  bundlePostings: false,
  closedRoleCard: false,
};

/**
 * Marks the entry record (talent_activity_events official_jobs_signup_intent)
 * of a one-screen entry, whose summary says what the person agreed to on the
 * card and what was sent. Career reads it after onboarding too.
 */
export const OFFICIAL_JOBS_ONESCREEN_ENTRY_DOMAIN = "official_job_onescreen";

/** role: one open company role. bundle: a posting for several companies. closed: the role closed. */
export type OfficialJobsOneScreenKind = "role" | "bundle" | "closed";
export type OfficialJobsOneScreenArm = "A" | "B";

export type OfficialJobsOneScreenScope = {
  kind: OfficialJobsOneScreenKind;
  /** True: visitors are split by the cookie; only arm B sees the one screen. */
  abTest: boolean;
};

/** The linked role as the page loader read it; null for a posting without a role. */
export type OfficialJobsLinkedRoleState = {
  workspaceId: string | null;
  open: boolean;
};

export function decideOfficialJobsOneScreenScope(args: {
  roleId: string | null;
  linkedRole: OfficialJobsLinkedRoleState | null;
  rollout?: OfficialJobsOneScreenRollout;
}): OfficialJobsOneScreenScope | null {
  const rollout = args.rollout ?? OFFICIAL_JOBS_ONESCREEN_ROLLOUT;
  if (!args.roleId) {
    return rollout.bundlePostings ? { kind: "bundle", abTest: false } : null;
  }
  const role = args.linkedRole;
  if (!role) return null;
  if (!role.open) {
    return rollout.closedRoleCard ? { kind: "closed", abTest: false } : null;
  }
  if (rollout.allRolePostings) return { kind: "role", abTest: false };
  return role.workspaceId && rollout.abWorkspaceIds.includes(role.workspaceId)
    ? { kind: "role", abTest: true }
    : null;
}

export function parseOfficialJobsOneScreenArm(
  value: unknown
): OfficialJobsOneScreenArm | null {
  return value === "A" || value === "B" ? value : null;
}

/** The browser's one-screen arm; null when it never saw an A/B posting. */
export function readOfficialJobsOneScreenArm(cookieHeader: string) {
  const cookie = cookieHeader
    .split(";")
    .find((part) => part.trim().startsWith(`${OFFICIAL_JOBS_ONESCREEN_COOKIE}=`));
  return parseOfficialJobsOneScreenArm(cookie?.trim().split("=")[1]);
}

export function parseOfficialJobsOneScreenKind(
  value: unknown
): OfficialJobsOneScreenKind | null {
  return value === "role" || value === "bundle" || value === "closed"
    ? value
    : null;
}

/** One step on the one screen; `metadata.step` of a `job_onescreen_step` event. */
export type OfficialJobsOneScreenStep =
  | "view"
  | "open"
  | "google_click"
  | "safari_click"
  | "safari_left"
  | "safari_stayed"
  | "copy_link"
  | "email_code_sent"
  | "email_code_error"
  | "email_verified"
  | "name_done"
  | "material_done"
  | "consent_checked"
  | "submit_click"
  | "submit_ok"
  | "submit_error"
  | "member_continue"
  | "join_open"
  | "similar_open"
  | "similar_submit"
  | "similar_error";

/** The two boxes on the one screen: sign up and get introduced, or get similar postings by mail. */
export type OfficialJobsOneScreenPanel = "join" | "similar";

/**
 * Which box starts open. The PC card starts with Talk to Harper open (decided
 * 11/25); the phone page opens the box whose button was pressed on the
 * posting. A posting with only one box (a closed role, or the request channel
 * off) starts with that box open.
 */
export function initialOfficialJobsOneScreenPanel(args: {
  layout: "card" | "page";
  kind: OfficialJobsOneScreenKind;
  similarOpen: boolean;
  initialMode?: "join" | "similar";
}): OfficialJobsOneScreenPanel | null {
  if (args.kind === "closed") return args.similarOpen ? "similar" : null;
  if (args.layout === "page" && args.similarOpen && args.initialMode === "similar") return "similar";
  return "join";
}
