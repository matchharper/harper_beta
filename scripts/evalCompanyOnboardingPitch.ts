/** Real company-side LLM + real mutation executor, isolated local DB only. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  process.umask(0o077);
  const root = path.resolve(__dirname, "..");
  const task = path.join(root, "docs/evaluation/company-onboarding-pitch");
  const sha = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const version =
    process.argv.find((arg) => arg.startsWith("--dataset="))?.slice(10) ?? "v1";
  assert.match(version, /^v[1-9][0-9]*$/);
  const frozen = JSON.parse(
    readFileSync(path.join(task, `manifest-${version}.json`), "utf8")
  );
  for (const [file, hash] of Object.entries(frozen.files)) {
    assert.equal(
      sha(readFileSync(path.join(task, file))),
      hash,
      `Frozen file changed: ${file}`
    );
  }
  const dataset = JSON.parse(
    readFileSync(path.join(task, `cases-${version}.json`), "utf8")
  );
  assert.equal(dataset.version, version);
  const runId = process.argv.find((arg) => arg.startsWith("--run="))?.slice(6);
  if (!runId || !/^[a-zA-Z0-9_.-]+$/.test(runId))
    throw Error("A new --run=<id> is required");
  const runDir = path.join(task, "runs", runId);
  mkdirSync(path.join(task, "runs"), { recursive: true, mode: 0o700 });
  mkdirSync(runDir, { mode: 0o700 });
  const save = (file: string, value: unknown) =>
    writeFileSync(path.join(runDir, file), JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const { stackEnv } = await import("./localE2e/env.mjs");
  const { env } = stackEnv();
  assert.equal(env.HARPER_LOCAL_E2E, "1");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
    )
  );
  Object.assign(process.env, env);
  if (!env.OPENROUTER_API_KEY) throw Error("OpenRouter credential is required");

  const database = (action: string, fixture: unknown) =>
    JSON.parse(
      execFileSync(
        path.join(root, ".local/full-stack/venv/bin/python"),
        [
          "-c",
          `
import json,os,sys,psycopg
from uuid import UUID
from urllib.parse import urlparse
from psycopg.types.json import Jsonb
action=sys.argv[1]
f=json.loads(sys.argv[2])
uid=UUID(f['userId'])
assert os.environ['HARPER_LOCAL_E2E']=='1'
assert urlparse(os.environ['DATABASE_URL']).hostname in ('localhost','127.0.0.1')
with psycopg.connect(os.environ['DATABASE_URL']) as c:
  assert c.execute('select id from local_e2e.environment').fetchall()==[('harper-local-e2e',)]
  if action=='seed':
    c.execute('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(%s,%s,now(),false)',(uid,f['email']))
    state=c.execute('select workspace_signup_begin_v1(%s,%s,true)',(uid,f['domain'])).fetchone()[0]
    assert state['status']=='created'
    wid=state['workspaceId']
    c.execute('select workspace_signup_update_v1(%s,%s,%s,%s)',(uid,wid,'company',Jsonb({'name':f['companyName'],'description':''})))
    c.execute('update company_workspace set pitch=%s where company_workspace_id=%s',(f['existingPitch'],wid))
    print(json.dumps({'workspaceId':wid}))
  else:
    rows=c.execute('select w.company_workspace_id,w.company_db_id,w.pitch from company_workspace w join company_user_workspace m using(company_workspace_id) where m.company_user_id=%s',(uid,)).fetchall()
    if not rows:
      assert action=='cleanup'
      c.execute('delete from company_users where user_id=%s',(uid,))
      c.execute('delete from auth.users where id=%s',(uid,))
      print('{}')
    else:
      assert len(rows)==1
      wid,cid,pitch=rows[0]
      assert str(wid)==f['workspaceId']
      assert c.execute('select count(*) from company_user_workspace where company_workspace_id=%s',(wid,)).fetchone()[0]==1
      roles=c.execute('select count(*) from company_roles where company_workspace_id=%s',(wid,)).fetchone()[0]
      assert roles==0,'Unexpected Role creation'
      contacts=c.execute('select count(*) from company_talent_requests where company_workspace_id=%s',(wid,)).fetchone()[0]
      assert contacts==0,'Unexpected candidate contact'
      if action=='inspect':
        messages=c.execute('select role,content,metadata,thinking_logs,model,status from company_messages where company_workspace_id=%s order by id',(wid,)).fetchall()
        print(json.dumps({'savedPitch':pitch,'roleCount':roles,'contactCount':contacts,'messages':messages}))
      elif action=='cleanup':
        if cid: assert c.execute('select count(*) from company_workspace where company_db_id=%s',(cid,)).fetchone()[0]==1
        for table in ['company_workspace_credit_events','company_workspace_credit_periods','company_workspace_agents']:
          c.execute('delete from '+table+' where company_workspace_id=%s',(wid,))
        c.execute('delete from company_snapshot where workspace_id=%s',(wid,))
        c.execute('delete from company_workspace where company_workspace_id=%s',(wid,))
        c.execute('delete from company_users where user_id=%s',(uid,))
        c.execute('delete from auth.users where id=%s',(uid,))
        if cid: c.execute('delete from company_db where id=%s',(cid,))
        print('{}')
      else: raise Exception('Invalid fixture action')
`,
          action,
          JSON.stringify(fixture),
        ],
        { cwd: root, env, encoding: "utf8" }
      )
    );

  const realFetch = globalThis.fetch;
  const captures: Promise<void>[] = [];
  let providerCalls: any[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(
      typeof input === "string" ? input : (input.url ?? String(input))
    );
    if (
      ![
        "localhost",
        "127.0.0.1",
        "openrouter.ai",
        "api.openai.com",
        "api.anthropic.com",
      ].includes(url.hostname)
    ) {
      throw Error(`Evaluation network blocked: ${url.hostname}`);
    }
    if (url.hostname !== "openrouter.ai") return realFetch(input, init);
    const call: any = {
      startedAt: new Date().toISOString(),
      request: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    providerCalls.push(call);
    const started = Date.now();
    try {
      const response = await realFetch(input, init);
      call.status = response.status;
      const clone = response.clone();
      captures.push(
        clone.text().then((body) => {
          call.body = body;
          call.durationMs = Date.now() - started;
        })
      );
      return response;
    } catch (error) {
      call.error = String(error);
      call.durationMs = Date.now() - started;
      throw error;
    }
  }) as typeof fetch;

  const { runOrgAgentChat } = await import("../src/lib/org/agent/chat");
  const {
    buildOrgOnboardingCompanyPrompt,
    ORG_ONBOARDING_COMPANY_AGENT_OPTIONS,
  } = await import("../src/lib/org/agent/onboardingPrompt");
  const { getOrgAgentReasoningEffort } =
    await import("../src/lib/org/agent/modelConfig");
  const sourceFiles = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "src/lib/org/agent",
      "src/lib/llm",
      "src/app/api/org/onboarding/route.ts",
      "scripts/evalCompanyOnboardingPitch.ts",
    ],
    { cwd: root, encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .sort();
  const source = sourceFiles.map((file) => ({
    file,
    content: readFileSync(path.join(root, file), "utf8"),
  }));
  save("source-snapshot.json", source);
  const manifest: any = {
    task: "company-onboarding-pitch",
    runId,
    datasetVersion: version,
    datasetFiles: frozen.files,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    dirty: true,
    sourceFingerprint: sha(JSON.stringify(source)),
    promptFingerprint: sha(
      JSON.stringify(
        dataset.cases.map((testCase: { message: string }) =>
          buildOrgOnboardingCompanyPrompt(testCase.message)
        )
      )
    ),
    ...ORG_ONBOARDING_COMPANY_AGENT_OPTIONS,
    reasoning: getOrgAgentReasoningEffort(
      ORG_ONBOARDING_COMPANY_AGENT_OPTIONS.model
    ),
    provider: "OpenRouter",
    sampling: { temperature: null, top_p: null, top_k: null },
    timeoutMs: 120_000,
    rawArtifactPath: runDir,
    metricSummary:
      "Pending manual meaning and usability review; execution is not a quality pass.",
    results: [],
    quality: "pending_manual_review",
  };
  save("manifest.json", manifest);
  for (const testCase of dataset.cases) {
    assert.equal(
      sha(
        JSON.stringify(
          sourceFiles.map((file) => ({
            file,
            content: readFileSync(path.join(root, file), "utf8"),
          }))
        )
      ),
      manifest.sourceFingerprint,
      "Runtime source changed during evaluation; start a new run"
    );
    const userId = randomUUID();
    const domain = `pitch-${userId}.com`;
    const fixture = {
      ...testCase,
      userId,
      domain,
      email: `owner@${domain}`,
      workspaceId: "",
    };
    providerCalls = [];
    let result: any;
    try {
      fixture.workspaceId = database("seed", fixture).workspaceId;
      save(`${testCase.id}-fixture.json`, fixture);
      const started = Date.now();
      const submissionId = randomUUID();
      result = await runOrgAgentChat({
        ...ORG_ONBOARDING_COMPANY_AGENT_OPTIONS,
        message: testCase.message,
        responseLocale: testCase.locale,
        llmUserMessage: buildOrgOnboardingCompanyPrompt(testCase.message),
        user: {
          id: userId,
          email: fixture.email,
          user_metadata: { full_name: "Pitch Check" },
        } as any,
        workspaceId: fixture.workspaceId,
        turnRunId: submissionId,
        userMessageMetadata: {
          source: "org_onboarding_company",
          onboardingSubmissionId: submissionId,
        },
        assistantMessageMetadata: {
          source: "org_onboarding_company",
          onboardingSubmissionId: submissionId,
        },
        signal: AbortSignal.timeout(120_000),
      });
      const durationMs = Date.now() - started;
      const stored = database("inspect", fixture);
      await Promise.all(captures);
      const artifact = { result, ...stored, durationMs, providerCalls };
      save(`${testCase.id}.json`, artifact);
      const summary = {
        id: testCase.id,
        durationMs,
        completionCount: providerCalls.length,
        saved: Boolean(stored.savedPitch),
        error: null,
      };
      manifest.results.push(summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      await Promise.all(captures);
      save(`${testCase.id}.json`, {
        error: String(error),
        result,
        providerCalls,
      });
      manifest.results.push({ id: testCase.id, error: String(error) });
      process.exitCode = 1;
      console.log(JSON.stringify({ id: testCase.id, error: String(error) }));
    } finally {
      database("cleanup", fixture);
      save("manifest.json", manifest);
    }
  }
  globalThis.fetch = realFetch;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
