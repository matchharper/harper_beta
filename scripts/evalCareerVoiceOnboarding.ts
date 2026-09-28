import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  assignCareerVoiceModel,
  CAREER_VOICE_MODEL_EXPERIMENT,
} from "../src/lib/career/voiceModel";
import { isInternalEmail } from "../src/lib/internalAccess";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
} from "../src/lib/ops/abTests";

const ROOT = "docs/evaluation/career-voice-onboarding";
const RAW = `${ROOT}/private/pilot-v1.json`;
const AS_OF = "2026-09-28T01:17:29.323990Z";
const ms = (x: string) => Date.parse(x);
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
async function privateWrite(path: string, value: unknown) {
  await writeFile(
    path,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
    { mode: 0o600, flag: "wx" }
  );
}
async function capture() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error("Supabase credentials unavailable");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        if (!["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase()))
          throw Error("Capture is read only");
        return fetch(input, { ...init, signal: AbortSignal.timeout(60000) });
      },
    },
  });
  async function rows(table: string, select: string, filter: (q: any) => any) {
    const all: any[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await filter(db.from(table).select(select)).range(
        start,
        start + 999
      );
      if (error) throw Error(`${table}: ${error.message}`);
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  }
  const voiceTypes = [
    "career_voice_model_session_attempt",
    "career_voice_model_exposure",
    "career_voice_model_session_failed",
    "career_voice_model_call_completed",
  ];
  const [choices, voice] = await Promise.all([
    rows("logs", "id,user_id,type,created_at", (q) =>
      q
        .in("type", [
          "career_click_onboarding_done_start_call",
          "career_click_onboarding_done_start_chat",
        ])
        .lte("created_at", AS_OF)
        .order("created_at")
        .order("id")
    ),
    rows("logs", "id,user_id,type,created_at,meta_data", (q) =>
      q
        .in("type", voiceTypes)
        .contains("meta_data", { experiment: CAREER_VOICE_MODEL_EXPERIMENT })
        .lte("created_at", AS_OF)
        .order("created_at")
        .order("id")
    ),
  ]);
  const experimentStart = voice.filter(
    (x) => x.type === "career_voice_model_session_attempt"
  )[0].created_at;
  const first = new Map<string, any>();
  for (const x of choices)
    if (x.user_id && !first.has(x.user_id)) first.set(x.user_id, x);
  const candidates = [...first.values()].filter(
    (x) => x.type.endsWith("_call") && ms(x.created_at) >= ms(experimentStart)
  );
  const users = await rows(
    "talent_users",
    "user_id,email,headline,bio,current_location,created_at,updated_at",
    (q) =>
      q
        .in(
          "user_id",
          candidates.map((x) => x.user_id)
        )
        .order("user_id")
  );
  const excluded = new Set(
    users.filter((x) => isInternalEmail(x.email)).map((x) => x.user_id)
  );
  const cohort = candidates
    .filter((x) => !excluded.has(x.user_id))
    .sort((a, b) => hash(a.user_id).localeCompare(hash(b.user_id)))
    .map((x, i) => ({
      ...x,
      caseId: `VO${String(i + 1).padStart(3, "0")}`,
      assignedModel: assignCareerVoiceModel(x.user_id),
      mature: ms(AS_OF) - ms(x.created_at) >= 86400000,
    }));
  const ids = cohort.map((x) => x.user_id);
  const data: Record<string, any[]> = {};
  const specs = [
    [
      "messages",
      "talent_messages",
      "id,user_id,conversation_id,role,message_type,content,created_at,payload",
      "user_id",
    ],
    [
      "writes",
      "talent_context_write_requests",
      "talent_id,request_id,response,created_at",
      "talent_id",
    ],
    [
      "contexts",
      "talent_contexts",
      "id,talent_id,ref,collection,label,key,content,revision,source_refs,created_at,updated_at,deleted_at",
      "talent_id",
    ],
    [
      "documents",
      "talent_documents",
      "id,talent_id,kind,extracted_text,created_at,updated_at,revision",
      "talent_id",
    ],
    [
      "experiences",
      "talent_experiences",
      "id,talent_id,role,company_name,description,start_date,end_date,created_at",
      "talent_id",
    ],
    [
      "calls",
      "talent_calls",
      "id,user_id,conversation_id,kind,status,state,started_at,completed_at,created_at",
      "user_id",
    ],
    [
      "activity",
      "talent_activity_events",
      "id,talent_id,event_type,source,created_at",
      "talent_id",
    ],
  ];
  for (let i = 0; i < specs.length; i += 3)
    await Promise.all(
      specs.slice(i, i + 3).map(async ([name, table, select, idkey]) => {
        data[name] = await rows(table, select, (q) =>
          q
            .in(idkey, ids)
            .lte("created_at", AS_OF)
            .order("created_at")
            .order(idkey)
        );
      })
    );
  const snapshot = {
    datasetVersion: "pilot-v1",
    asOf: AS_OF,
    capturedAt: new Date().toISOString(),
    experimentStart,
    sourceRevision: git("rev-parse", "HEAD"),
    sourceDiffSha256: hash(
      git(
        "diff",
        "--",
        "src/lib/career/voiceModel.ts",
        "src/lib/talentOnboarding/insightChecklist.ts",
        "src/app/api/talent/chat/save/route.ts"
      )
    ),
    cohort,
    users: users.filter((x) => ids.includes(x.user_id)),
    voice: voice.filter((x) => ids.includes(x.user_id)),
    ...data,
  };
  await privateWrite(RAW, snapshot);
  console.log(
    JSON.stringify({
      snapshot: RAW,
      cases: cohort.length,
      mature: cohort.filter((x) => x.mature).length,
      tableCounts: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v.length])
      ),
    })
  );
}
function prepare(raw: any) {
  return raw.cohort.map((p: any) => {
    const uid = p.user_id;
    const voice = raw.voice.filter(
      (v: any) => v.user_id === uid && ms(v.created_at) >= ms(p.created_at)
    );
    const attempts = voice.filter(
      (v: any) => v.type === "career_voice_model_session_attempt"
    );
    const a = attempts[0];
    const next = attempts.find(
      (v: any) => v.meta_data.callSessionId !== a?.meta_data.callSessionId
    );
    const endLog = voice.find(
      (v: any) =>
        v.type === "career_voice_model_call_completed" &&
        v.meta_data.callSessionId === a?.meta_data.callSessionId
    );
    const windowEnd = Math.min(
      ms(AS_OF),
      ms(p.created_at) + 86400000,
      next ? ms(next.created_at) : Infinity,
      endLog ? ms(endLog.created_at) : Infinity
    );
    const windowStart = a ? ms(a.created_at) : ms(p.created_at);
    const messages = raw.messages.filter((m: any) => m.user_id === uid);
    const transcript = messages.filter(
      (m: any) =>
        m.message_type === "call_transcript" &&
        ms(m.created_at) >= windowStart &&
        ms(m.created_at) < windowEnd &&
        (!a || m.conversation_id === a.meta_data.conversationId)
    );
    const nextInput = messages.find(
      (m: any) => m.role === "user" && ms(m.created_at) >= windowEnd
    );
    const saveCutoff = Math.min(
      windowEnd + 300000,
      next ? ms(next.created_at) : Infinity,
      nextInput ? ms(nextInput.created_at) : Infinity,
      ms(AS_OF)
    );
    const writes = raw.writes.filter((w: any) => w.talent_id === uid);
    const current = raw.contexts.filter((c: any) => c.talent_id === uid);
    function contextsAt(cutoff: number) {
      const state = new Map<number, any>();
      for (const c of current)
        if (ms(c.created_at) < cutoff && ms(c.updated_at) < cutoff)
          state.set(c.id, c);
      for (const w of writes)
        if (ms(w.created_at) < cutoff)
          for (const c of w.response?.applied ?? []) {
            const prev = state.get(c.id);
            if (!prev || c.revision >= prev.revision) state.set(c.id, c);
          }
      return [...state.values()]
        .filter((c) => !c.deleted_at && c.op !== "delete")
        .map((c) => ({
          ref: c.ref,
          collection: c.collection,
          label: c.label,
          key: c.key,
          content: c.content,
          updated_at: c.updated_at,
          source_refs: c.source_refs,
        }));
    }
    const pre = contextsAt(windowStart),
      post = contextsAt(saveCutoff);
    const documents = raw.documents.filter(
      (d: any) =>
        d.talent_id === uid &&
        ms(d.created_at) <= windowStart &&
        ms(d.updated_at ?? d.created_at) <= windowStart &&
        d.extracted_text
    );
    const profile = raw.users.find((u: any) => u.user_id === uid);
    return {
      caseId: p.caseId,
      mature: p.mature,
      choiceAt: p.created_at,
      hasAttempt: !!a,
      hasEndLog: !!endLog,
      explicitFailure: voice.some(
        (v: any) =>
          v.type === "career_voice_model_session_failed" &&
          v.meta_data.callSessionId === a?.meta_data.callSessionId
      ),
      transcript,
      pre,
      post,
      documents,
      profile:
        profile && ms(profile.updated_at) <= windowStart
          ? {
              headline: profile.headline,
              bio: profile.bio,
              current_location: profile.current_location,
            }
          : null,
      experiences: raw.experiences.filter(
        (e: any) => e.talent_id === uid && ms(e.created_at) <= windowStart
      ),
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      saveCutoff: new Date(saveCutoff).toISOString(),
      writesBeforeCutoff: writes.filter(
        (w: any) => ms(w.created_at) < saveCutoff
      ).length,
      completion24h: raw.activity.some(
        (e: any) =>
          e.talent_id === uid &&
          e.event_type === "onboarding_completed" &&
          ms(e.created_at) >= ms(p.created_at) &&
          ms(e.created_at) <= ms(p.created_at) + 86400000
      ),
      assignedModel: p.assignedModel,
      observedModel: a?.meta_data.model ?? null,
    };
  });
}
async function packets() {
  const raw = JSON.parse(await readFile(RAW, "utf8"));
  const cases = prepare(raw);
  await mkdir(`${ROOT}/private/packets`, { recursive: true, mode: 0o700 });
  for (const c of cases) {
    let text = `# ${c.caseId}\nMature24h: ${c.mature}; attempted: ${c.hasAttempt}; endRecord: ${c.hasEndLog}; explicitFailure: ${c.explicitFailure}\nUser turns: ${c.transcript.filter((m: any) => m.role === "user").length}; saved snapshots: ${c.writesBeforeCutoff}\n`;
    text += `\n## Existing evidence\n`;
    if (c.profile) text += JSON.stringify(c.profile) + "\n";
    // Career rows have creation time but no immutable update history; only documents are baseline evidence.
    for (const d of c.documents)
      text += `Document ${d.kind}:\n${d.extracted_text}\n`;
    text +=
      "\n## Before call stored facts\n" +
      c.pre
        .map((x: any) => `${x.collection}/${x.label ?? x.key}: ${x.content}`)
        .join("\n") +
      "\n";
    text +=
      "\n## First call\n" +
      c.transcript
        .map(
          (m: any, i: number) =>
            `${i + 1} ${m.role === "user" ? "U" : "A"}: ${m.content}`
        )
        .join("\n") +
      "\n";
    text +=
      "\n## After call stored facts\n" +
      c.post
        .map(
          (x: any) =>
            `${x.ref} ${x.collection}/${x.label ?? x.key}: ${x.content}`
        )
        .join("\n") +
      "\n";
    await privateWrite(`${ROOT}/private/packets/${c.caseId}.md`, text);
  }
  await privateWrite(`${ROOT}/private/prepared-v1.json`, cases);
  const manifest = {
    task: "career-voice-onboarding",
    datasetVersion: "pilot-v1",
    asOf: AS_OF,
    capturedAt: raw.capturedAt,
    sourceRevision: raw.sourceRevision,
    sourceDiffSha256: raw.sourceDiffSha256,
    snapshotSha256: hash(await readFile(RAW, "utf8")),
    rubricSha256: hash(await readFile(`${ROOT}/rubric-v1.md`, "utf8")),
    runnerSha256: hash(
      await readFile("scripts/evalCareerVoiceOnboarding.ts", "utf8")
    ),
    caseCount: cases.length,
    matureCount: cases.filter((c: any) => c.mature).length,
    rawArtifact: RAW,
    evaluator:
      "Codex direct qualitative review; independent human gold pending",
    privacy:
      "Production raw data local-only; no additional external LLM API calls",
    models: ["gpt-realtime-2.1", "gpt-live-1"],
  };
  await writeFile(
    `${ROOT}/manifest-v1.json`,
    JSON.stringify(manifest, null, 2),
    { flag: "wx" }
  );
  console.log(
    JSON.stringify(
      cases.map((c: any) => ({
        id: c.caseId,
        mature: c.mature,
        attempt: c.hasAttempt,
        userTurns: c.transcript.filter((m: any) => m.role === "user").length,
        postFacts: c.post.length,
        baselineDocs: c.documents.length,
      }))
    )
  );
}
async function summarize() {
  const cases = JSON.parse(
    await readFile(`${ROOT}/private/prepared-v1.json`, "utf8")
  );
  const gold = JSON.parse(await readFile(`${ROOT}/gold-v1.json`, "utf8"));
  if (
    gold.cases.length !== cases.length ||
    new Set(gold.cases.map((x: any) => x.id)).size !== cases.length
  )
    throw Error("Incomplete/duplicate labels");
  const labels = new Map(gold.cases.map((x: any) => [x.id, x]));
  for (const c of cases) {
    const g: any = labels.get(c.caseId);
    if (!g || !["ready", "not_ready", "unknown"].includes(g.outcome))
      throw Error("Missing/invalid label");
    if (
      g.outcome === "ready" &&
      (g.readiness !== "ready" || g.fidelity !== "pass")
    )
      throw Error("Invalid success contract");
  }
  const result: any = {
    asOf: AS_OF,
    evaluator: gold.evaluator,
    allCases: cases.length,
    assignmentMismatches: cases.filter(
      (c: any) => c.observedModel && c.observedModel !== c.assignedModel
    ).length,
  };
  for (const scope of ["mature", "all"])
    result[scope] = ["gpt-realtime-2.1", "gpt-live-1"].map((model) => {
      const group = cases.filter(
        (c: any) => c.assignedModel === model && (scope === "all" || c.mature)
      );
      const count = (fn: (c: any, g: any) => boolean) =>
        group.filter((c: any) => fn(c, labels.get(c.caseId))).length;
      return {
        model,
        n: group.length,
        ready: count((c, g) => g.outcome === "ready"),
        notReady: count((c, g) => g.outcome === "not_ready"),
        unknown: count((c, g) => g.outcome === "unknown"),
        contentReady: count((c, g) => g.readiness === "ready"),
        fidelityFailures: count((c, g) => g.fidelity === "fail"),
        noAttempt: count((c) => !c.hasAttempt),
        noUserTranscript: count(
          (c) => !c.transcript.some((m: any) => m.role === "user")
        ),
        operationalCompletion24h: count((c) => c.completion24h),
      };
    });
  const [a, b] = result.mature;
  result.confirmedSuccessDifference = compareOpsAbTestRates({
    first: makeOpsAbTestRate(a.ready, a.n),
    firstVariantId: a.model,
    second: makeOpsAbTestRate(b.ready, b.n),
    secondVariantId: b.model,
  });
  await writeFile(`${ROOT}/summary-v1.json`, JSON.stringify(result, null, 2), {
    flag: "wx",
  });
  console.log(JSON.stringify(result, null, 2));
}
const command = process.argv[2];
(command === "capture"
  ? capture()
  : command === "packets"
    ? packets()
    : command === "summarize"
      ? summarize()
      : Promise.reject(Error("Use capture, packets, or summarize"))
).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
