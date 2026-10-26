/**
 * Local, single-recipient phone smoke runner. No HTTP listener or production deploy.
 * pnpm phone:check validates the configured account/conversation and Live config.
 * pnpm phone:test-call explicitly dials CLAWOPS_TEST_TO once, with a 3-minute cap.
 * Credentials/recipient/identity live only in ignored, owner-readable .env.clawops.local.
 * This is an operator-authorized test binding, not a signup phone-verification flow.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ClawOps } from "@teamlearners/clawops";
import { ClawOpsAgent, type CallSession } from "@teamlearners/clawops/agent";
import WebSocket from "ws";
import { NextRequest } from "next/server";
import { LivePhoneSession } from "../src/lib/career/phone/LivePhoneSession";

async function main() {
  process.umask(0o077);
  process.loadEnvFile(".env.local");
  process.loadEnvFile(".env.clawops.local");
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--call"].includes(mode)) throw new Error("Use --check or --call");
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const userId = required("CLAWOPS_TEST_USER_ID");
  const email = required("CLAWOPS_TEST_USER_EMAIL");
  const conversationId = required("CLAWOPS_TEST_CONVERSATION_ID");
  const to = required("CLAWOPS_TEST_TO");
  const from = required("CLAWOPS_FROM");
  const maxSeconds = Number(process.env.CLAWOPS_TEST_MAX_SECONDS ?? 180);
  if (!Number.isInteger(maxSeconds) || maxSeconds < 30 || maxSeconds > 180) throw new Error("Test duration must be 30–180 seconds");
  if (!/^0\d{8,10}$/.test(to) || !/^0\d{8,10}$/.test(from)) throw new Error("Expected configured Korean phone numbers");

  const { getTalentSupabaseAdmin, fetchTalentSetting } = await import("../src/lib/talentOnboarding/server");
  const { getCareerRealtimeToolCandidates, resolveCareerRealtimeTools } = await import("../src/lib/career/llmTools");
  const { buildCareerRealtimeSessionInstructions } = await import("../src/lib/career/realtimeInstructions");
  const { buildCareerLiveSessionConfig } = await import("../src/lib/career/liveSessionConfig.server");
  const { saveCareerTurnRequest } = await import("../src/lib/career/phone/saveCareerTurnRequest.server");
  const { executeCareerToolRequest } = await import("../src/lib/career/phone/executeCareerToolRequest.server");
  const { wrapupCareerCallRequest } = await import("../src/lib/career/phone/wrapupCareerCallRequest.server");
  const { insertLiveLlmUsageLog } = await import("../src/lib/llm/usageLogging");
  const admin = getTalentSupabaseAdmin();
  const [{ data: identity, error: identityError }, conversation, setting] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("talent_conversations").select("id,user_id").eq("id", conversationId).eq("user_id", userId).maybeSingle(),
    fetchTalentSetting({ admin, userId }),
  ]);
  if (identityError || !identity.user || identity.user.email !== email || conversation.error || !conversation.data) throw new Error("Configured test identity and conversation ownership did not match");
  const user = identity.user;
  const client = new ClawOps({ apiKey: required("CLAWOPS_API_KEY"), accountId: required("CLAWOPS_ACCOUNT_ID"), maxRetries: 0 });
  const numbers = await client.numbers.list();
  if (!numbers.some(number => String(number.number).replace(/\D/g, "") === from)) throw new Error("Configured caller number is not owned by this ClawOps account");
  const locale = setting?.preferred_locale ?? "ko";
  const candidates = getCareerRealtimeToolCandidates(locale);
  const plan = await buildCareerRealtimeSessionInstructions({ conversationId, userId, preferredLocale: locale, timeZone: "Asia/Seoul", toolNames: candidates.map(tool => tool.name) });
  const selection = resolveCareerRealtimeTools({ candidateTools: candidates, enabledToolNames: plan.enabledToolNames, preferredLocale: locale });
  const config = buildCareerLiveSessionConfig({ openingInstruction: "", responseLocale: locale, isMockInterview: false, onboardingContext: plan.liveOnboardingContext, backendInstructions: plan.liveInstructions, tools: selection.tools });
  if (config.model !== "gpt-live-1") throw new Error("Phone trial requires the existing gpt-live-1 config");
  const background = new Set<Promise<void>>();
  const backgroundErrors: string[] = [];
  const runtime = {
    getUser: async () => user,
    scheduleAfter: (task: () => Promise<void>) => {
      const pending = Promise.resolve().then(task).catch(error => { backgroundErrors.push(String(error)); }).finally(() => background.delete(pending));
      background.add(pending);
    },
  };
  const request = (path: string, body: Record<string, unknown>) => new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-time-zone": "Asia/Seoul" },
    body: JSON.stringify({ conversationId, locale, timeZone: "Asia/Seoul", ...body }),
  });
  const forbidden = await executeCareerToolRequest(request("/api/talent/tool/execute", { conversationId: randomUUID(), name: selection.tools[0]?.name, channel: "voice" }), runtime);
  if (forbidden.status !== 404) throw new Error("Tool ownership guard failed preflight");
  console.log(JSON.stringify({ type: "preflight.ok", model: config.model, backendModel: config.delegation.responses.model, toolCount: selection.tools.length, userId, conversationId, from, to: `***${to.slice(-4)}`, onboardingCompleted: setting?.is_onboarding_done, maxSeconds }));
  if (mode !== "--call") {
    const socket = new WebSocket("wss://api.openai.com/v1/live/sessions", { headers: { Authorization: `Bearer ${required("OPENAI_API_KEY")}` } });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { socket.terminate(); reject(new Error("Live preflight timed out")); }, 20_000);
        socket.on("open", () => socket.send(JSON.stringify({ type: "session.start", session: { ...config, audio: { ...config.audio, format: { type: "audio/pcmu", rate: 8000 } } } })));
        socket.on("error", error => { clearTimeout(timeout); reject(error); });
        socket.on("message", data => {
          const event = JSON.parse(data.toString());
          if (event.type === "error") { clearTimeout(timeout); reject(new Error(event.error?.message)); }
          if (event.type === "session.started") {
            console.log(JSON.stringify({ type: "live.preflight.ready", model: event.session.model }));
            socket.send(JSON.stringify({ type: "session.close" }));
          }
          if (event.type === "session.closed") { clearTimeout(timeout); resolve(); }
        });
      });
    } finally { socket.close(); }
    return;
  }

  const callSessionId = randomUUID();
  const runDir = resolve(".local/clawops-phone", callSessionId);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const audit = (event: Record<string, unknown>) => {
    appendFileSync(resolve(runDir, "events.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });
    const { text: _text, output: _output, ...summary } = event;
    console.log(JSON.stringify(summary));
  };
  writeFileSync(resolve(runDir, "manifest.json"), JSON.stringify({ callSessionId, userId, conversationId, model: config.model, backendModel: config.delegation.responses.model, configSha256: createHash("sha256").update(JSON.stringify(config)).digest("hex"), tools: selection.tools.map(tool => tool.name), startedAt: new Date().toISOString() }, null, 2));
  let call: CallSession | undefined;
  const session = new LivePhoneSession({
    config, apiKey: required("OPENAI_API_KEY"), userId,
    onEvent: audit,
    onTurn: async turn => {
      const response = await saveCareerTurnRequest(request("/api/talent/chat/save", { ...turn, isCallMode: true }), runtime);
      const payload = await response.json();
      if (!response.ok) throw new Error(`Transcript save failed: ${response.status} ${JSON.stringify(payload)}`);
      audit({ type: "turn.saved", userMessageId: payload.userMessage?.id, assistantMessageId: payload.assistantMessage?.id });
      return payload;
    },
    onTool: async tool => {
      let args: Record<string, unknown>;
      try { args = JSON.parse(tool.arguments || "{}"); } catch { args = { _raw: tool.arguments }; }
      const response = await executeCareerToolRequest(request("/api/talent/tool/execute", { channel: "voice", name: tool.name, arguments: args, toolCallId: tool.callId }), runtime);
      const payload = await response.json();
      audit({ type: "tool.executed", name: tool.name, callId: tool.callId, status: response.status, output: payload });
      return typeof payload.modelOutput === "string" ? payload.modelOutput : JSON.stringify(payload);
    },
    onUsage: async (kind, event) => {
      const seconds = event.usage?.seconds;
      await insertLiveLlmUsageLog({
        audioSeconds: typeof seconds === "number" ? seconds : null,
        model: kind === "audio" ? config.model : config.delegation.responses.model,
        response: kind === "delegation" ? { usage: event.response?.usage } : undefined,
        usageKind: kind,
        meta: { callSessionId, conversationId, userId, responseId: event.response?.id ?? null, status: event.response?.status ?? "closed" },
      });
      audit({ type: "usage.saved", kind, seconds, usage: event.response?.usage ?? event.usage });
    },
  });
  const agent = new ClawOpsAgent({ from, session, recording: false, builtinTools: [], prewarmEnabled: false });
  agent.onIncoming(async incoming => { await incoming.reject({ reason: "busy" }); });
  agent.on("call_start", () => {
    audit({ type: "call.answered" });
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => {
      audit({ type: "call.test_limit", maxSeconds });
      if (call) void client.calls.update(call.callId, { status: "completed" }).catch(error => audit({ type: "hangup.error", message: String(error) }));
    }, maxSeconds * 1000);
  });
  agent.on("call_failed", (...args: unknown[]) => audit({ type: "call.failed", detail: String(args[0]) }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let talkTimer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = () => { audit({ type: "call.interrupted" }); if (call) void client.calls.update(call.callId, { status: "completed" }); };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  try {
    await agent.connect();
    call = await agent.call(to, { timeout: 40 });
    audit({ type: "call.dialed", callId: call.callId, callSessionId, runDir });
    timer = setTimeout(() => {
      audit({ type: "call.test_limit", maxSeconds });
      void client.calls.update(call!.callId, { status: "completed" });
    }, (maxSeconds + 40) * 1000);
    await call.wait();
    await session.stop();
    const result = await client.calls.get(call.callId);
    audit({ type: "call.finished", callId: call.callId, status: result.status, duration: result.duration });
    if (session.startedAt && session.transcript.length) {
      const response = await wrapupCareerCallRequest(request("/api/talent/chat/call-wrapup", {
        callId: callSessionId, callSessionId,
        transcript: session.transcript,
        durationSeconds: result.duration ?? Math.round(call.duration),
        startedAt: session.startedAt, endedAt: new Date().toISOString(),
        forceCompleteOnboarding: session.completeOnboarding,
        onboardingCompletedAtStart: Boolean(setting?.is_onboarding_done),
      }), runtime);
      const payload = await response.json();
      writeFileSync(resolve(runDir, "wrapup.json"), JSON.stringify(payload, null, 2));
      audit({ type: "wrapup.saved", status: response.status, documentId: payload.callNoteDocument?.id, messageId: payload.followUpMessage?.id, skipped: payload.skipped });
      if (!response.ok) throw new Error(`Call wrapup failed: ${response.status}`);
    }
    while (background.size) await Promise.all([...background]);
    writeFileSync(resolve(runDir, "result.json"), JSON.stringify({ provider: result, transcript: session.transcript, errors: session.errors, backgroundErrors }, null, 2));
    if (session.errors.length || backgroundErrors.length) throw new Error("Call finished with errors; inspect the private run record");
  } finally {
    clearTimeout(timer);
    clearTimeout(talkTimer);
    if (call && call.status !== "ended") await client.calls.update(call.callId, { status: "completed" }).catch(() => undefined);
    await session.stop();
    await agent.disconnect();
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
