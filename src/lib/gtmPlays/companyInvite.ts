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
  /** Harper members the mail showed. */
  total: number;
  /** Of them, now in this Role's candidate list. */
  published: number;
  /**
   * #5 company mail (campaign agent): candidates who showed interest in the posting themselves and agreed to share a
   * nameless summary, and are not on Harper: they are in the Role's 외부 후보 as nameless cards (Shaun 11/21 17:01).
   * interestedOthers: how many more showed interest without agreeing. Missing on #2 mails. (Ashley's candidates on
   * Harper are counted in total and published like the mail's members.)
   */
  interested?: GtmInterestedCard[];
  interestedOthers?: number;
};

/**
 * Whether a gtm_mails row opens the company landing: a company mail that went out within GTM_COMPANY_INVITE_VALID_MS,
 * with its posting, and people to show: a #2 mail (campaign pool, sent) with Harper members, or a #5 company mail
 * (campaign agent, sent or taken by the provider) with members or "직접 관심" candidates.
 */
export function companyInviteMailOpens(row: {
  audience: string; campaign: string; status: string; provider_message_id?: string | null; created_at: string;
  posting: { title?: string | null } | null; talent_ids: string[] | null; company_mail?: unknown;
}, now: number): boolean {
  if (row.audience !== "company" || !row.posting?.title?.trim()) return false;
  if (!(now - Date.parse(row.created_at) <= GTM_COMPANY_INVITE_VALID_MS)) return false;
  const members = Boolean(row.talent_ids?.length);
  if (row.campaign === "pool") return row.status === "sent" && members;
  if (row.campaign !== "agent") return false;
  const wentOut = row.status === "sent" || (row.status === "sending" && Boolean(row.provider_message_id));
  const interested = interestedFromCompanyMail(row.company_mail);
  return wentOut && (members || interested.cards.length + interested.others > 0);
}

/** One "직접 관심" card: the mail's nameless lines (title · years · location, and one line of what they did). */
export type GtmInterestedCard = { line1: string; line2: string | null };
/** The same card with whom it is about (gtm_agent_people id): server side only, never sent to the screen. */
export type GtmInterestedPersonCard = GtmInterestedCard & { personId: string | null };

/** The #5 company mail facts the landing reads (gtm_mails.company_mail; agent/companyMail.ts CompanyMailFacts). */
export function interestedFromCompanyMail(facts: unknown): { cards: GtmInterestedPersonCard[]; others: number } {
  const value = facts && typeof facts === "object" ? facts as { interestedCards?: unknown; interestedPersonIds?: unknown } : {};
  const seen = new Set<string>();
  const cards = (Array.isArray(value.interestedCards) ? value.interestedCards : []).flatMap((card) => {
    const item = card && typeof card === "object" ? card as { personId?: unknown; line1?: unknown; line2?: unknown } : {};
    const line1 = typeof item.line1 === "string" ? item.line1.trim() : "";
    const key = typeof item.personId === "string" ? item.personId : line1;
    if (!line1 || seen.has(key)) return [];
    seen.add(key);
    return [{
      personId: typeof item.personId === "string" ? item.personId : null,
      line1: line1.slice(0, 120), line2: typeof item.line2 === "string" && item.line2.trim() ? item.line2.trim().slice(0, 200) : null,
    }];
  });
  const ids = new Set((Array.isArray(value.interestedPersonIds) ? value.interestedPersonIds : []).filter((id) => typeof id === "string"));
  return { cards, others: Math.max(0, ids.size - cards.length) };
}

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
