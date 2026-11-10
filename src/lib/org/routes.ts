import { isSlotPurchase } from "@/lib/org/billing/compat";

export type OrgWorkspacePageId =
  | "home"
  | "onboarding"
  | "inbox"
  | "jobs"
  | "member"
  | "new-role"
  | "role"
  | "team"
  | "slots"
  | "billing"
  | "templates"
  | "settings"
  | "personal-settings"
  | "documents";

export type OrgJobsView = "pipeline" | "role";
/** The places on a role screen. `start` exists only while the role is a draft. */
export type OrgRoleTab =
  | "start"
  | "chat"
  | "inbox"
  | "pipeline"
  | "role"
  | "settings";
/** Inbox sub-tabs. `external` exists only where external sourcing is on. */
export type OrgRoleInboxStage = "pending_connection" | "company_intro" | "external";
/** A part of the 역할 정보 tab to scroll to. */
export type OrgRoleSection = "criteria";
export type OrgSettingsTab = "calendar";
export type OrgPipelineDisplay = "pipeline" | "board";

export type OrgRoleLocation = {
  tab: OrgRoleTab;
  inboxStage: OrgRoleInboxStage | null;
  review: "saved" | null;
  section: OrgRoleSection | null;
};

type QueryValue = string | string[] | undefined | null;

function queryText(value: QueryValue) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Where a role link opens. Links already sent (Slack, email, chat, to-dos)
 * keep working, so never drop a legacy value here:
 * - `tab=matching` opens 역할 정보 at 확인할 기준 (as does `#criteria`).
 * - `tab=external` and `review=external` open the inbox's 외부 후보, or the
 *   plain inbox where external sourcing is off.
 * - `tab=start` on a registered role opens the inbox.
 */
export function resolveOrgRoleLocation(
  query: {
    tab?: QueryValue;
    inboxStage?: QueryValue;
    review?: QueryValue;
    section?: QueryValue;
  },
  {
    externalEnabled,
    hash = "",
    isDraft,
  }: { externalEnabled: boolean; hash?: string; isDraft: boolean }
): OrgRoleLocation {
  const tab = queryText(query.tab);
  const review = queryText(query.review);
  const inboxStage = queryText(query.inboxStage);
  const criteria =
    queryText(query.section) === "criteria" || hash.replace(/^#/, "") === "criteria";
  const at = (
    next: OrgRoleTab,
    rest: Partial<Omit<OrgRoleLocation, "tab">> = {}
  ): OrgRoleLocation => ({
    tab: next,
    inboxStage: null,
    review: null,
    section: null,
    ...rest,
  });

  if (tab === "chat") return at("chat");
  if (tab === "settings") return at("settings");
  if (tab === "matching" || tab === "role" || (!tab && criteria)) {
    return at("role", {
      section: tab === "matching" || criteria ? "criteria" : null,
    });
  }
  // A draft opens on the guided start (questions → Brief → first three).
  if (isDraft) return at("start");
  if (tab === "pipeline") return at("pipeline");
  const external = tab === "external" || review === "external" || inboxStage === "external";
  if (external) {
    return at("inbox", { inboxStage: externalEnabled ? "external" : null });
  }
  // Anything else, `start` included, opens the inbox once the role is registered.
  return at("inbox", {
    inboxStage:
      inboxStage === "pending_connection" || inboxStage === "company_intro"
        ? inboxStage
        : null,
    review: review === "saved" ? "saved" : null,
  });
}

const ORG_PAGE_PATHS: Record<OrgWorkspacePageId, string> = {
  onboarding: "/org/onboarding",
  documents: "/org/documents",
  home: "/org/home",
  inbox: "/org/inbox",
  jobs: "/org/jobs",
  member: "/org/member",
  "new-role": "/org/new",
  role: "/org/role",
  settings: "/org/settings",
  "personal-settings": "/org/personal-settings",
  slots: "/org/slots",
  billing: "/org/billing",
  templates: "/org/templates",
  team: "/org/team",
};

export function buildOrgOrganizationCreationHref(sourceWorkspaceId: string) {
  return `/org/new?${new URLSearchParams({ create: "organization", orgId: sourceWorkspaceId })}`;
}

export function buildOrgHref(args: {
  detail?: {
    recommendationId?: string | null;
    roleId?: string | null;
    talentId?: string | null;
    workspaceId?: string | null;
  } | null;
  orgId?: string | null;
  inboxStage?: string | null;
  page?: OrgWorkspacePageId;
  roleId?: string | null;
  section?: OrgRoleSection | null;
  tab?: OrgRoleTab | OrgSettingsTab | null;
  view?: OrgJobsView | OrgPipelineDisplay | null;
}) {
  const params = new URLSearchParams();
  const orgId = args.orgId?.trim();
  const roleId = args.roleId?.trim();
  const detailTalentId = args.detail?.talentId?.trim();
  const detailRecommendationId = args.detail?.recommendationId?.trim();
  const detailRoleId = args.detail?.roleId?.trim();
  const detailWorkspaceId = args.detail?.workspaceId?.trim();
  if (orgId) params.set("orgId", orgId);
  if (
    roleId &&
    (args.page === "jobs" || args.page === "new-role" || args.page === "role")
  ) {
    params.set("roleId", roleId);
  }
  if (roleId && roleId !== "all" && args.page === "jobs") {
    const view =
      args.view === "pipeline" || args.view === "role" ? args.view : null;
    if (view) params.set("view", view);
  }
  if (roleId && args.page === "role" && args.tab) {
    params.set("tab", args.tab);
    const view =
      args.tab === "pipeline" &&
      (args.view === "pipeline" || args.view === "board")
        ? args.view
        : null;
    if (view) params.set("view", view);
    if (args.tab === "role" && args.section) params.set("section", args.section);
  }
  if (args.page === "settings" && args.tab === "calendar") {
    params.set("tab", args.tab);
  }
  if (
    args.inboxStage &&
    (args.page === "inbox" ||
      (args.page === "role" && args.tab === "inbox"))
  ) {
    params.set("inboxStage", args.inboxStage);
  }
  if (detailTalentId) params.set("talentId", detailTalentId);
  if (detailRecommendationId) {
    params.set("recommendationId", detailRecommendationId);
  }
  if (detailRoleId) params.set("detailRoleId", detailRoleId);
  if (detailWorkspaceId) params.set("detailWorkspaceId", detailWorkspaceId);
  const query = params.toString();
  const pathname = ORG_PAGE_PATHS[args.page ?? "home"];
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * `/org/inbox` was today's inbox: Home's 후보 with the same query (a list or a
 * role in it). Home opens on 소식, so the address names 후보.
 */
export function orgInboxHomeRedirect(query: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") params.append(key, item);
    }
  }
  if (!params.get("tab")) params.set("tab", "candidates");
  return `/org/home?${params.toString()}`;
}

/**
 * `/org/jobs` for every role is Home's 역할 now (the 역할 page moved under
 * Home). The workspace stays; role-page keys do not apply there.
 */
export function orgJobsHomeRedirect(query: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  const orgId = queryText(query.orgId);
  if (orgId) params.set("orgId", orgId);
  params.set("tab", "roles");
  return `/org/home?${params.toString()}`;
}

/**
 * `/org/jobs?roleId=…` is an older role link: it opens the role page, on the
 * pipeline when `view=pipeline`. Null for every role (see orgJobsHomeRedirect).
 */
export function orgJobsRoleRedirect(query: Record<string, QueryValue>) {
  const roleId = queryText(query.roleId);
  if (!roleId || roleId === "all") return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  params.set("roleId", roleId);
  if (params.get("view") === "pipeline") {
    params.set("tab", "pipeline");
    params.set("view", "pipeline");
  } else {
    params.delete("view");
    params.delete("tab");
  }
  return `/org/role?${params.toString()}`;
}

/**
 * Billing links that land on the slots inside /org/billing: `section=slots`,
 * the old `tab=slots|credits|subscription`, Stripe `checkout` returns and slot
 * purchases.
 */
export function orgBillingOpensSlots(query: Record<string, QueryValue>) {
  return (
    query.section === "slots" ||
    ["slots", "credits", "subscription"].includes(String(query.tab)) ||
    typeof query.checkout === "string" ||
    isSlotPurchase(query.purchase)
  );
}

/**
 * The old /org/slots page: the same query on /org/billing, at the slots.
 * Stripe checkouts started before the move still return there.
 */
export function orgSlotsRedirectQuery(query: Record<string, QueryValue>) {
  const next: Record<string, QueryValue> = { ...query, section: "slots" };
  delete next.tab;
  return next;
}

export function orgPageFromPath(pathname: string): OrgWorkspacePageId | null {
  return (Object.entries(ORG_PAGE_PATHS).find(([, path]) => path === pathname)?.[0] as OrgWorkspacePageId | undefined) ?? null;
}
