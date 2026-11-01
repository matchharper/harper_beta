import "server-only";

import { after } from "next/server";
import postgres from "postgres";
import {
  decryptHarperSlackToken,
  localDevelopmentValue,
  slackApi,
} from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  createFixerPrGitHubClient,
  createFixerPrSecretsLoader,
  FIXER_PR_SLACK_TEAM_ID,
  routeFixerPrSlackAction,
  runFixerPrWebhook,
  type FixerPrSlackActionPayload,
  type FixerPrSlackCall,
  type FixerPrWebhookInput,
} from "./fixerPrSlack";

/** GitHub waits 10 seconds for a webhook response: one PR read, then the Slack work. */
const WEBHOOK_GITHUB_TIMEOUT_MS = 4_000;
const WEBHOOK_SLACK_BUDGET_MS = 5_000;
/** A press updates its card after the GitHub work, outside Slack's 3-second window. */
const CLICK_SLACK_BUDGET_MS = 8_000;
const RESPONSE_URL_TIMEOUT_MS = 5_000;

let client: ReturnType<typeof postgres> | undefined;
function fixerPrDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database unavailable");
  return (client ??= postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(url)
      ? { ssl: "require" as const }
      : {}),
  }));
}

const loadFixerPrSecrets = createFixerPrSecretsLoader({
  query: async (names) =>
    Array.from(
      await fixerPrDatabase().unsafe(
        "select name, decrypted_secret from vault.decrypted_secrets where name = any($1::text[])",
        [names]
      )
    ),
});

/** The Harper bot in the internal Slack workspace. Every active row for the team holds the same bot. */
async function loadFixerPrBot(): Promise<{ botUserId: string; token: string }> {
  const localToken = localDevelopmentValue("SLACK_HARPER_LOCAL_BOT_TOKEN");
  if (localToken) {
    const auth = await slackApi<{ ok: boolean; user_id?: string }>(localToken, "auth.test");
    return { botUserId: String(auth.user_id ?? "").trim(), token: localToken };
  }
  const { data, error } = await getSupabaseAdmin()
    .from("company_slack_integrations")
    .select("bot_token_ciphertext, slack_bot_user_id")
    .eq("slack_team_id", FIXER_PR_SLACK_TEAM_ID)
    .eq("status", "active")
    .not("bot_token_ciphertext", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.bot_token_ciphertext || !data.slack_bot_user_id)
    throw new Error("Harper Slack is not connected to the internal workspace");
  return {
    botUserId: String(data.slack_bot_user_id).trim(),
    token: decryptHarperSlackToken(data.bot_token_ciphertext),
  };
}

/** Slack calls with the Harper bot; the time budget starts at the first call. */
function fixerPrSlack(budgetMs: number): {
  botUserId: () => Promise<string>;
  call: FixerPrSlackCall;
} {
  let bot: ReturnType<typeof loadFixerPrBot> | undefined;
  let signal: AbortSignal | undefined;
  const load = () => (bot ??= loadFixerPrBot());
  return {
    botUserId: async () => (await load()).botUserId,
    call: async (method, body) => {
      const { token } = await load();
      return slackApi(token, method, body, (signal ??= AbortSignal.timeout(budgetMs)));
    },
  };
}

async function postFixerPrSlackResponse(
  responseUrl: string,
  body: Record<string, unknown>
) {
  const response = await fetch(responseUrl, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json; charset=utf-8" },
    method: "POST",
    signal: AbortSignal.timeout(RESPONSE_URL_TIMEOUT_MS),
  });
  const text = await response.text().catch(() => "");
  let rejected = false;
  try {
    rejected = (JSON.parse(text) as { ok?: unknown } | null)?.ok === false;
  } catch {
    // Slack may answer with plain text.
  }
  if (!response.ok || rejected)
    throw new Error(`Slack response_url ${response.status}: ${text.slice(0, 200)}`);
}

/** GitHub `pull_request` webhook for fixer PRs: posts or updates the #qa card. */
export function handleFixerPrWebhook(input: FixerPrWebhookInput) {
  const slack = fixerPrSlack(WEBHOOK_SLACK_BUDGET_MS);
  return runFixerPrWebhook(input, {
    botUserId: slack.botUserId,
    github: (token) =>
      createFixerPrGitHubClient({ timeoutMs: WEBHOOK_GITHUB_TIMEOUT_MS, token }),
    loadSecrets: loadFixerPrSecrets,
    slack: slack.call,
  });
}

/** [머지] / [머지 안 함] on a fixer PR card. Returns null for other actions. */
export function handleFixerPrSlackAction(payload: FixerPrSlackActionPayload) {
  return routeFixerPrSlackAction(payload, {
    github: (token) => createFixerPrGitHubClient({ token }),
    loadSecrets: loadFixerPrSecrets,
    respond: postFixerPrSlackResponse,
    schedule: (task) => after(task),
    slack: fixerPrSlack(CLICK_SLACK_BUDGET_MS).call,
  });
}
