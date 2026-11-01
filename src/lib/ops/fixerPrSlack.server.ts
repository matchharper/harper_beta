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

/** GitHub waits 10 seconds for a webhook response; Slack work must end before. */
const WEBHOOK_SLACK_BUDGET_MS = 8_000;
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
async function loadFixerPrBotToken() {
  const localToken = localDevelopmentValue("SLACK_HARPER_LOCAL_BOT_TOKEN");
  if (localToken) return localToken;
  const { data, error } = await getSupabaseAdmin()
    .from("company_slack_integrations")
    .select("bot_token_ciphertext")
    .eq("slack_team_id", FIXER_PR_SLACK_TEAM_ID)
    .eq("status", "active")
    .not("bot_token_ciphertext", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.bot_token_ciphertext)
    throw new Error("Harper Slack is not connected to the internal workspace");
  return decryptHarperSlackToken(data.bot_token_ciphertext);
}

function fixerPrSlackCaller(signal: AbortSignal): FixerPrSlackCall {
  let token: Promise<string> | undefined;
  return async (method, body) =>
    slackApi(await (token ??= loadFixerPrBotToken()), method, body, signal);
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
  return runFixerPrWebhook(input, {
    loadSecrets: loadFixerPrSecrets,
    slack: fixerPrSlackCaller(AbortSignal.timeout(WEBHOOK_SLACK_BUDGET_MS)),
  });
}

/** [머지] / [머지 안 함] on a fixer PR card. Returns null for other actions. */
export function handleFixerPrSlackAction(payload: FixerPrSlackActionPayload) {
  return routeFixerPrSlackAction(payload, {
    github: (token) => createFixerPrGitHubClient({ token }),
    loadSecrets: loadFixerPrSecrets,
    respond: postFixerPrSlackResponse,
    schedule: (task) => after(task),
  });
}
