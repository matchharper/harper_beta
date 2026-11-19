import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

/**
 * Test talent accounts (`talent_test_accounts`) never reach companies, the team's
 * Slack or real recipients. The database pins their sharing and background work;
 * these helpers cover the checks that live in application code.
 */
type UntypedClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    }>;
  };
};

const CACHE_MS = 60_000;
const accountCache = new Map<string, { value: boolean; expiresAt: number }>();
let emailCache: { value: string[]; expiresAt: number } | null = null;

function admin() {
  return getTalentSupabaseAdmin() as unknown as UntypedClient;
}

export async function isTestTalentAccount(userId: string | null | undefined) {
  const id = userId?.trim();
  if (!id) return false;
  const cached = accountCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { data, error } = await admin().rpc("is_talent_test_account", {
    p_user_id: id,
  });
  if (error) throw new Error(`Test account check failed: ${error.message}`);
  const value = data === true;
  accountCache.set(id, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

/** Emails of test accounts, for analytics that exclude users by email term. */
export async function listTestTalentAccountEmails() {
  if (emailCache && emailCache.expiresAt > Date.now()) return emailCache.value;
  const { data, error } = await admin()
    .from("talent_test_accounts")
    .select("email");
  if (error) throw new Error(`Test account list failed: ${error.message}`);
  const value = (data ?? [])
    .map((row) => String(row.email ?? "").trim().toLowerCase())
    .filter(Boolean);
  emailCache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

export const TEST_ACCOUNT_OUTWARD_ACTION_REFUSAL =
  "This is a Harper test account, so nothing was sent, submitted or scheduled outside Harper. Tell the user the action was prepared but not carried out for that reason.";

// RFC 2606/6761 reserved names never deliver mail. Test accounts use them.
const RESERVED_MAIL_TLDS = ["test", "invalid", "example", "localhost"];

export function isUndeliverableEmail(email: string | null | undefined) {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  const tld = domain.split(".").pop() ?? "";
  return RESERVED_MAIL_TLDS.includes(tld);
}
