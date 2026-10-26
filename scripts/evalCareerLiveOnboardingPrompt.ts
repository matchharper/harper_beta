/** Synthetic audio smoke; never connects to Harper DB or executes product tools. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildCareerConversationPromptPlan } from "../src/lib/career/prompts/conversationPlan";
import {
  buildLiveBackendInstructions,
  buildLiveOnboardingContext,
} from "../src/lib/career/liveOnboarding";
import { buildLiveFrontendInstructions } from "../src/lib/career/voiceSessionInstructions";
import { buildLiveSessionUpdateEvents } from "../src/lib/career/liveSessionUpdates";
import { getCareerLiveSessionConfig } from "../src/lib/career/llm";
import { getCareerRealtimeToolCandidates } from "../src/lib/career/llmTools";

type Socket = EventEmitter & {
  send(value: string): void;
  close(): void;
  terminate(): void;
  readyState: number;
};
const WebSocket = createRequire(import.meta.url)(
  "next/dist/compiled/ws"
) as new (url: string, options: { headers: Record<string, string> }) => Socket;
type Case = {
  id: string;
  covered: string[];
  updatedCovered?: string[];
  history: { role: "user" | "assistant"; text: string }[];
  utterance: string;
  gold: string;
};
const root = path.resolve("docs/evaluation/career-voice-onboarding");
const version = process.env.CAREER_VOICE_EVAL_VERSION ?? "v1";
if (!["v1", "v2"].includes(version)) throw new Error("Unknown fixture version");
const fixturePath = path.join(root, `live-prompt-cases-${version}.json`);
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString()) as {
  version: string;
  profile: string;
  cases: Case[];
};
const config = getCareerLiveSessionConfig();
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const coverage = (keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, "covered" as const]));
const selected = process.argv.slice(2);
const cases = fixture.cases.filter(
  (item) => selected.length === 0 || selected.includes(item.id)
);
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
if (
  cases.length === 0 ||
  selected.some((id) => !cases.some((item) => item.id === id))
)
  throw new Error("Unknown case ID");
const runDir = path.join(
  root,
  "runs",
  `live-prompt-${new Date().toISOString().replaceAll(":", "-")}`
);
mkdirSync(runDir, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(path.join(runDir, name), JSON.stringify(value, null, 2), {
    mode: 0o600,
    flag: "wx",
  });

function makeInstructions(item: Case, keys: string[]) {
  const plan = buildCareerConversationPromptPlan({
    channel: "voice",
    isOnboardingDone: false,
    profile: { current_location: "Seoul" },
    currentPreferences: { preferredLocale: "ko" },
    structuredProfileText: fixture.profile,
    talentContextSection:
      "No saved facts beyond the synthetic profile and conversation below.",
    onboardingChecklistCoverage: coverage(keys),
    recentConversationSection: item.history
      .map((message) => `${message.role}: ${message.text}`)
      .join("\n"),
    toolNames: ["end_call"],
  });
  return {
    instructions: buildLiveBackendInstructions(plan),
    onboardingContext: buildLiveOnboardingContext({
      checklistCoverage: coverage(keys),
    }),
  };
}

async function runCase(item: Case) {
  const audioDir = path.join(root, "private", fixture.version);
  mkdirSync(audioDir, { recursive: true, mode: 0o700 });
  const audioPath = path.join(audioDir, `${item.id}.pcm`);
  if (!existsSync(audioPath)) {
    const aiffPath = path.join(audioDir, `${item.id}.aiff`);
    execFileSync("say", [
      "-v",
      "Yuna",
      "-r",
      "170",
      "-o",
      aiffPath,
      item.utterance,
    ]);
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      aiffPath,
      "-ar",
      "24000",
      "-ac",
      "1",
      "-f",
      "s16le",
      audioPath,
    ]);
  }
  const pcm = readFileSync(audioPath);
  const initial = makeInstructions(item, item.covered);
  const updated = item.updatedCovered
    ? makeInstructions(item, item.updatedCovered)
    : null;
  const frontend = buildLiveFrontendInstructions({
    initialResponseInstruction:
      "Continue the conversation from the caller's next utterance.",
    responseLocale: "ko",
    onboardingContext: initial.onboardingContext,
  });
  const session = {
    model: config.model,
    store: false,
    instructions: frontend,
    input: item.history.map((message) => ({
      type: "message",
      role: message.role,
      content: [
        {
          type: message.role === "user" ? "input_text" : "output_text",
          text: message.text,
        },
      ],
    })),
    audio: {
      format: { type: "audio/pcm", rate: 24000 },
      output: { voice: config.voice },
    },
    delegation: {
      type: "responses",
      responses: {
        model: config.delegationModel,
        instructions: initial.instructions,
        reasoning: { effort: config.delegationReasoningEffort },
        text: { verbosity: "low" },
        tools: getCareerRealtimeToolCandidates("ko").filter(
          (tool) => tool.name === "end_call"
        ),
        tool_choice: "auto",
        parallel_tool_calls: false,
      },
    },
  };
  save(`${item.id}-input.json`, {
    session,
    updated,
    audioSha256: hash(pcm),
    gold: item.gold,
  });
  const events: Record<string, unknown>[] = [];
  const outputAudio: Buffer[] = [];
  let inputText = "",
    outputText = "",
    endedByTool = false,
    finalized = false;
  let closeInfo: { code: number; reason: string } | null = null;
  const errors: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket("wss://api.openai.com/v1/live/sessions", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    let pump: ReturnType<typeof setInterval> | undefined;
    let closeTimeout: ReturnType<typeof setTimeout> | undefined;
    let offset = 0,
      started = 0,
      lastOutput = 0,
      closing = false,
      backendPending = false;
    const send = (event: unknown) => ws.send(JSON.stringify(event));
    const close = () => {
      if (closing) return;
      closing = true;
      clearInterval(pump);
      send({ type: "session.close" });
      closeTimeout = setTimeout(() => ws.terminate(), 15000);
    };
    const timeout = setTimeout(() => {
      errors.push("session timeout");
      ws.terminate();
    }, 105000);
    ws.on("open", () => send({ type: "session.start", session }));
    ws.on("error", (error: Error) => {
      errors.push(error.message);
    });
    ws.on(
      "unexpected-response",
      (_: unknown, response: EventEmitter & { statusCode: number }) => {
        clearTimeout(timeout);
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        response.on("end", () => {
          save(`${item.id}-connection-error.json`, {
            status: response.statusCode,
            body,
          });
          ws.terminate();
          reject(
            new Error(
              `Live WebSocket rejected: ${response.statusCode}; see private connection-error artifact`
            )
          );
        });
      }
    );
    ws.on("message", (raw: Buffer) => {
      const event = JSON.parse(raw.toString());
      if (event.type === "session.output_audio.delta") {
        outputAudio.push(Buffer.from(event.delta, "base64"));
        return;
      }
      events.push(event);
      if (event.type === "error") errors.push(event.error);
      if (event.type === "session.input_transcript.delta")
        inputText += event.delta ?? "";
      if (event.type === "session.output_transcript.delta") {
        outputText += event.delta ?? "";
        lastOutput = Date.now();
      }
      if (event.type === "response.event") {
        const nested = event.event;
        if (nested?.type === "response.created") backendPending = true;
        if (
          nested?.type === "response.output_item.done" &&
          nested.item?.type === "function_call" &&
          nested.item.name === "end_call"
        )
          endedByTool = true;
        if (
          nested?.type === "response.done" ||
          nested?.type === "response.completed"
        ) {
          backendPending = false;
          if (
            nested.response?.output?.some(
              (output: { type: string; name?: string }) =>
                output.type === "function_call" && output.name === "end_call"
            )
          )
            endedByTool = true;
        }
      }
      if (event.type === "session.started") {
        started = Date.now();
        if (updated)
          for (const update of buildLiveSessionUpdateEvents(
            updated,
            initial.onboardingContext,
            `eval_${item.id}`
          ))
            send(update);
        // Continuous 40 ms frames including silence, paced like a microphone.
        pump = setInterval(() => {
          const elapsed = Date.now() - started;
          const chunk =
            elapsed < 1200
              ? Buffer.alloc(1920)
              : pcm.subarray(offset, offset + 1920);
          if (elapsed >= 1200) offset += 1920;
          send({
            type: "session.input_audio.append",
            audio: (chunk.length ? chunk : Buffer.alloc(1920)).toString(
              "base64"
            ),
          });
          if (
            elapsed > 70000 ||
            (offset > pcm.length &&
              outputText &&
              !backendPending &&
              Date.now() - lastOutput > (endedByTool ? 2500 : 5000))
          )
            close();
        }, 40);
      }
      if (event.type === "session.closed") {
        finalized = true;
        ws.close();
      }
    });
    ws.on("close", (code: number, reason: Buffer) => {
      closeInfo = { code, reason: reason.toString() };
      clearInterval(pump);
      clearTimeout(timeout);
      clearTimeout(closeTimeout);
      resolve();
    });
  });
  save(`${item.id}-events.json`, events);
  writeFileSync(
    path.join(runDir, `${item.id}-output.pcm`),
    Buffer.concat(outputAudio),
    { mode: 0o600, flag: "wx" }
  );
  const result = {
    id: item.id,
    inputText,
    outputText,
    endedByTool,
    finalized,
    errors,
    closeInfo,
    gold: item.gold,
  };
  save(`${item.id}-result.json`, result);
  console.log(JSON.stringify(result));
  if (!finalized || errors.length || !inputText || !outputText) {
    process.exitCode = 1;
  }
}

async function main() {
  process.umask(0o077);
  save("manifest.json", {
    fixtureVersion: fixture.version,
    fixtureSha256: hash(fixtureBytes),
    runnerSha256: hash(readFileSync(new URL(import.meta.url))),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    diffSha256: hash(execFileSync("git", ["diff", "--", "src/lib/career/prompts", "src/lib/career/liveOnboarding.ts", "src/lib/career/voiceSessionInstructions.ts", "src/lib/talentOnboarding/insightChecklist.ts", "src/lib/talentOnboarding/tools.ts", "scripts/evalCareerLiveOnboardingPrompt.ts"], { maxBuffer: 8 * 1024 * 1024 })),
    config,
    selectedCases: cases.map((item) => item.id),
    transport: "websocket",
    inputAudio: "macOS Yuna 170 wpm; PCM16 mono 24kHz",
    limits:
      "Synthetic history and coverage; no DB extraction/save or browser playback verification. Qualitative review is manual, never keyword scored.",
  });
  for (const item of cases) await runCase(item);
  console.log(`Artifacts: ${runDir}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
