/** Synthetic Realtime prompt/tool smoke. No product DB or tool side effects. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildCareerConversationPromptPlan } from "../src/lib/career/prompts/conversationPlan";
import { renderCareerPromptBlocks } from "../src/lib/career/prompts/promptUtils";
import { getCareerRealtimeSessionConfig } from "../src/lib/career/llm";
import { getCareerRealtimeToolCandidates } from "../src/lib/career/llmTools";

const WebSocket = createRequire(import.meta.url)("next/dist/compiled/ws");
const root = path.resolve("docs/evaluation/career-voice-onboarding");
const fixtureBytes = readFileSync(path.join(root, "live-prompt-cases-v2.json"));
const fixture = JSON.parse(fixtureBytes.toString());
const config = getCareerRealtimeSessionConfig();
const selected = process.argv.slice(2);
const cases = fixture.cases.filter(
  (item: { id: string }) => !selected.length || selected.includes(item.id)
);
if (
  !cases.length ||
  selected.some((id) => !cases.some((item: { id: string }) => item.id === id))
)
  throw new Error("Unknown case ID");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
process.umask(0o077);
const runDir = path.join(
  root,
  "runs",
  `realtime-prompt-${new Date().toISOString().replaceAll(":", "-")}`
);
mkdirSync(runDir, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(path.join(runDir, name), JSON.stringify(value, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
save("manifest.json", {
  fixtureVersion: fixture.version,
  fixtureSha256: hash(fixtureBytes),
  config,
  runnerSha256: hash(readFileSync(new URL(import.meta.url))),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  diffSha256: hash(
    execFileSync(
      "git",
      [
        "diff",
        "--",
        "src/lib/career/prompts",
        "src/lib/talentOnboarding/insightChecklist.ts",
        "src/lib/talentOnboarding/tools.ts",
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    )
  ),
  selectedCases: cases.map((item: { id: string }) => item.id),
  timeoutMs: 60000,
  limits:
    "Synthetic text turn to actual Realtime model with audio response. No STT, browser playback, DB, or product tools. Manual qualitative review.",
});

async function main() {
  for (const item of cases) {
    const plan = buildCareerConversationPromptPlan({
      channel: "voice",
      isOnboardingDone: false,
      profile: { current_location: "Seoul" },
      currentPreferences: { preferredLocale: "ko" },
      structuredProfileText: fixture.profile,
      talentContextSection:
        "No saved facts beyond the synthetic profile and conversation below.",
      onboardingChecklistCoverage: Object.fromEntries(
        (item.updatedCovered ?? item.covered).map((key: string) => [
          key,
          "covered" as const,
        ])
      ),
      recentConversationSection: item.history
        .map(
          (message: { role: string; text: string }) =>
            `${message.role}: ${message.text}`
        )
        .join("\n"),
      toolNames: ["end_call"],
    });
    const session = {
      type: "realtime",
      model: config.model,
      output_modalities: config.outputModalities,
      audio: {
        input: { turn_detection: null },
        output: { voice: config.voice, speed: config.speechSpeed },
      },
      instructions: renderCareerPromptBlocks(plan.promptBlocks),
      tools: getCareerRealtimeToolCandidates("ko").filter(
        (tool) => tool.name === "end_call"
      ),
    };
    save(`${item.id}-input.json`, {
      session,
      utterance: item.utterance,
      gold: item.gold,
    });
    const events: unknown[] = [];
    const errors: unknown[] = [];
    let text = "";
    let output: unknown[] = [];
    let completed = false;
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`,
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );
      const send = (event: unknown) => ws.send(JSON.stringify(event));
      const timer = setTimeout(() => {
        errors.push("timeout");
        ws.terminate();
      }, 60000);
      ws.on("open", () => send({ type: "session.update", session }));
      ws.on("error", (error: Error) => {
        errors.push(error.message);
      });
      ws.on("message", (raw: Buffer) => {
        const event = JSON.parse(raw.toString());
        if (event.type === "response.output_audio.delta") return;
        events.push(event);
        if (event.type === "error") {
          errors.push(event.error);
          ws.close();
        }
        if (event.type === "session.updated") {
          send({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: item.utterance }],
            },
          });
          send({ type: "response.create" });
        }
        if (event.type === "response.output_audio_transcript.delta")
          text += event.delta ?? "";
        if (event.type === "response.done") {
          output = event.response?.output ?? [];
          completed = event.response?.status === "completed";
          ws.close();
        }
      });
      ws.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    save(`${item.id}-events.json`, events);
    const result = {
      id: item.id,
      text,
      output,
      completed,
      errors,
      gold: item.gold,
    };
    save(`${item.id}-result.json`, result);
    console.log(JSON.stringify(result));
    if (!completed || errors.length) process.exitCode = 1;
  }
  console.log(`Artifacts: ${runDir}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
