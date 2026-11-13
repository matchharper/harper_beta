/**
 * #3 (관심 쌓인 고객사), pure parts shared by the server and the screen: the four /org numbers of a Role, how
 * Roles and companies are ordered, the links into /org, and the one sentence of the company mail that carries
 * the numbers (written by code so the mail never shows a number the model made up).
 */

/** A Role's numbers exactly as /org names them (readOrgDecisionCounts + the 외부 후보 tab). */
export type DemandCounts = {
  /** 연결을 기다리는 후보: candidates who said yes; the company only has to connect. */
  waiting: number;
  /** 연결을 요청할 후보: candidates Harper put forward; the company decides whether to request an intro. */
  toRequest: number;
  /** 외부 후보: people outside Harper shown on the Role, not passed by the company. */
  external: number;
  /** 저장: candidates the company saved for later (not in the two decision numbers). */
  saved: number;
};

export const EMPTY_DEMAND_COUNTS: DemandCounts = { waiting: 0, toRequest: 0, external: 0, saved: 0 };

export function sumDemandCounts(list: readonly DemandCounts[]): DemandCounts {
  return list.reduce((sum, item) => ({
    waiting: sum.waiting + item.waiting,
    toRequest: sum.toRequest + item.toRequest,
    external: sum.external + item.external,
    saved: sum.saved + item.saved,
  }), EMPTY_DEMAND_COUNTS);
}

/** The people waiting on the company: what the list is sorted by and what the mail is about. */
export function demandWeight(counts: DemandCounts) {
  return counts.waiting + counts.toRequest + counts.external;
}

export function hasDemand(counts: DemandCounts) {
  return demandWeight(counts) + counts.saved > 0;
}

/** Most people waiting first, then most saved. */
export function compareDemand(left: { counts: DemandCounts; name: string }, right: { counts: DemandCounts; name: string }) {
  return demandWeight(right.counts) - demandWeight(left.counts)
    || right.counts.saved - left.counts.saved
    || left.name.localeCompare(right.name);
}

const SITE = "https://matchharper.com";

function withUtm(url: URL) {
  url.searchParams.set("utm_source", "harper_gtm");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", "gtm_demand");
  return url.toString();
}

/** The Role in /org, opened on the list with people waiting (연결을 기다리는 first, else 연결을 요청할). */
export function orgRoleUrl(args: { workspaceId: string; roleId: string; counts: DemandCounts; utm?: boolean }) {
  const url = new URL("/org/role", SITE);
  url.searchParams.set("orgId", args.workspaceId);
  url.searchParams.set("roleId", args.roleId);
  url.searchParams.set("tab", "inbox");
  url.searchParams.set("inboxStage", args.counts.waiting > 0 ? "pending_connection" : "company_intro");
  return args.utm ? withUtm(url) : url.toString();
}

/** The company's Roles in /org. */
export function orgCompanyUrl(args: { workspaceId: string; utm?: boolean }) {
  const url = new URL("/org/jobs", SITE);
  url.searchParams.set("orgId", args.workspaceId);
  return args.utm ? withUtm(url) : url.toString();
}

/**
 * The sentence with the numbers, in the words /org uses; parts at 0 are left out. null when nobody is waiting
 * (then the mail has nothing to report).
 */
export function demandNumberSentence(args: { language: "ko" | "en"; roleName: string | null; counts: DemandCounts }) {
  const { counts } = args;
  if (args.language === "ko") {
    const parts = [
      counts.waiting ? `연결을 기다리는 후보 ${counts.waiting}명` : null,
      counts.toRequest ? `연결을 요청할 후보 ${counts.toRequest}명` : null,
      counts.external ? `외부 후보 ${counts.external}명` : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    const where = args.roleName ? `Harper의 ${args.roleName} Role에` : "Harper에 등록하신 Role에";
    return `지금 ${where} ${parts.join(", ")}이 있어요.`;
  }
  const people = (n: number) => `${n} ${n === 1 ? "candidate" : "candidates"}`;
  const parts = [
    counts.waiting ? `${people(counts.waiting)} waiting to connect` : null,
    counts.toRequest ? `${people(counts.toRequest)} ready for you to request an intro` : null,
    counts.external ? `${people(counts.external)} from outside Harper` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const where = args.roleName ? `your ${args.roleName} role on Harper has` : "your roles on Harper have";
  return `Right now ${where} ${list}.`;
}
