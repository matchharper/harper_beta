import type { ExternalToolContext } from "../externalOperations/store";
import { fetchCareerJobPosting } from "../jobLinkImport";
import { JobPostingDetailsRequiredError } from "../jobPostingReadResult";
import type { ExaContentsClient } from "@/lib/tools/exaClient";

/** Role statuses that already mean the posting takes no applications. */
const ENDED_ROLE_STATUSES = new Set(["archived", "closed", "deleted", "ended", "expired", "inactive"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RoleRow = { role_id: string; name: string | null; status: string | null; is_expired: boolean | null; external_jd_url: string | null };

/**
 * Before a new preparation opens a browser, checks whether the posting is closed, so a closed posting costs seconds
 * instead of a browser run. Closed means the role is already ended in Harper (0 of 9 runs on such roles submitted,
 * 11/12-26), or the same read as saving a found posting: HTTP 404/410 or clear closed copy (jobLinkImport
 * closedReason). A read that fails for any other reason never blocks the preparation. Returns the fact for the model,
 * or null when the posting may be open.
 */
export async function closedPostingBeforePreparation(
  context: Pick<ExternalToolContext, "admin">,
  input: { url?: string; role_refs?: string[] },
  options: { exa?: ExaContentsClient; fetcher?: typeof fetch } = {}
): Promise<string | null> {
  const roleIds = (input.role_refs ?? []).filter(id => UUID.test(id));
  let roles: RoleRow[] = [];
  if (roleIds.length) {
    const { data, error } = await (context.admin.from as any)("company_roles")
      .select("role_id,name,status,is_expired,external_jd_url").in("role_id", roleIds);
    if (!error && Array.isArray(data)) roles = data as RoleRow[];
  }
  const ended = roles.find(role => role.is_expired === true || ENDED_ROLE_STATUSES.has(String(role.status ?? "").toLowerCase()));
  if (ended)
    return `Not started: role ${ended.role_id}${ended.name ? ` (${ended.name})` : ""} is already closed in Harper. No browser was opened.`;
  // The role's own posting page first: the run's URL may be an application form or a sign-in page.
  const url = roles.find(role => role.external_jd_url)?.external_jd_url ?? input.url;
  if (!url) return null;
  try {
    const exa = options.exa ?? (process.env.EXA_API_KEY?.trim()
      ? (await import("@/lib/tools/exaClient")).getExaClient() : undefined);
    const draft = await fetchCareerJobPosting({ url, exa, fetcher: options.fetcher });
    return draft.closedReason
      ? `Not started: the posting at ${url} is closed (${draft.closedReason}). No browser was opened.`
      : null;
  } catch (error) {
    // Unreadable is not closed, except that any read returned 404 or 410 (the same rule as a readable page).
    const gone = error instanceof JobPostingDetailsRequiredError
      ? error.failures.find(failure => failure.httpStatus === 404 || failure.httpStatus === 410) : undefined;
    return gone
      ? `Not started: the posting at ${url} is closed (${gone.stage} returned HTTP ${gone.httpStatus}). No browser was opened.`
      : null;
  }
}
