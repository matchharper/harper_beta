/** Operator-attended 1:1 pilot. No production endpoint, scheduler or deployment. */
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { WebSocketServer, WebSocket } from "ws";
import { NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { LivePhoneSession } from "../src/lib/career/phone/LivePhoneSession";
import { RecallMeetClient, recallBotBody, googleMeetUrl, calendarInvitation } from "../src/lib/career/meet/providers";

async function main() {
  process.umask(0o077);
  for (const file of [".env.local", ".env.meet.local"]) if (existsSync(file)) process.loadEnvFile(file);
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--run"].includes(mode)) throw new Error("Use --check or --run");
  const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; };
  const region = required("RECALL_REGION");
  const recall = new RecallMeetClient(required("RECALL_API_KEY"), region);
  const email = required("MEET_TEST_EMAIL");
  const timeZone = process.env.MEET_TIME_ZONE ?? "Asia/Seoul";
  new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
  const { getTalentSupabaseAdmin, fetchTalentSetting } = await import("../src/lib/talentOnboarding/server");
  const admin = getTalentSupabaseAdmin();
  const account = await admin.from("talent_users").select("user_id").eq("email", email).is("deleted_at", null).single();
  if (account.error || !account.data) throw new Error("Test email must identify exactly one Harper account");
  const userId = account.data.user_id;
  const { data: identity, error: identityError } = await admin.auth.admin.getUserById(userId);
  if (identityError || !identity.user || identity.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Harper identity mismatch");
  const user = identity.user;
  let query = admin.from("talent_conversations").select("id,user_id").eq("user_id", userId);
  const configuredConversation = process.env.MEET_TEST_CONVERSATION_ID;
  if (configuredConversation) query = query.eq("id", configuredConversation);
  const conversation = await query.order("created_at", { ascending: false }).limit(1).single();
  if (conversation.error || !conversation.data) throw new Error("No owned Career conversation found");
  const conversationId = conversation.data.id;
  const setting = await fetchTalentSetting({ admin, userId });
  const locale = setting?.preferred_locale ?? "ko";
  const authCheck = await fetch(`https://${region}.recall.ai/api/v1/bot/?limit=1`, { headers: { Authorization: `Token ${required("RECALL_API_KEY")}` }, signal: AbortSignal.timeout(10_000) });
  if (!authCheck.ok) throw new Error(`Recall authentication failed (${authCheck.status})`);
  console.log(JSON.stringify({ type: "preflight.ok", region, email, conversationId, model: "gpt-live-1" }));
  if (mode === "--check") return;
  if (!process.stdin.isTTY) throw new Error("This pilot requires an operator terminal to verify the participant before starting");
  const publicUrl = new URL(required("MEET_PUBLIC_URL"));
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw new Error("MEET_PUBLIC_URL must be an HTTPS origin");
  const port = Number(process.env.MEET_PORT ?? 8791);
  const maxSeconds = Number(process.env.MEET_MAX_SECONDS ?? 600);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(maxSeconds) || maxSeconds < 30 || maxSeconds > 1800) throw new Error("Invalid port or duration (30–1800 seconds)");
  const runId = randomUUID();
  const runDir = resolve(".local/meet-pilot", runId);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const audit = (event: Record<string, unknown>) => appendFileSync(resolve(runDir, "events.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });
  const errors: string[] = [];
  const fail = (error: unknown) => { errors.push(String(error)); audit({ type: "error", message: String(error) }); };
  let resolveDone!: () => void;
  const done = new Promise<void>(resolve => { resolveDone = resolve; });
  let stopping = false;
  const stop = () => { stopping = true; resolveDone(); };
  const { getCareerRealtimeToolCandidates, resolveCareerRealtimeTools } = await import("../src/lib/career/llmTools");
  const { buildCareerRealtimeSessionInstructions } = await import("../src/lib/career/realtimeInstructions");
  const { buildCareerLiveSessionConfig } = await import("../src/lib/career/liveSessionConfig.server");
  const { saveCareerTurnRequest } = await import("../src/lib/career/phone/saveCareerTurnRequest.server");
  const { executeCareerToolRequest } = await import("../src/lib/career/phone/executeCareerToolRequest.server");
  const { wrapupCareerCallRequest } = await import("../src/lib/career/phone/wrapupCareerCallRequest.server");
  const { insertLiveLlmUsageLog } = await import("../src/lib/llm/usageLogging");
  const candidates = getCareerRealtimeToolCandidates(locale);
  const plan = await buildCareerRealtimeSessionInstructions({ conversationId, userId, preferredLocale: locale, timeZone, toolNames: candidates.map(tool => tool.name) });
  const selection = resolveCareerRealtimeTools({ candidateTools: candidates, enabledToolNames: plan.enabledToolNames, preferredLocale: locale });
  const config = buildCareerLiveSessionConfig({ openingInstruction: "", responseLocale: locale, isMockInterview: false, onboardingContext: plan.liveOnboardingContext, backendInstructions: plan.liveInstructions, tools: selection.tools });
  const background = new Set<Promise<void>>();
  const runtime = { getUser: async () => user, scheduleAfter: (task: () => Promise<void>) => {
    const pending = Promise.resolve().then(task).catch(fail).finally(() => background.delete(pending));
    background.add(pending);
  } };
  const request = (path: string, body: Record<string, unknown>) => new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-time-zone": timeZone },
    body: JSON.stringify({ ...body, conversationId, locale, timeZone }),
  });
  const token = randomBytes(32).toString("hex");
  let audioSocket: WebSocket | undefined;
  let connected = false;
  let mediaReady = false;
  let startPromise: Promise<void> | undefined;
  let callTimer: ReturnType<typeof setTimeout> | undefined;
  let botId: string | undefined;
  const session = new LivePhoneSession({
    config, apiKey: required("OPENAI_API_KEY"), userId, audioFormat: { type: "audio/pcm", rate: 24000 },
    onEvent: event => { audit(event); if (event.type === "error") stop(); },
    onTurn: async turn => {
      const response = await saveCareerTurnRequest(request("/api/talent/chat/save", { ...turn, isCallMode: true }), runtime);
      if (!response.ok) throw new Error(`Turn save failed (${response.status})`);
      return response.json();
    },
    onTool: async tool => {
      let args: unknown;
      try { args = JSON.parse(tool.arguments || "{}"); } catch { args = { _raw: tool.arguments }; }
      const response = await executeCareerToolRequest(request("/api/talent/tool/execute", { channel: "voice", name: tool.name, arguments: args, toolCallId: tool.callId }), runtime);
      const payload = await response.json();
      audit({ type: "tool", name: tool.name, status: response.status });
      return typeof payload.modelOutput === "string" ? payload.modelOutput : JSON.stringify(payload);
    },
    onUsage: async (kind, event) => {
      await insertLiveLlmUsageLog({
        audioSeconds: typeof event.usage?.seconds === "number" ? event.usage.seconds : null,
        model: kind === "audio" ? config.model : config.delegation.responses.model,
        response: kind === "delegation" ? { usage: event.response?.usage } : undefined, usageKind: kind,
        meta: { callSessionId: runId, conversationId, userId, responseId: event.response?.id ?? null, status: event.response?.status ?? "closed" },
      });
    },
  });
  const send = (message: string | Buffer) => {
    if (audioSocket?.readyState !== WebSocket.OPEN) return;
    if (audioSocket.bufferedAmount > 240_000) { fail("Audio output congestion"); stop(); return; }
    audioSocket.send(message);
  };
  const files = new Map([
    ["/audio.js", ["text/javascript", readFileSync(resolve("scripts/meet-pilot/audio.js"))]],
    ["/capture.worklet.js", ["text/javascript", readFileSync(resolve("scripts/meet-pilot/capture.worklet.js"))]],
    ["/logo.svg", ["image/svg+xml", readFileSync(resolve("public/svgs/harper-h-mark.svg"))]],
  ] as const);
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    if (path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Harper</title></head><body style="margin:0;display:grid;place-items:center;height:100vh;background:#fff"><img src="/logo.svg" width="160" alt="Harper"><script type="module" src="/audio.js"></script></body></html>'); return;
    }
    const file = files.get(path as "/audio.js");
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", file[0]); res.end(file[1]);
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16_384, handleProtocols: () => "harper-meet" });
  const expiresAt = Date.now() + (maxSeconds + 600) * 1000;
  server.on("upgrade", (req, socket, head) => {
    const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map(value => value.trim());
    const supplied = Buffer.from(protocols[1] ?? "");
    const expected = Buffer.from(token);
    if (req.url !== "/audio" || req.headers.origin !== publicUrl.origin || connected || stopping || Date.now() >= expiresAt || protocols[0] !== "harper-meet" || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    connected = true;
    sockets.handleUpgrade(req, socket, head, ws => {
      audioSocket = ws;
      ws.on("message", (data, binary) => {
        if (binary) {
          const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          if (bytes.length % 2) { ws.close(1003, "Invalid PCM"); return; }
          if (!stopping) session.feedAudio(bytes);
        } else {
          try { if (JSON.parse(data.toString()).type === "media.ready") { mediaReady = true; console.log("Meet audio connected. Verify the intended participant, then type start. Type stop to finish."); } } catch { ws.close(1003, "Invalid message"); }
        }
      });
      ws.on("close", stop); ws.on("error", error => { fail(error); stop(); });
    });
  });
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.on("line", line => {
    if (line.trim() === "stop") stop();
    if (line.trim() !== "start" || stopping || startPromise) return;
    if (!mediaReady) { console.log("Wait for the bot audio connection first."); return; }
    startPromise = session.start({
      sendAudio: audio => send(audio), clearAudio: () => send(JSON.stringify({ type: "clear" })),
      hangup: async () => { stop(); }, recordEndReason: reason => audit({ type: "end", reason }), recordToolCall: () => {},
    }).then(() => {
      send(JSON.stringify({ type: "ready" }));
      callTimer = setTimeout(stop, maxSeconds * 1000);
      console.log("Harper voice connected.");
    }).catch(error => { fail(error); stop(); });
  });
  const onSignal = () => stop();
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  const deadline = setTimeout(() => { fail("Pilot connection/duration deadline reached"); stop(); }, (maxSeconds + 600) * 1000);
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
    let meetingUrl = process.env.MEET_URL;
    if (!meetingUrl) {
      const oauth = new OAuth2Client(required("MEET_GOOGLE_CLIENT_ID"), required("MEET_GOOGLE_CLIENT_SECRET"));
      oauth.setCredentials({ refresh_token: required("MEET_GOOGLE_REFRESH_TOKEN") });
      const access = await oauth.getAccessToken();
      if (!access.token) throw new Error("Google authorization did not return a token");
      const event = calendarInvitation({ runId, email, startAt: new Date(Date.now() + 5 * 60_000), durationMinutes: Math.ceil(maxSeconds / 60), timeZone });
      const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      const headers = { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" };
      const response = await fetch(`${endpoint}?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", headers, body: JSON.stringify(event), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Calendar creation failed (${response.status}); inspect Calendar before retrying`);
      let created = await response.json();
      writeFileSync(resolve(runDir, "calendar.json"), JSON.stringify(created, null, 2));
      for (let i = 0; !created.hangoutLink && i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const check = await fetch(`${endpoint}/${event.id}`, { headers, signal: AbortSignal.timeout(10_000) });
        if (!check.ok) throw new Error(`Calendar conference lookup failed (${check.status})`);
        created = await check.json();
      }
      meetingUrl = created.hangoutLink;
      if (!meetingUrl) throw new Error("Calendar invitation exists but Meet link is pending; inspect calendar.json before retrying");
    }
    meetingUrl = googleMeetUrl(meetingUrl);
    const outputUrl = `${publicUrl.origin}/#token=${token}`;
    botId = await recall.create(recallBotBody(meetingUrl, outputUrl, process.env.RECALL_GOOGLE_LOGIN_GROUP_ID));
    writeFileSync(resolve(runDir, "manifest.json"), JSON.stringify({ runId, botId, meetingUrl, region, userId, conversationId, model: config.model, backendModel: config.delegation.responses.model }, null, 2));
    console.log(JSON.stringify({ type: "bot.requested", botId, meetingUrl, runDir }));
    await done;
  } finally {
    stopping = true; clearTimeout(deadline); clearTimeout(callTimer); terminal.close();
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    await startPromise;
    await session.stop().catch(fail);
    audioSocket?.terminate(); sockets.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (botId) await recall.leave(botId).catch(fail);
    if (session.startedAt && session.transcript.length) {
      try {
        const response = await wrapupCareerCallRequest(request("/api/talent/chat/call-wrapup", {
          callId: runId, callSessionId: runId, transcript: session.transcript,
          durationSeconds: Math.round((Date.now() - Date.parse(session.startedAt)) / 1000),
          startedAt: session.startedAt, endedAt: new Date().toISOString(),
          forceCompleteOnboarding: session.completeOnboarding, onboardingCompletedAtStart: Boolean(setting?.is_onboarding_done),
        }), runtime);
        writeFileSync(resolve(runDir, "wrapup.json"), JSON.stringify(await response.json(), null, 2));
        if (!response.ok) throw new Error(`Wrapup failed (${response.status})`);
      } catch (error) { fail(error); }
    }
    while (background.size) await Promise.all([...background]);
    writeFileSync(resolve(runDir, "result.json"), JSON.stringify({ errors: [...errors, ...session.errors], transcript: session.transcript }, null, 2));
  }
  if (errors.length || session.errors.length) throw new Error(`Pilot finished with errors; inspect ${runDir}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Meet pilot failed"); process.exitCode = 1; });
