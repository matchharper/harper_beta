/**
 * 후보자 링크 (#1) cards: the candidate applied to this company's posting through Harper and, approving the
 * application, agreed to the link, so "연결 요청" for them is free and needs no candidate acceptance (the DB
 * records it from the consent: request_company_intro_for_career_v1, 20261117100000). The DB decides which cards
 * these are (company_intro_share_link_consent_v1); the screens and the Harper agent only show it.
 */

/** The one fact the company-side Harper agent gets for such a candidate. */
export const CANDIDATE_LINK_INTRO_FACT =
  "Candidate link (후보자 링크): this candidate applied to this company's posting through Harper and, when approving the application, already agreed to be connected. Requesting an intro is free (uses no Intro credit) and needs no candidate acceptance: Harper connects both sides by introduction email right away and the candidate moves to Connected. Never say the candidate still has to accept or that an Intro is used.";

const SHARE_LINK_FINGERPRINT_PREFIX = "share-link:";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** The ids among these intro cards that a candidate's own link made, with their consent still standing. */
export async function readCandidateLinkIntroIds(
  admin: unknown,
  rows: ReadonlyArray<{ id: string; role_fingerprint?: string | null }>
): Promise<Set<string>> {
  const ids = rows
    .filter((row) => String(row.role_fingerprint ?? "").startsWith(SHARE_LINK_FINGERPRINT_PREFIX))
    .map((row) => row.id);
  if (ids.length === 0) return new Set();
  const { data, error } = await (admin as RpcClient).rpc("company_intro_share_link_consent_v1", {
    p_intro_candidate_ids: ids,
  });
  // Display only (the DB decides the price and the acceptance): a failed read, or the function before its
  // migration, shows these cards as ordinary ones instead of breaking the list.
  if (error) {
    console.warn("[candidate-link-intro] consent read failed", error);
    return new Set();
  }
  return new Set(
    (Array.isArray(data) ? data : []).map((row: { intro_candidate_id?: unknown }) => String(row.intro_candidate_id ?? ""))
  );
}
