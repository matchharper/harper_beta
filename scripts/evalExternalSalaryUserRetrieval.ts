/** Actual-user planner -> initial SQL lists. Production capture/SQL is read-only;
 * prepared predictions are a SELECT-only CTE, never written by this runner. */
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadExternalContext } from "../src/lib/externalRecommendationsV2/context";
import {
  getSearchPlan,
  v2CompletionRequest,
} from "../src/lib/externalRecommendationsV2/engine";
import {
  buildHybridSql,
  ROLE_JOINS,
} from "../src/lib/externalRecommendationsV2/retrieval";
import { annualSalaryKrw } from "../src/lib/externalRecommendationsV2/salary";
import {
  buildOpenAIResponsesRequest,
  toChatCompletionFromOpenAIResponse,
} from "../src/lib/llm/responsesChatAdapter";
import {
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "../src/lib/llm/usageLogging";
import { getLlmModelPricing } from "../src/lib/llm/pricing";
import { PGlite } from "@electric-sql/pglite";
import { countryQuotas } from "../src/lib/externalRecommendationsV2/countries";
import { buildEmploymentTypeSql, buildPostingRecencySql } from "../src/lib/talentOnboarding/jobPostingRecommendations";

dotenv.config({ path: ".env.local", quiet: true });
const task = "docs/evaluation/external-role-salary-retrieval";
const randomTen = process.argv.includes("--random-ten");
const fixture = `${task}/private/${randomTen ? "users-v8-random-ten" : "users-v4"}.json`;
const dataset = randomTen ? "v8-random-ten" : process.argv.includes("--combined-titles")
  ? "v7-users-combined-titles"
  : process.argv.includes("--market-value")
    ? "v5-users-market-value"
    : "v4-users";
const planOnly = process.argv.includes("--plan-only");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
const pgJson = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(pgJson).join(", ")}]`
    : JSON.stringify(v ?? null);
async function save(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
async function readOnly(sql: string) {
  return new Promise<any[]>((done, reject) => {
    const child = spawn(
      resolve("../harper_worker/venv/bin/python"),
      [
        resolve(
          "../harper_worker/llm_evals/external_recommendations_v2/read_only_capture.py"
        ),
      ],
      {
        cwd: resolve("../harper_worker"),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let output = "",
      error = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Read-only evaluation connection exceeded 60 seconds"));
    }, 60_000);
    child.stdout.on("data", (v) => {
      output += v;
    });
    child.stderr.on("data", (v) => {
      error += v;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code || !output)
        reject(new Error(error || "Read-only evaluation interrupted"));
      else {
        try {
          done(JSON.parse(output));
        } catch (error) {
          reject(error);
        }
      }
    });
    child.stdin.end(
      JSON.stringify({
        kind: "rpc",
        name: "search_external_roles_v2",
        params: { p_sql: sql },
      })
    );
  });
}
function predictionSql(sql: string, predictions: any[]) {
  if (!predictions.length) return sql;
  const join = `LEFT JOIN evaluation_predictions ep ON ep.role_id=cr.role_id
    AND cr.salary_min IS NULL AND cr.salary_max IS NULL AND btrim(coalesce(cr.salary_range,''))=''
    AND ep.source_hash=md5(jsonb_build_array(cr.name,cr.description,cr.company_workspace_id,cr.location_text,cr.country_code,cr.type)::text)`;
  const fields = {
    min: "coalesce(ep.minimum,cr.salary_min)",
    max: "coalesce(ep.maximum,cr.salary_max)",
    currency:
      "CASE WHEN ep.role_id IS NULL THEN cr.salary_currency ELSE 'KRW' END",
    period:
      "CASE WHEN ep.role_id IS NULL THEN cr.salary_period ELSE 'year' END",
  };
  let result = sql
    .replace(
      "public.external_role_salary_satisfaction(cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,",
      `public.external_role_salary_satisfaction(${fields.min},${fields.max},${fields.currency},${fields.period},`
    )
    .replace(
      "FROM fused f JOIN public.company_roles cr ON cr.role_id=f.role_id)",
      `FROM fused f JOIN public.company_roles cr ON cr.role_id=f.role_id ${join})`
    )
    .replace(
      "cr.salary_min, cr.salary_max, cr.salary_currency, cr.salary_period, cr.salary_range",
      `${fields.min} AS salary_min,${fields.max} AS salary_max,${fields.currency} AS salary_currency,${fields.period} AS salary_period,cr.salary_range`
    )
    .replace(
      "cr.summary, cr.salary_is_predicted,",
      "cr.summary, (ep.role_id IS NOT NULL OR cr.salary_is_predicted) AS salary_is_predicted,"
    );
  const finalJoin = result.lastIndexOf(ROLE_JOINS);
  if (finalJoin < 0) throw new Error("Missing runtime final role join");
  result =
    result.slice(0, finalJoin + ROLE_JOINS.length) +
    ` ${join}` +
    result.slice(finalJoin + ROLE_JOINS.length);
  return `WITH evaluation_predictions(role_id,minimum,maximum,source_hash) AS (VALUES ${predictions.map((p) => `(${literal(p.roleId)}::uuid,${p.min}::numeric,${p.max}::numeric,${literal(p.sourceHash)}::text)`).join(",")}),\n${result.slice(5)}`;
}
function metrics(rows: any[], target: number | null, baselineIds: Set<string>) {
  const count = (predicted: boolean, predicate: (r: any) => boolean) =>
    rows.filter(
      (r) =>
        Boolean(r.salary_is_predicted) === predicted &&
        predicate(annualSalaryKrw(r))
    ).length;
  return {
    selected: rows.length,
    distinctCompanies: new Set(rows.map((r) => r.company_workspace_id)).size,
    countries: Object.fromEntries(
      [...new Set(rows.map((r) => r.country_code))].map((c) => [
        String(c),
        rows.filter((r) => r.country_code === c).length,
      ])
    ),
    published: count(false, (r) => r.min !== null || r.max !== null),
    predicted: rows.filter((r) => r.salary_is_predicted).length,
    unknown: rows.filter((r) => {
      const p = annualSalaryKrw(r);
      return p.min === null && p.max === null;
    }).length,
    publishedSufficient: target
      ? count(false, (r) => r.min !== null && r.min >= target)
      : null,
    publishedShort: target
      ? count(false, (r) => r.max !== null && r.max < 0.6 * target)
      : null,
    predictedSufficient: target
      ? count(true, (r) => r.min !== null && r.min >= target)
      : null,
    predictedShort: target
      ? count(true, (r) => r.max !== null && r.max < 0.6 * target)
      : null,
    baselineRetained: rows.filter((r) => baselineIds.has(r.role_id)).length,
  };
}
async function auditRandomList(example: any, plan: any, rows: any[], result: any, auditPrefix: string) {
          const ids = rows.map(r => literal(r.role_id) + "::uuid").join(",");
          const topIds = rows.slice(0, 10).map(r => literal(r.role_id) + "::uuid").join(",");
          const audit = await readOnly(`SELECT cr.role_id::text,cr.name,cr.country_code,cr.work_mode,cr.type,
            (${buildEmploymentTypeSql(plan.plan).join(" AND ") || "true"}) AS passes_employment_filter,
            (${buildPostingRecencySql(plan.plan).where.join(" AND ") || "true"}) AS passes_recency_filter,
            cr.source_type,cr.source_provider,cr.is_expired,cr.expires_at,cr.status,cr.information->>'testOnly' AS test_only,
            cw.external_roles_enabled,cw.company_name,cd.name AS company_db_name,
            exists(SELECT 1 FROM public.talent_opportunity_recommendation tor WHERE tor.talent_id=${literal(example.userId)}::uuid AND tor.role_id=cr.role_id AND tor.opportunity_type='external_jd') AS previously_recommended,
            CASE WHEN cr.role_id IN (${topIds}) THEN left(cr.description,4000) END AS description
            FROM public.company_roles cr ${ROLE_JOINS} WHERE cr.role_id IN (${ids})`);
          await save(`${auditPrefix}-audit.json`, audit);
          result.auditCount = audit.length;
          result.countries = Object.fromEntries([...new Set(audit.map(r => r.country_code))].map(c => [String(c), audit.filter(r => r.country_code === c).length]));
          result.hardBoundaryViolations = audit.filter(r => {
            const country = plan.plan.countries.find((c: any) => c.countryCode === r.country_code);
            const remote = String(r.work_mode ?? "").toLowerCase() === "remote";
            return !country || ((country.remoteOnly || plan.plan.remoteOnly) && !remote) || (!plan.plan.includeRemote && remote)
              || !r.passes_employment_filter || !r.passes_recency_filter || r.source_type !== "external" || r.source_provider === "user_submitted" || r.is_expired === true
              || (r.expires_at && Date.parse(r.expires_at) <= Date.now())
              || ["expired", "closed", "inactive", "archived", "ended"].includes(r.status)
              || String(r.test_only).toLowerCase() === "true" || !r.external_roles_enabled || r.previously_recommended;
          }).map(r => r.role_id);
          result.blockedCompanyViolations = audit.filter(r => example.loaded.blockedCompanies.some((c: string) =>
            String(r.company_name ?? "").toLowerCase().includes(c.toLowerCase()) || String(r.company_db_name ?? "").toLowerCase().includes(c.toLowerCase()))).map(r => r.role_id);
}
async function main() {
  const admin: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          if (!["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase()))
            throw new Error("Evaluation blocks production HTTP writes");
          return fetch(input, { ...init, signal: AbortSignal.timeout(50_000) });
        },
      },
    }
  );
  if (process.argv.includes("--capture")) {
    if (randomTen) {
      await mkdir(`${task}/private`, { recursive: true, mode: 0o700 });
      const old = JSON.parse(await readFile(`${task}/private/users-v4.json`, "utf8"));
      const seed = randomUUID();
      const excluded = old.map((c: any) => literal(c.userId) + "::uuid").join(",");
      const selectionSql = `SELECT u.user_id::text, count(*) over() AS eligible_count
        FROM public.talent_users u JOIN public.talent_setting s ON s.user_id=u.user_id
        WHERE u.deleted_at IS NULL AND s.is_onboarding_done=true AND s.status<>'stopped'
        AND s.get_external_recommendation IS DISTINCT FROM false
        AND u.user_id NOT IN (${excluded})
        AND EXISTS(SELECT 1 FROM public.talent_experiences e WHERE e.talent_id=u.user_id)
        AND EXISTS(SELECT 1 FROM public.talent_contexts c WHERE c.talent_id=u.user_id AND c.collection='brief' AND c.deleted_at IS NULL)
        AND EXISTS(SELECT 1 FROM public.talent_behavior_contexts b WHERE b.talent_id=u.user_id AND b.context_text IS NOT NULL)
        ORDER BY md5(u.user_id::text || ${literal(seed)}) LIMIT 10`;
      const ids = await readOnly(selectionSql);
      if (ids.length !== 10) throw new Error("Expected ten eligible users");
      const captured = [];
      for (const [i, row] of ids.entries()) {
        const began = performance.now();
        const loaded = await loadExternalContext(admin, row.user_id);
        captured.push({ caseId: `random-${String(i + 1).padStart(2, "0")}`, userId: row.user_id, loaded, contextMs: performance.now() - began });
      }
      await save(fixture, captured);
      await save(`${task}/manifest-${dataset}.json`, {
        datasetVersion: dataset, frozenInputHash: sha(await readFile(fixture, "utf8")),
        capturedAt: new Date().toISOString(), caseIds: captured.map(c => c.caseId),
        selection: "Ten hash-random eligible completed-onboarding external-search users with existing profile, Brief and Behavior; excludes all three users-v4 accounts",
        seed, eligiblePopulation: Number(ids[0].eligible_count), excludedPriorCount: old.length,
        canonicalRunner: "scripts/evalExternalSalaryUserRetrieval.ts --random-ten",
        gold: `gold-${dataset}.json`, readOnly: true,
        privacy: "Owner-only ignored private/runs; source contexts sent only to the existing configured planner provider",
      });
      console.log(JSON.stringify({ captured: captured.length, eligiblePopulation: Number(ids[0].eligible_count), fixture }));
      return;
    }
    if (dataset !== "v4-users")
      throw new Error("Market-value evaluation reuses the frozen v4 inputs");
    await mkdir(`${task}/private`, { recursive: true, mode: 0o700 });
    const ids =
      await readOnly(`SELECT user_id::text FROM public.talent_users WHERE lower(email)='daniel@matchharper.com' AND deleted_at IS NULL
      UNION ALL SELECT user_id::text FROM (SELECT u.user_id FROM public.talent_users u JOIN public.talent_setting s ON s.user_id=u.user_id
      WHERE u.deleted_at IS NULL AND lower(coalesce(u.email,''))<>'daniel@matchharper.com' AND s.is_onboarding_done=true AND s.status<>'stopped'
      AND s.get_external_recommendation IS DISTINCT FROM false
      AND EXISTS(SELECT 1 FROM public.talent_experiences e WHERE e.talent_id=u.user_id)
      AND EXISTS(SELECT 1 FROM public.talent_contexts c WHERE c.talent_id=u.user_id AND c.collection='brief' AND c.deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM public.talent_behavior_contexts b WHERE b.talent_id=u.user_id AND b.context_text IS NOT NULL)
      ORDER BY md5(u.user_id::text || 'salary-user-v4-20261015') LIMIT 2) sampled`);
    if (ids.length !== 3)
      throw new Error("Expected Daniel plus two eligible talents");
    const cases = [];
    for (let i = 0; i < ids.length; i++)
      cases.push({
        caseId: `user-${i + 1}`,
        userId: ids[i].user_id,
        loaded: await loadExternalContext(admin, ids[i].user_id),
      });
    await save(fixture, cases);
    await save(`${task}/manifest-v4-users.json`, {
      datasetVersion: "v4-users",
      role: "actual user planner and initial 500-role salary retrieval",
      frozenInputHash: sha(await readFile(fixture, "utf8")),
      capturedAt: new Date().toISOString(),
      caseIds: cases.map((c) => c.caseId),
      selection:
        "user-requested Daniel and two fixed-seed hash-random eligible accounts",
      canonicalRunner: "scripts/evalExternalSalaryUserRetrieval.ts",
      readOnly: true,
      gold: "gold-v4-users.json",
      privacy:
        "raw identities/profile/Brief/Behavior only in ignored owner-only private/runs",
    });
    console.log(JSON.stringify({ captured: cases.length, fixture }));
    return;
  }
  const text = await readFile(fixture, "utf8");
  const onlyCase = process.argv.find((v) => v.startsWith("--case="))?.slice(7);
  const cases = JSON.parse(text).filter(
    (v: any) => !onlyCase || v.caseId === onlyCase
  );
  if (!cases.length) throw new Error("Requested frozen case does not exist");
  const manifest = JSON.parse(
    await readFile(`${task}/manifest-${dataset}.json`, "utf8")
  );
  const gold = await readFile(`${task}/gold-${dataset}.json`, "utf8");
  if (sha(text) !== manifest.frozenInputHash)
    throw new Error("Frozen input changed");
  const auditRun = process.argv.find(v => v.startsWith("--audit-run="))?.slice(12);
  if (auditRun) {
    if (!randomTen) throw new Error("Audit-only recovery is for the frozen random-ten sample");
    const sourceManifest = JSON.parse(await readFile(`${auditRun}/manifest.json`, "utf8"));
    if (sourceManifest.frozenInputHash !== sha(text) || sourceManifest.datasetVersion !== dataset) throw new Error("Audit source does not match frozen input");
    const out = `${task}/runs/audit-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await mkdir(out, { recursive: true, mode: 0o700 });
    const summaries = [];
    for (const example of cases) {
      const source = `${auditRun}/${example.caseId}`;
      try {
        const rows = JSON.parse(await readFile(`${source}-rows.json`, "utf8"));
        const plan = JSON.parse(await readFile(`${source}-plan.json`, "utf8"));
        const receipt = JSON.parse(await readFile(`${source}-response.json`, "utf8")).receipt;
        const embeddings = JSON.parse(await readFile(`${source}-embedding-receipts.json`, "utf8"));
        const sqlAt = (await stat(`${source}-search.sql`)).mtimeMs;
        const rowsAt = (await stat(`${source}-rows.json`)).mtimeMs;
        const requestAt = (await stat(`${source}-request.json`)).mtimeMs;
        const planAt = (await stat(`${source}-plan.json`)).mtimeMs;
        const embeddingMs = embeddings.reduce((n: number, r: any) => n + r.elapsedMs, 0);
        const result: any = { caseId: example.caseId, status: rows.length ? "ok" : "empty",
          count: rows.length, uniqueRoles: new Set(rows.map((r: any) => r.role_id)).size,
          companies: new Set(rows.map((r: any) => r.company_name)).size,
          missingTitle: rows.filter((r: any) => !r.role_name).length,
          missingCompany: rows.filter((r: any) => !r.company_name).length,
          missingUrl: rows.filter((r: any) => !r.external_jd_url).length,
          vectorCount: plan.titleVectors.length, embeddingCalls: embeddings.length,
          contextMs: example.contextMs, plannerMs: receipt.elapsedMs, embeddingMs,
          retrievalMs: rowsAt - sqlAt, planAndEmbeddingMs: planAt - requestAt,
          totalMs: example.contextMs + planAt - requestAt + rowsAt - sqlAt,
          plannerCostUsd: receipt.cost.estimatedCostUsd,
          embeddingCostUsd: embeddings.reduce((n: number, r: any) => n + r.estimatedCostUsd, 0),
          retrievalTimingSource: "First-attempt search.sql and rows.json file mtimes; includes minimal file I/O. API times are original monotonic receipts.",
        };
        result.totalCostUsd = result.plannerCostUsd + result.embeddingCostUsd;
        result.invalidUrlRows = rows.filter((r: any) => { try { return !["http:", "https:"].includes(new URL(r.external_jd_url).protocol); } catch { return Boolean(r.external_jd_url); } }).length;
        result.duplicateCompanyTitleRows = rows.length - new Set(rows.map((r: any) => JSON.stringify([r.company_name, r.role_name]))).size;
        const urls = rows.filter((r: any) => r.external_jd_url).map((r: any) => r.external_jd_url);
        result.duplicateUrlRows = urls.length - new Set(urls).size;
        const began = performance.now();
        if (rows.length) await auditRandomList(example, plan, rows, result, `${out}/${example.caseId}`);
        result.auditMs = performance.now() - began;
        summaries.push(result);
        await save(`${out}/${example.caseId}-result.json`, result);
        console.log(JSON.stringify({ ...result, hardBoundaryViolations: result.hardBoundaryViolations?.length, blockedCompanyViolations: result.blockedCompanyViolations?.length }));
      } catch (error) {
        const failed = { caseId: example.caseId, error: String(error) };
        summaries.push(failed); await save(`${out}/${example.caseId}-error.json`, failed);
        console.log(JSON.stringify({ caseId: example.caseId, auditError: String(error).slice(0, 240) }));
      }
    }
    await save(`${out}/manifest.json`, { dataset, inputHash: sha(text), sourceRun: auditRun, modelCalls: 0, searchCalls: 0,
      reason: "Recover source-row audit only after schema-qualification bug in evaluation code; never rerun planner or retrieval",
      runnerHash: sha(await readFile("scripts/evalExternalSalaryUserRetrieval.ts", "utf8")),
      costSource: "Original provider receipts; no new API charges", timingSource: "Original API receipts + preserved first-search artifact mtimes; audit is separate",
    });
    await save(`${out}/summary.json`, summaries);
    console.log(JSON.stringify({ output: out, completed: summaries.filter(r => !("error" in r)).length }));
    return;
  }
  const dir = `${task}/runs/users-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const predictionPath =
    "docs/evaluation/company-role-salary-estimation/runs/prefill-reviewed-v8-final-20261015/predictions.json";
  const predictionText = (planOnly || randomTen)
      ? "[]"
      : await readFile(predictionPath, "utf8"),
    predictions = new Map(
      JSON.parse(predictionText).map((p: any) => [p.roleId, p])
    );
  await save(`${dir}/manifest.json`, {
    ...manifest,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirtyWorktree: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
    ),
    planOnly,
    goldHash: sha(gold),
    predictionHash: sha(predictionText),
    weights: randomTen ? [0.35] : [0, 0.35],
    models: ["gpt-6-luna"],
    reasoning: "low",
    provider: "OpenAI Responses /v1/responses; store=false",
    timeoutMs: 90000,
    retries: 0,
    runtimeHashes: Object.fromEntries(
      await Promise.all(
        ["engine", "retrieval", "prompts", "salary", "searchTitles", "countries"].map(async (f) => [
          f,
          sha(
            await readFile(`src/lib/externalRecommendationsV2/${f}.ts`, "utf8")
          ),
        ])
      )
    ),
    allProductionWritesBlocked: true,
    selectedCaseIds: cases.map((v: any) => v.caseId),
  });
  const nativeFetch = globalThis.fetch;
  let embeddingReceipts: any[] = [];
  if (randomTen) globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== "https://api.openai.com/v1/embeddings") return nativeFetch(input, init);
    const began = performance.now();
    const request = JSON.parse(String(init?.body));
    const response = await nativeFetch(input, init);
    const body = await response.clone().json();
    embeddingReceipts.push({ model: request.model, input: request.input, inputCount: request.input.length,
      vectorCount: body.data?.length ?? 0, usage: body.usage, status: response.status,
      elapsedMs: performance.now() - began,
      estimatedCostUsd: typeof body.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens * 0.02 / 1e6 : null,
      pricePerMillionTokensUsd: 0.02, pricingSource: "https://developers.openai.com/api/docs/models/text-embedding-3-small", verifiedAt: "2026-10-15",
    });
    return response;
  };
  const sdk = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 90000,
  });
  const results = [];
  let reservedUsd = 0;
  for (const example of cases) {
    const prefix = `${dir}/${example.caseId}`;
    let callReserveUsd = 0;
    let receipt: any;
    let stage = "planner";
    embeddingReceipts = [];
    const caseStarted = performance.now();
    try {
      const complete = async (system: string, input: string, label: string) => {
        const config = v2CompletionRequest(system, input, label);
        const request = buildOpenAIResponsesRequest({
          model: config.primaryModel!,
          reasoningEffort: config.openAIResponsesReasoningEffort,
          requestBody: {
            messages: config.messages,
            max_completion_tokens: config.maxTokens,
            temperature: config.temperature ?? 0.35,
            response_format: { type: "json_object" },
          },
        });
        const pricing = getLlmModelPricing(config.primaryModel!, {
          useStandardRates: true,
        });
        if (!pricing) throw new Error("Missing planner price for budget guard");
        const reserve =
          (Buffer.byteLength(JSON.stringify(request)) *
            pricing.inputUsdPerMtok +
            8000 * pricing.outputUsdPerMtok) /
          1e6;
        if (reservedUsd + reserve > 0.5)
          throw new Error("Light evaluation USD 0.50 reserve limit");
        reservedUsd += reserve;
        callReserveUsd = reserve;
        await save(`${prefix}-request.json`, request);
        const began = performance.now();
        const response = await sdk.responses.create(request as any, {
          signal: AbortSignal.timeout(90000),
        });
        const converted = toChatCompletionFromOpenAIResponse(response);
        const cost = estimateLlmUsageCost(
          response.model,
          extractLlmTokenUsage(converted)
        );
        receipt = {
          elapsedMs: performance.now() - began,
          cost,
          reserveUsd: reserve,
          usage: response.usage,
          actualModel: response.model,
        };
        await save(`${prefix}-response.json`, { response, receipt });
        return JSON.parse(converted.choices[0].message.content!);
      };
      const resumeRun = process.argv
        .find((v) => v.startsWith("--plan-run="))
        ?.slice(11);
      const plan = resumeRun
        ? JSON.parse(
            await readFile(`${resumeRun}/${example.caseId}-plan.json`, "utf8")
          )
        : await getSearchPlan(
            {
              admin,
              userId: example.userId,
              surface: "worker",
              language: "ko",
              dryRun: true,
            },
            example.loaded,
            complete
          );
      if (resumeRun)
        receipt = JSON.parse(
          await readFile(`${resumeRun}/${example.caseId}-response.json`, "utf8")
        ).receipt;
      await save(`${prefix}-plan.json`, plan);
      if (randomTen) {
        await save(`${prefix}-embedding-receipts.json`, embeddingReceipts);
        const planAndEmbeddingMs = performance.now() - caseStarted;
        stage = "retrieval";
        const sql = buildHybridSql({ plan: plan.plan, vectors: plan.titleVectors, userId: example.userId,
          blockedCompanies: example.loaded.blockedCompanies, limit: 500, targetSalaryKrw: plan.targetSalaryKrw, listOnly: true });
        await writeFile(`${prefix}-search.sql`, sql, { mode: 0o600, flag: "wx" });
        const began = performance.now();
        const rows = await readOnly(sql);
        const retrievalMs = performance.now() - began;
        await save(`${prefix}-rows.json`, rows);
        const result: any = {
          caseId: example.caseId, status: rows.length ? "ok" : "empty", count: rows.length,
          uniqueRoles: new Set(rows.map(r => r.role_id)).size,
          companyCount: new Set(rows.map(r => r.company_name)).size,
          missingTitle: rows.filter(r => !r.role_name).length, missingCompany: rows.filter(r => !r.company_name).length,
          missingUrl: rows.filter(r => !r.external_jd_url).length,
          countryPlan: plan.plan.countries, targetSalaryKrw: plan.targetSalaryKrw,
          roleTitles: plan.plan.roleTitles, vectorCount: plan.titleVectors.length,
          contextMs: example.contextMs, plannerMs: receipt?.elapsedMs ?? 0,
          embeddingMs: embeddingReceipts.reduce((s, r) => s + r.elapsedMs, 0), planAndEmbeddingMs, retrievalMs,
          totalMs: example.contextMs + planAndEmbeddingMs + retrievalMs,
          plannerCostUsd: receipt?.cost?.estimatedCostUsd ?? null,
          embeddingCostUsd: embeddingReceipts.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0),
          embeddingCalls: embeddingReceipts.length, paidCalls: resumeRun ? 0 : 1,
        };
        result.totalCostUsd = (result.plannerCostUsd ?? 0) + result.embeddingCostUsd;
        // A separate read audits current source rows without changing the timed search projection.
        stage = "audit";
        if (rows.length) {
          await auditRandomList(example, plan, rows, result, prefix);
        }
        results.push(result);
        await save(`${prefix}-result.json`, result);
        console.log(JSON.stringify({ ...result, roleTitles: undefined, countryPlan: undefined, hardBoundaryViolations: result.hardBoundaryViolations?.length, blockedCompanyViolations: result.blockedCompanyViolations?.length }));
        continue;
      }
      if (planOnly) {
        const result = {
          caseId: example.caseId,
          targetSalaryKrw: plan.targetSalaryKrw,
          countries: plan.plan.countries,
          positiveMarketBenchmark:
            typeof plan.targetSalaryKrw === "number" &&
            plan.targetSalaryKrw > 0,
          receipt,
          paidCalls: resumeRun ? 0 : 1,
        };
        results.push(result);
        await save(`${prefix}-result.json`, result);
        console.log(JSON.stringify(result));
        continue;
      }
      const build = (weight: number) =>
        buildHybridSql({
          plan: plan.plan,
          vectors: plan.titleVectors,
          userId: example.userId,
          blockedCompanies: example.loaded.blockedCompanies,
          limit: 500,
          targetSalaryKrw: plan.targetSalaryKrw,
          salaryWeight: weight,
        });
      if (process.argv.includes("--sql-only")) {
        const sql = `SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',q.role_id,'company_workspace_id',q.company_workspace_id,'role_name',q.role_name,'company_name',q.company_name,'country_code',q.country_code,'location_text',q.location_text,'work_mode',q.work_mode,'external_jd_url',q.external_jd_url,'posted_at',q.posted_at,'search_rank',q.search_rank,'salary_min',q.salary_min,'salary_max',q.salary_max,'salary_currency',q.salary_currency,'salary_period',q.salary_period,'salary_range',q.salary_range,'salary_is_predicted',q.salary_is_predicted,'source_hash',md5(jsonb_build_array(q.role_name,q.description,q.company_workspace_id,q.location_text,q.country_code,q.type)::text))),'[]'::jsonb) as rows FROM (${build(0.35)}) q`;
        await writeFile(`${prefix}-compact.sql`, sql, {
          mode: 0o600,
          flag: "wx",
        });
        console.log(
          JSON.stringify({ sqlPath: `${prefix}-compact.sql`, paidCalls: 0 })
        );
        continue;
      }
      const poolSql = build(0).replace(/LIMIT 500$/, "LIMIT 36000");
      const started = performance.now();
      const replayPool = process.argv
        .find((v) => v.startsWith("--replay-pool="))
        ?.slice(14);
      const pool = replayPool
        ? JSON.parse(await readFile(replayPool, "utf8"))
        : await readOnly(poolSql);
      await save(`${prefix}-pool.json`, pool);
      const poolMs = performance.now() - started;
      const overlay = pool.flatMap((row) => {
        const p: any = predictions.get(row.role_id);
        const sourceHash =
          row.source_hash ??
          createHash("md5")
            .update(
              pgJson([
                row.role_name,
                row.description,
                row.company_workspace_id,
                row.location_text,
                row.country_code,
                row.type,
              ])
            )
            .digest("hex");
        return p &&
          p.sourceHash === sourceHash &&
          row.salary_min == null &&
          row.salary_max == null &&
          !String(row.salary_range ?? "").trim()
          ? [p]
          : [];
      });
      const variants: any[] = [];
      let baselineIds = new Set<string>();
      const replayDb = replayPool ? new PGlite() : null;
      const poolById = new Map(pool.map((r: any) => [r.role_id, r]));
      if (replayDb) {
        const migration = await readFile(
          "supabase/migrations/20261014230152_external_salary_partial_bounds.sql",
          "utf8"
        );
        await replayDb.exec(
          migration.slice(0, migration.indexOf("revoke all"))
        );
        await replayDb.exec(
          "create table public.company_roles(role_id uuid,country_code text,posted_at timestamptz,salary_min numeric,salary_max numeric,salary_currency text,salary_period text); create table replay_fused(role_id uuid,search_rank numeric)"
        );
        const predicted = new Map(overlay.map((p: any) => [p.roleId, p]));
        const rankedRows = pool.map((r: any) => {
          const p: any = predicted.get(r.role_id);
          const row = p
            ? {
                ...r,
                salary_min: p.min,
                salary_max: p.max,
                salary_currency: "KRW",
                salary_period: "year",
                salary_is_predicted: true,
              }
            : r;
          poolById.set(r.role_id, row);
          return row;
        });
        await replayDb.query(
          "insert into public.company_roles select role_id,country_code,posted_at,salary_min,salary_max,salary_currency,salary_period from jsonb_to_recordset($1) as x(role_id uuid,country_code text,posted_at timestamptz,salary_min numeric,salary_max numeric,salary_currency text,salary_period text)",
          [JSON.stringify(rankedRows)]
        );
        await replayDb.query(
          "insert into replay_fused select role_id,search_rank from jsonb_to_recordset($1) as x(role_id uuid,search_rank numeric)",
          [JSON.stringify(rankedRows)]
        );
      }
      for (const weight of [0, 0.35]) {
        const sql = predictionSql(build(weight), overlay);
        await writeFile(`${prefix}-w${weight}.sql`, sql, {
          mode: 0o600,
          flag: "wx",
        });
        const began = performance.now();
        let rows: any[];
        if (replayDb) {
          const compiled = build(weight);
          const stage = compiled.slice(
            compiled.indexOf("salary_ranked AS"),
            compiled.indexOf("\nSELECT cr.role_id")
          );
          const quotas = countryQuotas(plan.plan.countries, 500)
            .map((q) => `(${literal(q.countryCode)},${q.quota})`)
            .join(",");
          const replaySql = `WITH country_targets(country_code,quota) AS (VALUES ${quotas}),fused AS (select * from replay_fused),${stage}\nSELECT f.role_id::text,f.search_rank FROM allocated f JOIN public.company_roles cr ON cr.role_id=f.role_id ${compiled.slice(compiled.lastIndexOf("\nORDER BY (f.country_rank"))}`;
          await writeFile(`${prefix}-replay-w${weight}.sql`, replaySql, {
            mode: 0o600,
            flag: "wx",
          });
          const selected = await replayDb.query<{
            role_id: string;
            search_rank: string;
          }>(replaySql);
          rows = selected.rows.map((r) => ({
            ...(poolById.get(r.role_id) as any),
            search_rank: r.search_rank,
          }));
        } else rows = await readOnly(sql);
        if (weight === 0) baselineIds = new Set(rows.map((r) => r.role_id));
        await save(`${prefix}-w${weight}-rows.json`, rows);
        const variant = {
          weight,
          sqlMs: performance.now() - began,
          ...metrics(rows, plan.targetSalaryKrw, baselineIds),
          top20: rows.slice(0, 20).map((r, i) => ({
            rank: i + 1,
            roleId: r.role_id,
            company: r.company_name,
            title: r.role_name,
            country: r.country_code,
            location: r.location_text,
            workMode: r.work_mode,
            url: r.external_jd_url,
            annualSalaryKrw: annualSalaryKrw(r),
            predicted: Boolean(r.salary_is_predicted),
            searchRank: r.search_rank,
          })),
        };
        variants.push(variant);
      }
      if (replayDb) await replayDb.close();
      const result = {
        caseId: example.caseId,
        userId: example.userId,
        targetSalaryKrw: plan.targetSalaryKrw,
        titles: plan.plan.roleTitles,
        searchIntent: plan.plan.searchIntentSummary,
        countries: plan.plan.countries,
        defaultAction: plan.defaultAction,
        poolRows: pool.length,
        overlaid: overlay.length,
        poolMs,
        receipt,
        variants,
        frozenPoolReplay: Boolean(replayPool),
        sourcePlanRun: resumeRun ?? null,
        paidCalls: resumeRun ? 0 : 1,
      };
      results.push(result);
      await save(`${prefix}-result.json`, result);
      console.log(
        JSON.stringify({
          ...result,
          userId: undefined,
          receipt: undefined,
          variants: variants.map(({ top20, ...v }) => v),
        })
      );
    } catch (error) {
      const failed = {
        caseId: example.caseId,
        error: String(error),
        possibleCostReserveUsd: callReserveUsd,
        ...(randomTen ? { stage, elapsedMs: performance.now() - caseStarted, receipt, embeddingReceipts } : {}),
      };
      results.push(failed);
      await save(`${prefix}-error.json`, failed);
      console.log(JSON.stringify(failed));
    }
  }
  await save(`${dir}/summary.json`, {
    results,
    readOnly: true,
    persistedPredictions: false,
  });
  console.log(
    JSON.stringify({
      output: dir,
      completed: results.filter((r) => !("error" in r)).length,
    })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
