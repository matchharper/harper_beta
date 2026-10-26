// LOCAL ONLY (harper_eval issue 8, part A): rank past Roles with the role
// start fast path over a fixed set of people, without LLM verdicts.
//
//   node --conditions=react-server --import tsx scripts/localE2e/replayRoleStartEval.ts \
//     <role-inputs.jsonl> <snapshot-talents.csv> <out-dir> [--budget-usd 2] [--drafts 2]
//
// For each Role: the Brief is drafted from the Role's own text at its run
// start (same prompt, model and schema as startRoleStartDraft), then the pool
// is built, scored and ranked inside U = local people ∩ snapshot people created
// before the run start. Nothing is written to sessions, inboxes or Roles; the
// only database write is the job title vector cache. Refuses non-local
// databases.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const pick = (module: any) => module.default ?? module;
const args = process.argv.slice(2);
const [inputsPath, snapshotPath, outDir] = args;
const flag = (name: string, fallback: number) => {
  const index = args.indexOf(name);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const budgetUsd = flag("--budget-usd", 2);
const drafts = flag("--drafts", 2);
if (!inputsPath || !snapshotPath || !outDir) throw new Error("usage: <role-inputs.jsonl> <snapshot-talents.csv> <out-dir>");
if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) throw new Error("local database only");

const { callRoleStartJson, ROLE_START_DRAFT_MODEL } = pick(await import("@/lib/org/roleStart/llm"));
const { buildDraftSystemPrompt, DRAFT_SCHEMA } = pick(await import("@/lib/org/roleStart/prompts"));
const { briefFromRaw } = pick(await import("@/lib/org/roleStart/questions"));
const fp = pick(await import("@/lib/org/roleStart/fastPath"));
const { roleStartSql } = pick(await import("@/lib/org/roleStart/db"));
const sql = roleStartSql();

type RoleInput = {
  role_id: string;
  run_id: string;
  s: string;
  gold_talent_ids: string[];
  role: Record<string, any>;
  internal_role: Record<string, any>;
  workspace: Record<string, any>;
};

const roles: RoleInput[] = readFileSync(inputsPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const snapshot = readFileSync(snapshotPath, "utf8")
  .split("\n")
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const [id, created] = line.split(",");
    return { id: id!.trim(), created: Date.parse(created!.trim()) };
  });
const local = (await sql<Array<{ id: string }>>`select user_id::text as id from public.talent_users order by user_id`).map((row) => row.id);
const localSet = new Set(local);

mkdirSync(path.join(outDir, "brief-drafts"), { recursive: true });
writeFileSync(path.join(outDir, "local-talents.txt"), `${local.join("\n")}\n`);

const text = (value: unknown) => (value === null || value === undefined || value === "None" ? null : String(value));
let spentUsd = 0;
const started = Date.now();
const rankings: Record<string, Record<string, unknown>> = {};
const perRole: Array<Record<string, unknown>> = [];

for (const input of roles) {
  const s = Date.parse(input.s);
  const u = snapshot.filter((row) => row.created < s && localSet.has(row.id)).map((row) => row.id);
  const uSet = new Set(u);
  const role = input.role;
  const source = {
    name: role.name,
    description: text(role.description),
    hiringBrief: text(input.internal_role.request),
    existingCriteria: input.internal_role.criteria ?? [],
    locationText: text(role.location_text),
    workMode: text(role.work_mode),
    employmentTypes: Array.isArray(role.type) ? role.type : [],
    salaryRange: text(role.salary_range),
    company: {
      name: input.workspace.company_name,
      // Same field roleSource reads (service.ts).
      about: String(input.workspace.pitch ?? "").slice(0, 3_000),
    },
  };
  const replay = {
    talentIds: u,
    companyNames: [input.workspace.company_name, input.workspace.published_name].filter((name): name is string => Boolean(text(name))),
  };
  const entry: Record<string, unknown> = { u_size: u.length };
  const roleSummary: Record<string, unknown> = {
    role_id: input.role_id,
    u_size: u.length,
    gold: input.gold_talent_ids.length,
    gold_outside_u: input.gold_talent_ids.filter((id) => !uSet.has(id)).length,
  };
  for (let attempt = 1; attempt <= drafts; attempt += 1) {
    if (spentUsd >= budgetUsd) throw new Error(`budget reached ($${spentUsd.toFixed(3)})`);
    const draftStarted = Date.now();
    const { data, usage } = await callRoleStartJson({
      label: "rubric_draft",
      reasoningEffort: "medium",
      maxOutputTokens: 6_000,
      schema: DRAFT_SCHEMA,
      system: buildDraftSystemPrompt(),
      user: `<ROLE_SOURCE>\n${JSON.stringify(source, null, 2)}\n</ROLE_SOURCE>`,
    });
    spentUsd += Number(usage.usd ?? 0);
    const draftMs = Date.now() - draftStarted;
    const brief = briefFromRaw(data);
    writeFileSync(
      path.join(outDir, "brief-drafts", `${input.role_id}-${attempt}.json`),
      JSON.stringify({ role_id: input.role_id, attempt, model: usage.model ?? ROLE_START_DRAFT_MODEL, usage, ms: draftMs, brief, raw: data }, null, 1)
    );
    const rankStarted = Date.now();
    const pool = await fp.buildBroadPool({
      roleId: input.role_id,
      queryText: fp.jdQueryText({ roleName: role.name, description: source.description }),
      excludeIds: [],
      replay,
    });
    const eligible = new Set(pool.members.map((member: { talentId: string }) => member.talentId));
    await fp.completePool({ pool, roleId: input.role_id, brief, replay });
    await fp.scoreCriteria({ pool, criteria: brief.criteria });
    const ranked: Array<{ talentId: string; passesMust: boolean }> = fp.rankPool({ pool, brief }).ranked;
    const order = ranked.map((member) => member.talentId).filter((id) => uSet.has(id));
    const rankedSet = new Set(order);
    entry[String(attempt)] = order;
    entry[`must_${attempt}`] = ranked.filter((member) => member.passesMust && uSet.has(member.talentId)).map((member) => member.talentId);
    entry[`pool_before_hard_${attempt}`] = pool.members.length;
    if (attempt === 1) entry.pool_before_hard = pool.members.length;
    const inU = input.gold_talent_ids.filter((id) => uSet.has(id));
    roleSummary[`draft_${attempt}`] = {
      usd: usage.usd,
      draft_ms: draftMs,
      rank_ms: Date.now() - rankStarted,
      pool_before_hard: pool.members.length,
      ranked: order.length,
      // Not company-visible now (setting, blocked company) in the local copy.
      gold_not_eligible: inU.filter((id) => !eligible.has(id)).length,
      // Eligible, but out by a required condition or as clearly another job.
      gold_cut_by_hard_conditions: inU.filter((id) => eligible.has(id) && !rankedSet.has(id)).length,
      gold_ranked: inU.filter((id) => rankedSet.has(id)).length,
    };
    console.log(input.role_id.slice(0, 8), attempt, JSON.stringify(roleSummary[`draft_${attempt}`]), `spent $${spentUsd.toFixed(3)}`);
  }
  rankings[input.role_id] = entry;
  perRole.push(roleSummary);
}

writeFileSync(path.join(outDir, "rankings.json"), JSON.stringify(rankings));
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      experiment: "harper_eval issue 8, part A (role start rank, no verdicts)",
      inputs: { role_inputs: inputsPath, snapshot_talents: snapshotPath, sha256: { role_inputs: createHash("sha256").update(readFileSync(inputsPath)).digest("hex"), snapshot_talents: createHash("sha256").update(readFileSync(snapshotPath)).digest("hex") } },
      harper_beta: { commit: process.env.REPLAY_COMMIT ?? null, diff_sha256: process.env.REPLAY_DIFF_SHA256 ?? null },
      model: ROLE_START_DRAFT_MODEL,
      drafts_per_role: drafts,
      total_usd: Math.round(spentUsd * 10_000) / 10_000,
      total_ms: Date.now() - started,
      local_talents: local.length,
      roles: perRole,
    },
    null,
    1
  )
);
console.log(`done: ${roles.length} roles, $${spentUsd.toFixed(3)}, ${Math.round((Date.now() - started) / 1000)}s`);
await sql.end();
process.exit(0);
