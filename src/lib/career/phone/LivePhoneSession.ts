import { createHash, randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { CallSession, Session } from "@teamlearners/clawops/agent";
import { buildLiveSessionUpdateEvents, type LiveSessionInstructionUpdate } from "../liveSessionUpdates";
import { parseCareerEndCallArguments } from "../realtimeEndCall";

type Json = Record<string, any>;
export type LiveAudioTransport = Pick<CallSession, "sendAudio" | "clearAudio" | "hangup" | "recordEndReason" | "recordToolCall">;
export type PhoneTranscript = { role: "user" | "assistant"; text: string; timestamp: string };
export type PhoneToolCall = { callId: string; name: string; arguments: string };
export type PhoneSessionCallbacks = {
  config: Json;
  apiKey: string;
  userId: string;
  audioFormat?: { type: "audio/pcm"; rate: 16000 | 24000 } | { type: "audio/pcmu"; rate: 8000 };
  onTurn: (turn: { userMessage: string; assistantMessage: string }) => Promise<{ liveSessionUpdate?: LiveSessionInstructionUpdate | null; shouldEndCall?: boolean }>;
  onTool: (call: PhoneToolCall) => Promise<string>;
  onUsage: (kind: "audio" | "delegation", event: Json) => Promise<void>;
  onEvent: (event: Json) => void;
};

/** Shared server-side Live loop. Phone defaults to G.711; Meet supplies PCM. */
export class LivePhoneSession implements Session {
  readonly transcript: PhoneTranscript[] = [];
  readonly errors: string[] = [];
  completeOnboarding = false;
  startedAt: string | null = null;
  private socket?: WebSocket;
  private call?: LiveAudioTransport;
  private ready = false;
  private closing = false;
  private stopped?: Promise<void>;
  private closedResolve?: () => void;
  private userText = "";
  private assistantText = "";
  private pendingUserText = "";
  private assistantTimer?: ReturnType<typeof setTimeout>;
  private endTimer?: ReturnType<typeof setTimeout>;
  private endDeadline = 0;
  private queue: Promise<void> = Promise.resolve();
  private usageQueue: Promise<void> = Promise.resolve();
  private functionCalls = new Map<string, Map<string, PhoneToolCall>>();
  private delegationResponses = new Map<string, string>();
  private executed = new Set<string>();
  private onboardingContext: string | null = null;

  constructor(private readonly callbacks: PhoneSessionCallbacks) {}

  async prewarm(): Promise<void> { throw new Error("This phone session starts only after the intended recipient answers."); }
  async attach(call: CallSession): Promise<void> { await this.start(call); }

  async start(call: LiveAudioTransport): Promise<void> {
    if (this.call) throw new Error("A LivePhoneSession can only serve one call.");
    this.call = call;
    this.startedAt = new Date().toISOString();
    const socket = this.socket = new WebSocket("wss://api.openai.com/v1/live/sessions", {
      headers: {
        Authorization: `Bearer ${this.callbacks.apiKey}`,
        "OpenAI-Safety-Identifier": createHash("sha256").update(`talent-user:${this.callbacks.userId}`).digest("hex"),
      },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error("GPT-Live startup timed out")); socket.terminate(); }, 20_000);
      const fail = (error: Error) => { clearTimeout(timeout); reject(error); this.fail(error); };
      socket.once("open", () => this.send({
        type: "session.start", event_id: randomUUID(),
        session: { ...this.callbacks.config, audio: { ...this.callbacks.config.audio, format: this.callbacks.audioFormat ?? { type: "audio/pcmu", rate: 8000 } } },
      }));
      socket.on("message", bytes => {
        try {
          const event = JSON.parse(bytes.toString()) as Json;
          if (event.type === "session.started") {
            clearTimeout(timeout); this.ready = true; resolve();
            this.callbacks.onEvent({ type: "live.ready", sessionId: event.session?.id, model: event.session?.model });
          }
          this.receive(event);
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      });
      socket.on("error", fail);
      socket.on("close", () => {
        clearTimeout(timeout); this.ready = false;
        if (!this.closing) fail(new Error("GPT-Live connection closed unexpectedly"));
      });
    });
  }

  feedAudio(audio: Buffer): void {
    if (this.ready && !this.closing) this.send({ type: "session.input_audio.append", audio: audio.toString("base64") });
  }

  private send(event: Json): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private fail(error: Error): void {
    this.errors.push(error.message);
    this.callbacks.onEvent({ type: "error", message: error.message });
    if (!this.closing) void this.call?.hangup().catch(() => undefined);
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch(error => this.fail(error instanceof Error ? error : new Error(String(error))));
  }

  private flushUser(): void {
    if (!this.userText.trim()) return;
    const text = this.userText.trim(); this.userText = "";
    this.transcript.push({ role: "user", text, timestamp: new Date().toISOString() });
    this.pendingUserText = [this.pendingUserText, text].filter(Boolean).join("\n");
    this.callbacks.onEvent({ type: "transcript", role: "user", text });
  }

  private flushAssistant(): void {
    clearTimeout(this.assistantTimer);
    if (!this.assistantText.trim()) return;
    this.flushUser();
    const text = this.assistantText.trim(); this.assistantText = "";
    this.transcript.push({ role: "assistant", text, timestamp: new Date().toISOString() });
    this.callbacks.onEvent({ type: "transcript", role: "assistant", text });
    this.saveTurn(text);
  }

  private saveTurn(assistantMessage: string): void {
    const userMessage = this.pendingUserText; this.pendingUserText = "";
    if (!userMessage && !assistantMessage) return;
    this.enqueue(async () => {
      const result = await this.callbacks.onTurn({ userMessage, assistantMessage });
      if (result.liveSessionUpdate && !this.closing) {
        for (const event of buildLiveSessionUpdateEvents(result.liveSessionUpdate, this.onboardingContext, randomUUID())) this.send(event);
        this.onboardingContext = result.liveSessionUpdate.onboardingContext;
      }
      if (result.shouldEndCall) { this.completeOnboarding = true; this.requestEnd(); }
    });
  }

  private requestEnd(): void {
    if (!this.endDeadline) this.endDeadline = Date.now() + 12_000;
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      this.call?.recordEndReason("end_call");
      void this.call?.hangup().catch(error => this.fail(error));
    }, Math.max(0, Math.min(2000, this.endDeadline - Date.now())));
  }

  // Public to allow protocol tests without a real phone call or a model invocation.
  receive(event: Json): void {
    switch (event.type) {
      case "session.output_audio.delta":
        this.call?.sendAudio(Buffer.from(event.delta, "base64"));
        if (this.endDeadline) this.requestEnd();
        break;
      case "session.input_transcript.delta":
        if (!event.delta) break;
        if (this.assistantText) { this.call?.clearAudio(); this.flushAssistant(); }
        this.userText += event.delta;
        break;
      case "session.output_transcript.delta":
        if (!event.delta) break;
        this.flushUser(); this.assistantText += event.delta;
        clearTimeout(this.assistantTimer);
        this.assistantTimer = setTimeout(() => this.flushAssistant(), 1400);
        break;
      case "session.delegation.created": {
        this.flushUser();
        const delegation = event.delegation;
        if (delegation?.id && delegation.response_id) this.delegationResponses.set(delegation.id, delegation.response_id);
        break;
      }
      case "response.event":
        if (["response.created", "response.completed", "response.failed", "response.incomplete"].includes(event.event?.type)) {
          this.callbacks.onEvent({ type: "backend.lifecycle", event: event.event.type, responseId: event.event.response?.id, status: event.event.response?.status, error: event.event.response?.error });
        }
        this.receiveResponse(event.event ?? {}, event.delegation_id ?? ""); break;
      case "session.usage.updated":
        this.callbacks.onEvent({ type: event.type, usage: event.usage }); break;
      case "session.closed":
        this.logUsage("audio", event); this.closedResolve?.(); break;
      case "error":
        this.fail(new Error(event.error?.message ?? "GPT-Live error")); break;
    }
  }

  private logUsage(kind: "audio" | "delegation", event: Json): void {
    this.usageQueue = this.usageQueue.then(() => this.callbacks.onUsage(kind, event)).catch(error => this.fail(error));
  }

  private receiveResponse(event: Json, delegationId: string): void {
    const responseId = event.response?.id || event.response_id || this.delegationResponses.get(delegationId) || (this.functionCalls.size === 1 ? this.functionCalls.keys().next().value : "");
    if (event.type === "response.created" && responseId) {
      this.functionCalls.set(responseId, new Map());
      if (delegationId) this.delegationResponses.set(delegationId, responseId);
    }
    if (event.type === "response.output_item.done" && event.item?.type === "function_call" && responseId) {
      const item = event.item;
      if (!this.functionCalls.has(responseId)) this.functionCalls.set(responseId, new Map());
      this.functionCalls.get(responseId)!.set(item.call_id, { callId: item.call_id, name: item.name, arguments: item.arguments });
    }
    if (!["response.completed", "response.failed", "response.incomplete"].includes(event.type)) return;
    if (event.response?.usage) this.logUsage("delegation", event);
    const calls = new Map(this.functionCalls.get(responseId) ?? []);
    for (const item of event.response?.output ?? []) {
      if (item.type === "function_call") calls.set(item.call_id, { callId: item.call_id, name: item.name, arguments: item.arguments });
    }
    this.functionCalls.delete(responseId);
    this.delegationResponses.delete(delegationId);
    if (event.type !== "response.completed") return;
    this.enqueue(async () => {
      let continueBackend = false;
      for (const call of calls.values()) {
        if (this.executed.has(call.callId)) continue;
        this.executed.add(call.callId);
        this.call?.recordToolCall();
        if (call.name === "end_call") {
          this.completeOnboarding = Boolean(parseCareerEndCallArguments(call.arguments).completeOnboarding);
          this.callbacks.onEvent({ type: "tool", name: call.name, callId: call.callId, completeOnboarding: this.completeOnboarding });
          this.requestEnd();
          continue;
        }
        const output = await this.callbacks.onTool(call);
        this.send({ type: "response.item.create", item: { type: "function_call_output", call_id: call.callId, output } });
        continueBackend = true;
      }
      if (continueBackend && !this.closing) this.send({ type: "response.create" });
    });
  }

  stop(): Promise<void> {
    return this.stopped ??= this.finish();
  }

  private async finish(): Promise<void> {
    this.closing = true;
    clearTimeout(this.endTimer);
    clearTimeout(this.assistantTimer);
    if (this.ready && this.socket?.readyState === WebSocket.OPEN) {
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => { this.errors.push("Missing final Live usage"); resolve(); }, 15_000);
        this.closedResolve = () => { clearTimeout(timeout); resolve(); };
        this.send({ type: "session.close" });
      });
    }
    this.flushUser(); this.flushAssistant(); this.saveTurn("");
    await this.queue;
    await this.usageQueue;
    this.socket?.close();
  }
}
