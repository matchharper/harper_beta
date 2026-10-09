/** User-authorized QA-channel transport for frozen local matching previews.
 * Uses the actual Work Object builder and postHarperSlackMessage. No company
 * DB writes or candidate-contact capability. Local candidate IDs have no actions.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as api from "../src/lib/org/slackApiRequest";
import * as channelCreation from "../src/lib/org/slackChannelCreation";
import { buildSlackCandidateEntity, type SlackCandidateCard } from "../src/lib/org/slackCandidateWorkObject";

async function main() {
const CHANNEL = "C0BULQ5K5EJ";
const TEAM = "T09ASGLN207";
const args = process.argv.slice(2);
const previewPath = path.resolve(args[0] || "");
const tokenWorkspaceId = args[1];
const registry = path.resolve("docs/evaluation/unified-talent-role-fit/runs");
if (!previewPath.startsWith(registry + path.sep) || !tokenWorkspaceId)
  throw new Error("Provide a private registered preview and QA token workspace ID");
const preview = JSON.parse(fs.readFileSync(previewPath, "utf8")) as {
  reviewed: boolean; locale: "ko" | "en";
  messages: Array<{ text: string; candidate?: SlackCandidateCard }>;
};
if (!preview.reviewed || !preview.messages.length || !["ko", "en"].includes(preview.locale))
  throw new Error("Only a qualitatively reviewed local preview may be sent");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } });
// Execute the native server helper without importing unrelated Next server-only
// dependencies into the standalone runner, matching the server-module test adapter.
const source = fs.readFileSync("src/lib/org/slackHarper.ts", "utf8");
const loaded = { exports: {} as any };
const dependencies: Record<string, unknown> = {
  "node:crypto": crypto, "./slackApiRequest": api, "./slackChannelCreation": channelCreation,
  "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
};
const omittedCards: unknown[] = [];
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: loaded, exports: loaded.exports, Buffer, URL, URLSearchParams, process, fetch, AbortSignal,
  console: { ...console, warn: (...values: unknown[]) => { omittedCards.push(values); console.warn(...values); } },
  require: (name: string) => dependencies[name] ?? {},
});
const native = loaded.exports;
const { data: installation, error } = await admin.from("company_slack_integrations")
  .select("bot_token_ciphertext,slack_team_id").eq("company_workspace_id", tokenWorkspaceId)
  .eq("status", "active").maybeSingle();
if (error || !installation || installation.slack_team_id !== TEAM)
  throw new Error("QA team installation guard failed");
const token = native.decryptHarperSlackToken(installation.bot_token_ciphertext);
const identity = await native.slackApi(token, "auth.test");
const channel = await native.slackApi(token, "conversations.info", { channel: CHANNEL });
const scopes = await native.getHarperSlackGrantedScopes(tokenWorkspaceId);
if (identity.team_id !== TEAM || channel.channel.id !== CHANNEL || channel.channel.is_shared ||
    !channel.channel.is_member || !["links:read", "links:write", "users:read", "users:read.email"].every(s => scopes.includes(s)))
  throw new Error("Authorized QA channel / card permission guard failed");
const receiptPath = previewPath + ".receipts.json";
const receipts: any[] = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : [];
for (const [index, message] of preview.messages.entries()) {
  if (receipts.some(row => row.index === index)) continue;
  const hash = crypto.createHash("sha256").update(`${previewPath}:${index}`).digest("hex");
  const messageId = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const result = await native.postHarperSlackMessage({ channelId: CHANNEL, token, text: message.text,
    clientMessageId: messageId,
    ...(message.candidate ? { entityMetadata: { entities: [buildSlackCandidateEntity({
      candidate: message.candidate, locale: preview.locale, canDecide: false,
    })] } } : {}),
  });
  if (result.channel !== CHANNEL || !result.ts) throw new Error("Unexpected Slack receipt destination");
  receipts.push({ index, channel: CHANNEL, ts: result.ts,
    url: `https://app.slack.com/archives/${CHANNEL}/p${result.ts.replace(".", "")}`,
    cardRequested: Boolean(message.candidate), result });
  fs.writeFileSync(receiptPath, JSON.stringify(receipts, null, 2), { mode: 0o600 });
}
fs.writeFileSync(previewPath + ".transport.json", JSON.stringify({
  channel: CHANNEL, nativeBuilder: "buildSlackCandidateEntity", nativePost: "postHarperSlackMessage",
  scopes, omittedCards, companyDatabaseWrites: false, candidateContact: false,
}, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ messages: receipts.length, cardFallbacks: omittedCards.length,
  url: receipts[0].url }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
