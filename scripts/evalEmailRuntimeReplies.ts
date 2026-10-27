import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import Module from "node:module";
import path from "node:path";

const root = path.resolve("docs/evaluation/email-channel-reply");
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const version = argument("--dataset") ?? "v1";
if (!["v1", "application-v1", "application-v2", "application-question-v1", "application-continuity-v1"].includes(version)) throw Error("Unknown dataset");
const dataset = readJson(path.join(root, `cases-${version}.json`));
const gold = readJson(path.join(root, `gold-${version}.json`));
const frozen = readJson(path.join(root, `manifest-${version}.json`));
for (const name of [`cases-${version}.json`, `gold-${version}.json`])
  if (sha(readFileSync(path.join(root, name))) !== frozen.hashes[name])
    throw Error("Frozen input/gold hash changed");
if (dataset.cases.some((c: any) => !gold.cases.find((g: any) => g.id === c.id)))
  throw Error("Case gold missing");
if (process.argv.includes("--validate-only")) {
  console.log(
    JSON.stringify({
      valid: true,
      cases: dataset.cases.length,
      turns: dataset.cases.reduce((n: number, c: any) => n + c.turns.length, 0),
    })
  );
  process.exit(0);
}
process.umask(0o077);
const runId =
  argument("--run-id") ?? new Date().toISOString().replace(/[:.]/g, "-");
if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error("Invalid run ID");
const runDir = path.join(root, "runs", runId);
if (existsSync(runDir)) throw Error("Run already exists; never overwrite");
mkdirSync(runDir, { recursive: true, mode: 0o700 });
chmodSync(runDir, 0o700);
const save = (name: string, value: unknown) => {
  const f = path.join(runDir, name);
  writeFileSync(
    f,
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 }
  );
  chmodSync(f, 0o600);
};
const context = new AsyncLocalStorage<string>();
const records: Record<string, any> = {};
const scheduled: Array<{ fn: () => unknown; key: string }> = [];
const incoming = new Map<string, any>();
const attachmentBytes = Buffer.from(
  "이가온\nBackend Engineer\n경력: 합성 SaaS 기업에서 2022년 1월부터 2026년 9월까지 백엔드 개발. Python, PostgreSQL, API 설계와 비동기 재시도 및 중복 처리 방지 담당. API 지연 시간을 40% 줄인 합성 테스트 성과. 학력: 합성대학교 컴퓨터공학 학사, 2021년 졸업. 이 자료는 실존 인물의 이력이 아닌 합성 QA 이력서입니다."
);
const outgoing: any[] = [];
const idempotency = new Map<string, any>();
let transportBase = "";
const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url!, transportBase);
  const respond = (code: number, data: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/resume.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(attachmentBytes);
    return;
  }
  if (req.headers.authorization !== `Bearer ${process.env.RESEND_API_KEY}`) {
    respond(401, { error: "local test credential required" });
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/emails/receiving/")) {
    const parts = url.pathname.split("/");
    const mail = incoming.get(parts[3]);
    respond(
      mail ? 200 : 404,
      parts[4] === "attachments"
        ? { data: mail?.attachments ?? [] }
        : (mail ?? {})
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/emails") {
    const body = JSON.parse(raw),
      key = String(req.headers["idempotency-key"] ?? "");
    if (
      ![]
        .concat(body.to ?? [], body.cc ?? [])
        .every((email: string) => String(email).endsWith(".invalid"))
    ) {
      respond(403, {
        error: "capture only accepts synthetic .invalid recipients",
      });
      return;
    }
    if (key && idempotency.has(key)) {
      respond(200, { id: idempotency.get(key).id });
      return;
    }
    const item = {
      id: `capture-${randomUUID()}`,
      caseId: context.getStore(),
      idempotencyKey: key,
      ...body,
    };
    outgoing.push(item);
    if (key) idempotency.set(key, item);
    respond(200, { id: item.id });
    return;
  }
  respond(404, { error: "capture endpoint not found" });
});

async function main() {
  const local = await import("./localE2e/env.mjs");
  const { env } = local.stackEnv();
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"])
    if (new URL(env[name]).hostname !== "127.0.0.1")
      throw Error("Loopback database required");
  const state = local.readJson(
    path.join(local.privateDir, "processes.json"),
    {}
  );
  for (const name of ["email", "opportunity", "slack", "web-queue"]) {
    const pid = state[name]?.pid;
    if (pid) {
      try {
        process.kill(pid, 0);
        throw Error(`Local ${name} must be stopped`);
      } catch (e: any) {
        if (e.code !== "ESRCH") throw e;
      }
    }
  }
  // Provider credentials are deliberately retained; all external side-effect
  // credentials are blanked. Local mail never calls Gmail or real Resend.
  for (const key of Object.keys(process.env))
    if (
      !["PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "TERM"].includes(key)
    )
      process.env[key] = "";
  Object.assign(process.env, env, {
    EMAIL_RUNTIME_CONCURRENCY: "2",
    RESEND_API_KEY: `local-e2e-email-eval-${randomUUID()}`,
  });
  for (const key of Object.keys(process.env))
    if (/^(COMPOSIO|SLACK_.*TOKEN|SLACK_AGENT|SENTRY|VERCEL_)/.test(key))
      process.env[key] = "";
  process.env.SLACK_AGENT_WORKER_TARGET = "local-e2e";
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  transportBase = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.HARPER_LOCAL_MAIL_URL = transportBase;
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url
    );
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.href === "https://attachment.email-qa.invalid/resume.txt")
      return new Response(attachmentBytes, {
        headers: { "content-type": "text/plain" },
      });
    if (
      !loopback &&
      !["api.anthropic.com", "api.openai.com", "openrouter.ai"].includes(
        url.hostname
      )
    )
      throw Error(`Evaluation blocks external side effect at ${url.hostname}`);
    const key = context.getStore();
    let call: any;
    if (!loopback && key) {
      let body;
      try {
        body = JSON.parse(String(init?.body ?? "{}"));
      } catch {
        body = {};
      }
      call = {
        url: `${url.origin}${url.pathname}`,
        body,
        at: new Date().toISOString(),
      };
      records[key].providerCalls.push(call);
      save(`${key}.json`, records[key]);
    }
    const response = await originalFetch(input, init);
    if (call) {
      call.status = response.status;
      const raw = await response.clone().text();
      try {
        call.response = JSON.parse(raw);
      } catch {
        call.responseText = raw;
      }
    }
    return response;
  };
  const nodeModule = Module as any,
    load = nodeModule._load;
  nodeModule._load = function (name: string, parent: unknown, isMain: boolean) {
    if (name === "server-only") return {};
    const value = load.call(this, name, parent, isMain);
    // Synthetic boundaries only. The conversation LLM, suggestion writer,
    // database, tool executors, resume saves and MIME delivery remain real.
    if (version.startsWith("application-") && /agentTools\/web/.test(name)) return {
      ...value,
      executeSharedOpenUrl: async () => ({ ok:true, markdown:"Aurora API Engineer: Python APIs, PostgreSQL, reliable async jobs. Public application asks for contact info and a resume only; no cover letter.", title:"Aurora API Engineer", url:"https://application.email-qa.invalid/apply", cached:false }),
      executeSharedWebSearch: async () => ({text:"Aurora builds workflow software; this is a synthetic test company."}),
    };
    if (version.startsWith("application-") && /applicationFormInspection/.test(name)) return {
      ...value,
      inspectApplicationForm: async () => {
        const c = dataset.cases.find((c:any) => c.id === context.getStore());
        return { status:"read", url:"https://application.email-qa.invalid/apply", checkedAt:new Date().toISOString(), limitations:[], fields:c.application.fields ?? [{label:"Resume",type:"file",required:true,options:[],instructions:"Upload resume PDF",fileTypes:[".pdf"],maxLength:null}], submission:{status:c.application.submission,reason:c.application.submission === "supported" ? "Public synthetic form accepts a resume." : "The actual form requires the applicant to log in; assisted submission is unavailable."} };
      },
    };
    if (version.startsWith("application-") && /applicationBrowserServer/.test(name)) return {
      ...value,
      runApplicationBrowser: async (store:any, messageId:number) => {
        const {sessionOperation,saveSession} = await import("../src/lib/career/simulation/sessionStore");
        const {endSimulationSession} = await import("../src/lib/career/simulation/session");
        const current = await sessionOperation({...store,operation:"read",messageId});
        if (!current?.state.browser || current.state.browser.status !== "queued") throw Error("Expected authorized queued browser");
        const next = endSimulationSession({...current.state,browser:{...current.state.browser,status:"succeeded",result:{summary:"Application received by the synthetic test site.",url:"https://application.email-qa.invalid/receipt",evidence:"Synthetic capture receipt: one application accepted; fixture transport only."}}},"completed");
        records[context.getStore()!].syntheticSubmissions ??= [];
        records[context.getStore()!].syntheticSubmissions.push({documentId:current.state.browser.documentId,purpose:current.state.browser.purpose});
        await saveSession(store,current,next,"eval-browser-receipt:"+messageId);
      },
    };
    if (name === "next/server")
      return {
        ...value,
        after: (fn: () => unknown) =>
          scheduled.push({ fn, key: context.getStore() ?? "background" }),
      };
    return value;
  };
  const python = path.join(local.state, "venv/bin/python");
  const sql = (query: string, params: any[] = []) =>
    JSON.parse(
      execFileSync(
        python,
        [
          "-c",
          `import os,json,sys,psycopg\nfrom urllib.parse import urlsplit\nfrom psycopg.rows import dict_row\nassert urlsplit(os.environ['DATABASE_URL']).hostname=='127.0.0.1'\np=json.load(sys.stdin)\nwith psycopg.connect(os.environ['DATABASE_URL'],row_factory=dict_row) as c:\n with c.cursor() as cur:\n  cur.execute(p['query'],p['params'] if p['params'] else None)\n  rows=cur.fetchall() if cur.description else []\n  print(json.dumps(rows,default=str))`,
        ],
        {
          env: process.env as any,
          input: JSON.stringify({ query, params }),
          encoding: "utf8",
        }
      )
    );
  if (sql("SELECT id FROM local_e2e.environment")[0]?.id !== "harper-local-e2e")
    throw Error("Local DB marker missing");
  if (
    sql(
      "SELECT count(*) AS n FROM pg_extension WHERE extname IN ('http','pg_net')"
    )[0].n
  )
    throw Error("Local DB has outbound HTTP extension");
  if (
    !sql(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_reply_jobs' AND column_name='worker_target'"
    ).length
  ) {
    sql(
      readFileSync(
        "supabase/migrations/20261013035308_email_vercel_runtime.sql",
        "utf8"
      )
    );
    sql("NOTIFY pgrst,'reload schema'");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin: any = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { processEmailRuntimeMessage } =
    await import("../src/lib/email/runtime/consumer");
  const { createEmailReplyAlias } = await import("../src/lib/email/inbound");
  const { emailAssistantModel } =
    await import("../src/lib/email/runtime/model");
  const { TALENT_RESUME_BUCKET } =
    await import("../src/lib/talentOnboarding/server");
  const { data: buckets, error: bucketError } =
    await admin.storage.listBuckets();
  if (bucketError) throw bucketError;
  if (!buckets.some((bucket: any) => bucket.name === TALENT_RESUME_BUCKET)) {
    const { error } = await admin.storage.createBucket(TALENT_RESUME_BUCKET, {
      public: false,
    });
    if (error) throw error;
  }
  const files = [
    "src/lib/email/runtime/prompt.ts",
    "src/lib/email/runtime/reply.ts",
    "src/lib/email/runtime/onboarding.ts",
    "src/lib/email/runtime/tools.ts",
    "src/lib/email/runtime/format.ts",
    "src/lib/email/runtime/application.ts",
    "src/lib/email/runtime/context.ts",
    "src/lib/email/runtime/model.ts",
    "src/lib/career/simulation/server.ts",
    "src/lib/career/simulation/preparationPrompt.ts",
    "src/lib/career/simulation/suggestionWriter.ts",
    "src/lib/career/simulation/toolExecution.ts",
    "src/lib/career/simulation/readyForRole.ts",
    "src/lib/career/simulation/emailContract.ts",
    "src/lib/career/simulation/profileSnapshot.ts",
    "src/lib/career/simulation/applicationBrowser.ts",
    "src/lib/career/simulation/applicationBrowserServer.ts",
    "src/lib/career/prompts/resumePolicy.ts",
    "src/lib/talentOnboarding/profileStore.ts",
    "scripts/evalEmailRuntimeReplies.ts",
    "src/lib/career/chatTurn.ts",
    "src/lib/career/llm.ts",
    "src/lib/career/prompts/conversationPlan.ts",
  ];
  const manifest: any = {
    task: dataset.task,
    datasetVersion: dataset.datasetVersion,
    goldVersion: gold.goldVersion,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: true,
    sourceHashes: Object.fromEntries(
      files.map((f) => [f, sha(readFileSync(f))])
    ),
    frozenHashes: frozen.hashes,
    model: emailAssistantModel(),
    sampling: "production defaults",
    transport: "loopback capture, no forwarding",
    database: "loopback local marker",
    providerStoragePolicy: "existing production adapters",
    artifacts: "raw case JSON, HTML and text are owner-only",
    outcomes: [],
  };
  save("manifest.json", manifest);
  const insert = async (table: string, row: any) => {
    const { error } = await admin.from(table).insert(row);
    if (error) throw Error(`${table}: ${error.message}`);
  };
  const selected = dataset.cases.filter(
    (c: any) =>
      !argument("--case") || argument("--case")!.split(",").includes(c.id)
  );
  for (const c of selected) {
    const record: any = {
      caseId: c.id,
      expected: gold.cases.find((g: any) => g.id === c.id).expected,
      providerCalls: [],
      turns: [],
      startedAt: new Date().toISOString(),
    };
    records[c.id] = record;
    const ids = {
      talentId: randomUUID(),
      conversationId: randomUUID(),
      workspaceId: randomUUID(),
      roleId: randomUUID(),
      recommendationId: randomUUID(),
      documentId: randomUUID(),
      leadId: randomUUID(),
    };
    record.fixtureIds = ids;
    const email = `synthetic-${ids.talentId}@email-qa.invalid`;
    console.log(`START ${c.id}`);
    await context.run(c.id, async () => {
      try {
        const { data: createdUser, error: authError } =
          await admin.auth.admin.createUser({
            id: ids.talentId,
            email,
            email_confirm: true,
            user_metadata: { testFixture: "email-channel-reply-v1" },
          });
        if (authError) throw authError;
        ids.talentId = createdUser.user.id;
        save(`${c.id}.json`, record);
        sql(
          "INSERT INTO talent_users(user_id,email,name,headline,bio,resume_text,location,current_location) VALUES(%s,%s,%s,%s,%s,%s,'서울','서울') ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,name=excluded.name,headline=excluded.headline,bio=excluded.bio,resume_text=excluded.resume_text",
          [
            ids.talentId,
            email,
            c.noProfile ? null : "이가온",
            c.noProfile ? null : "Backend engineer · Python / PostgreSQL",
            "Synthetic QA profile; not a real candidate.",
            c.noProfile ? null : attachmentBytes.toString(),
          ]
        );
        sql(
          "INSERT INTO talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale,setting_locale) VALUES(%s,%s,'open_to_matches',true,true,'stopped',%s,%s) ON CONFLICT(user_id) DO UPDATE SET is_onboarding_done=excluded.is_onboarding_done,preferred_locale=excluded.preferred_locale,setting_locale=excluded.setting_locale,status='stopped'",
          [ids.talentId, !c.onboarding, c.locale, c.locale]
        );
        await insert("talent_conversations", {
          id: ids.conversationId,
          user_id: ids.talentId,
          stage: c.onboarding ? "chat" : "completed",
        });
        if (!c.noProfile) {
          await insert("talent_experiences", {
            talent_id: ids.talentId,
            role: "Backend Engineer",
            company_name: "Synthetic SaaS",
            description:
              "Python, PostgreSQL, API latency improvement and idempotent async processing.",
            start_date: "2022-01-01",
            months: 48,
          });
          await insert("talent_contexts", {
            talent_id: ids.talentId,
            ref: 1,
            collection: "brief",
            label: "근무 지역",
            content: c.brief ?? "서울 또는 원격 역할을 선호합니다.",
          });
          await insert("talent_contexts", {
            talent_id: ids.talentId,
            ref: 2,
            collection: "brief",
            label: "보상",
            content: "연봉 9천만원 이상을 선호합니다.",
          });
        }
        if (c.recommendation) {
          await insert("company_workspace", {
            company_workspace_id: ids.workspaceId,
            company_name: "오로라",
            published_name: "Aurora",
            is_internal: !c.application,
            company_description: "Synthetic workflow software company.",
            brief: "Build workflow software for business users.",
          });
          await insert("company_roles", {
            role_id: ids.roleId,
            company_workspace_id: ids.workspaceId,
            name: "Backend Engineer",
            source_type: c.application ? "external" : "internal",
            status: "active",
            information: {
              testOnly: true,
              testFixture: "email-channel-reply-v1",
              testTalentIds: [ids.talentId],
            },
            description:
              "Python API와 PostgreSQL 데이터 모델을 개발합니다. 고객 피드백을 듣고 제품을 개선합니다. 서울 오피스에서 주 2일 출근하는 하이브리드 근무입니다. 정확한 보상과 면접 단계는 아직 확인되지 않았습니다.",
            external_jd_url: c.application ? "https://application.email-qa.invalid/apply" : null,
            location_text: "서울",
            work_mode: "hybrid",
          });
          if (!c.application) sql("UPDATE company_internal_roles SET request=%s WHERE role_id=%s", [
            "## Hard constraints\nPython API 개발 업무를 수행할 수 있어야 합니다.\n\n## Preferred criteria\n### 강한 가산점\n비동기 작업 재시도와 중복 처리 방지 경험을 선호합니다.\n\n### 회사 caliber bar\nPRIVATE_QA_CRITERION: 실제 고객 장애 사례에서 본인 책임과 판단을 확인합니다. 이 기준은 비공개 평가용입니다.",
            ids.roleId,
          ]);
          await insert("talent_opportunity_recommendation", {
            id: ids.recommendationId,
            talent_id: ids.talentId,
            role_id: ids.roleId,
            opportunity_type: c.application ? "external_jd" : "internal_recommendation",
            fit_summary:
              "Python/PostgreSQL API와 안정성 개선 경험이 업무와 연결됩니다.",
            feedback: c.recommendation === "connected" ? "like" : null,
            saved_stage: c.recommendation === "connected" ? "connected" : null,
            feedback_at:
              c.recommendation === "connected"
                ? new Date().toISOString()
                : null,
          });
          if (c.recommendation === "connected")
            await insert("talent_progress", {
              talent_id: ids.talentId,
              role_id: ids.roleId,
              recommendation_id: ids.recommendationId,
              kind: "org_stage_change",
              open_to_company: true,
              text: "Synthetic introduction already delivered.",
              metadata: {
                source: "email-channel-reply-v1",
                stage: "connected",
              },
            });
        }
        if (c.application) {
          // A real earlier assistant recommendation resolves "there" without
          // inventing a role ID or a fake current user message.
          await insert("talent_messages", {user_id:ids.talentId,conversation_id:ids.conversationId,role:"assistant",content:`오로라의 Backend Engineer 포지션을 추천드려요. Python API와 PostgreSQL, 비동기 작업 안정성을 다루는 역할입니다. [포지션 확인](roleId:${ids.roleId})`});
          if (c.application.resume) await insert("talent_documents", {
            id:ids.documentId,talent_id:ids.talentId,kind:"resume",file_name:"이가온 이력서.txt",origin_type:"upload",extracted_text:attachmentBytes.toString(),is_primary:true,
          });
        }
        const alias = (
          await createEmailReplyAlias({
            admin,
            conversationId: ids.conversationId,
            userId: ids.talentId,
          })
        ).address;
        if (c.onboarding)
          await insert("career_email_onboarding_leads", {
            id: ids.leadId,
            email,
            normalized_email: email,
            talent_id: ids.talentId,
            conversation_id: ids.conversationId,
            reply_alias: alias,
            status: "active",
            step: "awaiting_profile",
            local_id: `email-qa-${runId}-${c.id}`,
            metadata: { locale: c.locale, preferred_locale: c.locale },
          });
        for (let i = 0; i < c.turns.length; i++) {
          const eventId = randomUUID(),
            jobId = randomUUID(),
            providerId = `synthetic-${randomUUID()}`;
          const attachments = c.attachments
            ? [
                {
                  id: `attachment-${randomUUID()}`,
                  filename: "resume.txt",
                  content_type: "text/plain",
                  size: attachmentBytes.length,
                  download_url: `https://attachment.email-qa.invalid/resume.txt`,
                },
              ]
            : [];
          const mail = {
            id: providerId,
            from: email,
            to: [alias],
            cc: [],
            subject: c.subject ?? "Re: Harper career",
            text: c.turns[i],
            message_id: `<${providerId}@email-qa.invalid>`,
            headers: { "In-Reply-To": "<synthetic-outbound@email-qa.invalid>" },
            attachments,
          };
          incoming.set(providerId, mail);
          await insert("email_inbound_events", {
            id: eventId,
            provider_email_id: providerId,
            from_email: email,
            to_addresses: [alias],
            subject: mail.subject,
            message_id: mail.message_id,
            attachments,
          });
          await insert("email_reply_jobs", {
            id: jobId,
            inbound_event_id: eventId,
            talent_id: ids.talentId,
            conversation_id: ids.conversationId,
            status: "queued",
            worker_target: "vercel_queue",
          });
          const before = outgoing.length;
          let error: string | null = null;
          const started = Date.now();
          try {
            await processEmailRuntimeMessage(
              { version: 1, kind: "reply", jobId },
              admin
            );
          } catch (e: any) {
            error = e.message;
          }
          // Simulate Queue delivery of normal durable continuations; no new user
          // message is inserted to keep work moving.
          if (c.application) {
            let checkpoint = 0;
            while (error && checkpoint++ < 12) {
              const queued = await admin.from("email_reply_jobs").select("status,last_error").eq("id",jobId).single();
              if (queued.data?.status !== "queued" || !["Application is continuing before its email reply","Application preparation checkpoint saved","Application browser checkpoint saved"].includes(queued.data?.last_error)) break;
              record.continuations ??= [];
              record.continuations.push({turn:i+1,checkpoint,lastError:queued.data.last_error});
              try { await processEmailRuntimeMessage({version:1,kind:"reply",jobId},admin); error=null; }
              catch (e:any) { error=e.message; }
            }
          }
          if (c.onboarding) {
            const { data: lead } = await admin
              .from("career_email_onboarding_leads")
              .select("*")
              .eq("id", ids.leadId)
              .maybeSingle();
            if (lead?.step === "profile_review_pending")
              try {
                await processEmailRuntimeMessage(
                  { version: 1, kind: "onboarding_review", jobId: ids.leadId },
                  admin
                );
              } catch (e: any) {
                error = [error, e.message].filter(Boolean).join("; ");
              }
          }
          while (scheduled.some((t) => t.key === c.id)) {
            const at = scheduled.findIndex((t) => t.key === c.id);
            const task = scheduled.splice(at, 1)[0];
            try {
              await task.fn();
            } catch (e: any) {
              record.backgroundErrors ??= [];
              record.backgroundErrors.push(e.message);
            }
          }
          const { data: job } = await admin
            .from("email_reply_jobs")
            .select("*")
            .eq("id", jobId)
            .single();
          const { data: messages } = await admin
            .from("talent_messages")
            .select("id,role,content,message_type,payload")
            .eq("conversation_id", ids.conversationId)
            .order("id");
          const { data: contexts } = await admin
            .from("talent_contexts")
            .select("ref,collection,label,content,deleted_at")
            .eq("talent_id", ids.talentId);
          const { data: setting } = await admin
            .from("talent_setting")
            .select(
              "get_external_recommendation,get_internal_recommendation,profile_visibility,is_onboarding_done"
            )
            .eq("user_id", ids.talentId)
            .single();
          const sent = outgoing.slice(before);
          const { data: relays } = await admin
            .from("company_talent_relays")
            .select("*")
            .eq("recommendation_id", ids.recommendationId);
          const applicationRows = c.application ? sql("SELECT message_id,status,payload FROM talent_simulate_application WHERE user_id=%s AND conversation_id=%s",[ids.talentId,ids.conversationId]) : [];
          const documents = c.application ? sql("SELECT id,file_name,extracted_text,structured_content,revision,is_deleted FROM talent_documents WHERE talent_id=%s",[ids.talentId]) : [];
          record.turns.push({ applicationRows, documents,
            inbound: c.turns[i],
            durationMs: Date.now() - started,
            error,
            job,
            messages,
            contexts,
            setting,
            outgoing: sent,
            relays,
          });
          for (let n = 0; n < sent.length; n++) {
            save(`${c.id}-${i + 1}-${n + 1}.html`, sent[n].html);
            save(`${c.id}-${i + 1}-${n + 1}.txt`, sent[n].text);
          }
          save(`${c.id}.json`, record);
          console.log(
            `TURN ${c.id}/${i + 1} ${job?.status} emails=${sent.length} elapsed=${Date.now() - started}ms${error ? ` error=${error}` : ""}`
          );
          if (error) break;
        }
        if (c.recommendation) {
          const n = sql(
            "SELECT count(*) AS n FROM talent_opportunity_fit WHERE opportunity_id=%s",
            [ids.roleId]
          )[0].n;
          if (n) throw Error("Test role entered fit rows");
        }
      } catch (e: any) {
        record.error = e.message;
        console.log(`ERROR ${c.id}: ${e.message}`);
      } finally {
        // Exact IDs only. Test role becomes unavailable before removing any
        // dependent fixture rows; no production table reset/cascade shortcut.
        if (c.recommendation)
          sql(
            "UPDATE company_roles SET status='ended' WHERE role_id=%s AND information->>'testFixture'='email-channel-reply-v1'",
            [ids.roleId]
          );
        try {
          const docs = await admin
            .from("talent_documents")
            .select("storage_path")
            .eq("talent_id", ids.talentId);
          if (docs.error) throw docs.error;
          for (const d of docs.data ?? [])
            if (d.storage_path)
              await admin.storage
                .from("talent-resumes")
                .remove([d.storage_path]);
          sql("DELETE FROM career_email_messages WHERE talent_id=%s", [
            ids.talentId,
          ]);
          const events = sql(
            "DELETE FROM email_reply_jobs WHERE talent_id=%s RETURNING inbound_event_id",
            [ids.talentId]
          );
          for (const row of events)
            sql("DELETE FROM email_inbound_events WHERE id=%s", [
              row.inbound_event_id,
            ]);
          sql("DELETE FROM contact_queue WHERE user_id=%s", [ids.talentId]);
          sql("DELETE FROM company_talent_relays WHERE recommendation_id=%s", [
            ids.recommendationId,
          ]);
          sql("DELETE FROM company_talent_requests WHERE talent_id=%s", [
            ids.talentId,
          ]);
          sql("DELETE FROM career_email_onboarding_events WHERE lead_id=%s", [
            ids.leadId,
          ]);
          sql("DELETE FROM career_email_onboarding_leads WHERE id=%s", [
            ids.leadId,
          ]);
          sql("DELETE FROM talent_users WHERE user_id=%s AND email=%s", [
            ids.talentId,
            email,
          ]);
          const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
            ids.talentId
          );
          if (deleteAuthError) throw deleteAuthError;
          if (c.recommendation) {
            sql("DELETE FROM company_roles WHERE role_id=%s", [ids.roleId]);
            sql("DELETE FROM company_workspace WHERE company_workspace_id=%s", [
              ids.workspaceId,
            ]);
          }
          record.cleanup = {
            talentRows: sql(
              "SELECT count(*) AS n FROM talent_users WHERE user_id=%s",
              [ids.talentId]
            )[0].n,
            roleRows: sql(
              "SELECT count(*) AS n FROM company_roles WHERE role_id=%s",
              [ids.roleId]
            )[0].n,
          };
        } catch (e: any) {
          record.cleanupError = e.message;
          console.log(`CLEANUP ${c.id}: ${e.message}`);
        }
        record.finishedAt = new Date().toISOString();
        save(`${c.id}.json`, record);
        manifest.outcomes.push({
          caseId: c.id,
          error: record.error ?? null,
          turns: record.turns.map((t: any) => ({
            status: t.job?.status,
            error: t.error,
            emailCount: t.outgoing.length,
            durationMs: t.durationMs,
          })),
          cleanup: record.cleanup,
          cleanupError: record.cleanupError ?? null,
        });
        save("manifest.json", manifest);
      }
    });
  }
  save(
    "review.md",
    Object.values(records)
      .map(
        (r: any) =>
          `## ${r.caseId}\n\nExpected: ${r.expected}\n\n${r.error ? `Error: ${r.error}\n\n` : ""}${r.turns.map((t: any) => `User: ${t.inbound}\n\n${t.outgoing.map((m: any) => `Email to ${m.to}:\n\n${m.text}`).join("\n\n")}\n\n${t.error ? `Error: ${t.error}` : ""}`).join("\n\n")}`
      )
      .join("\n\n---\n\n")
  );
  globalThis.fetch = originalFetch;
  nodeModule._load = load;
  console.log(`FINISHED ${runDir}`);
}
async function replayRendering() {
  const sourceRun = argument("--render-run")!;
  if (!/^[a-zA-Z0-9_-]+$/.test(sourceRun)) throw Error("Invalid source run");
  const sourceDir = path.join(root, "runs", sourceRun);
  const { renderReplyEmail } = await import("../src/lib/email/runtime/format");
  const artifacts: any[] = [];
  for (const file of readdirSync(sourceDir).filter(
    (f) => f.endsWith(".json") && !["manifest.json", "fatal.json"].includes(f)
  )) {
    const record = readJson(path.join(sourceDir, file));
    if (!record.caseId) continue;
    for (let i = 0; i < record.turns.length; i++) {
      const turn = record.turns[i];
      const source = turn.messages
        ?.filter((m: any) => m.role === "assistant")
        .at(-1)?.content;
      if (!source || turn.outgoing.length !== 1)
        throw Error("Expected one saved reply and captured delivery");
      const rendered = renderReplyEmail(source);
      save(`${record.caseId}-${i + 1}-1.html`, rendered.html);
      save(`${record.caseId}-${i + 1}-1.txt`, rendered.text);
      artifacts.push({
        caseId: record.caseId,
        turn: i + 1,
        sourceHash: sha(source),
        originalCaptureHash: sha(turn.outgoing[0].html),
      });
    }
  }
  save("manifest.json", {
    kind: "render-replay",
    sourceRun,
    formatterHash: sha(readFileSync("src/lib/email/runtime/format.ts")),
    frozenHashes: frozen.hashes,
    artifacts,
  });
  console.log(`RENDERED ${artifacts.length} saved replies: ${runDir}`);
}
(argument("--render-run") ? replayRendering() : main())
  .catch((error) => {
    save("fatal.json", { error: String(error.stack ?? error) });
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => server.close());
