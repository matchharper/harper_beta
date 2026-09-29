/** Explicitly authorized real-mail smoke. Never creates a Role/recommendation or changes routing. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const task = path.join(root, "docs/evaluation/company-talent-contacts");
const command = process.argv[2];
const run = process.env.CONTACT_TRANSPORT_RUN;
const recommendationId = process.env.CONTACT_TRANSPORT_RECOMMENDATION;
if (!run || !/^[\w.-]+$/.test(run) || !recommendationId) throw Error("Explicit run and existing recommendation required");
const dir = path.join(task, "runs", run);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, x: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(x, null, 2), { mode: 0o600 });
const specText = readFileSync(path.join(task, "transport-v1.json"), "utf8");
const spec = JSON.parse(specText);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
async function checked(q: any): Promise<any> { const r = await q; if (r.error) throw r.error; return r.data; }
const requireLocal = createRequire(path.join(root, "package.json"));
const nextPath = requireLocal.resolve("next/server");
const next = requireLocal(nextPath);
const background: Promise<unknown>[] = [];
requireLocal.cache[nextPath]!.exports = { ...next, after: (fn: () => unknown) => background.push(Promise.resolve().then(fn)) };

async function main() {
  const position = await checked(admin.from("talent_opportunity_recommendation").select("*").eq("id", recommendationId).single());
  const role = await checked(admin.from("company_roles").select("*").eq("role_id", position.role_id).single());
  const workspace = await checked(admin.from("company_workspace").select("company_workspace_id,company_name,is_internal").eq("company_workspace_id", role.company_workspace_id).single());
  const talent = await checked(admin.from("talent_users").select("user_id,email,name").eq("user_id", position.talent_id).single());
  assert.equal(workspace.company_name, "Harper"); assert.equal(workspace.is_internal, true);
  assert.ok(["khj605123@gmail.com", "daniel@matchharper.com"].includes(talent.email.toLowerCase()));
  assert.equal(position.processed_stage, "connected", "Use an existing connected position, never invent consent");
  assert.notEqual(role.information?.testOnly, true, "No synthetic production role without verified DB isolation guards");
  const now = new Date().toISOString();
  if (command === "send") {
    if (existsSync(path.join(dir, "started.json"))) throw Error("A send was already attempted; inspect status instead of resending");
    const { data, error } = await admin.auth.admin.getUserById(talent.user_id);
    if (error || data.user?.email !== talent.email) throw Error("Fixture actor identity mismatch");
    const { assertOrgWorkspacePermission } = await import("../src/lib/org/server");
    await assertOrgWorkspacePermission({ admin, user: data.user, workspaceId: workspace.company_workspace_id, permission: "manage_candidates" });
    const { runOrgAgentChat } = await import("../src/lib/org/agent/chat");
    save("started.json", { now, workspace, talent, roleId: role.role_id, recommendationId, position, role,
      frozenSha256: createHash("sha256").update(specText).digest("hex"),
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      sourceDiffSha256: createHash("sha256").update(execFileSync("git", ["diff", "HEAD", "--", "src/lib"])).digest("hex"),
      boundary: "Local branch company-side runtime; existing deployed mail/inbound/company-event consumers. No deploy or routing changes." });
    const trace: unknown[] = [];
    const result = await runOrgAgentChat({ user: data.user, workspaceId: workspace.company_workspace_id,
      roleId: role.role_id, signal: AbortSignal.timeout(180_000), debug: true,
      mentions: [{ talentId: talent.user_id, displayName: talent.name, roleId: role.role_id, recommendationId }],
      message: spec.companyMessage.replaceAll("{candidate}", talent.name).replaceAll("{role}", role.name),
      userMessageMetadata: { testFixture: "company-contact-transport-v1", testRun: run } as any,
      emit: (event, data) => { trace.push({ event, data }); save("trace.json", trace); } });
    save("result.json", result);
    console.log(JSON.stringify(result));
    await Promise.allSettled(background);
  } else if (command === "status") {
    const started = JSON.parse(readFileSync(path.join(dir, "started.json"), "utf8"));
    assert.deepEqual([position.saved_stage, position.processed_stage], [started.position.saved_stage, started.position.processed_stage]);
    assert.deepEqual(role, started.role, "No Role field may change during the transport-only test");
    const requests = await checked(admin.from("company_talent_requests").select("*").eq("role_id", role.role_id).eq("talent_id", talent.user_id).gte("created_at", started.now));
    const relays = await checked(admin.from("company_talent_relays").select("*").eq("recommendation_id", recommendationId).gte("created_at", started.now));
    const queues = requests.length ? await checked(admin.from("contact_queue").select("id,type,status,sent_at,last_error,company_talent_request_id").in("company_talent_request_id", requests.map((r: any) => r.id))) : [];
    const sources = requests.length ? await checked(admin.from("company_messages").select("conversation_id").in("id", requests.map((r: any) => r.source_company_message_id))) : [];
    const conversationIds = [...new Set(sources.map((r: any) => r.conversation_id).filter(Boolean))];
    const messages = conversationIds.length ? await checked(admin.from("company_messages").select("id,role,content,created_at,metadata").in("conversation_id", conversationIds).gte("created_at", started.now).order("id")) : [];
    const progress = await checked(admin.from("talent_progress").select("id,kind,metadata,created_at").eq("recommendation_id", recommendationId).gte("created_at", started.now));
    const report = { now, requests, relays, queues, messages, progress, pipelineUnchanged: true, roleUnchanged: true };
    save(`status-${Date.now()}.json`, report);
    console.log(JSON.stringify(report, null, 2));
  } else throw Error("Expected send or status");
}
main().catch(error => { save(`error-${Date.now()}.json`, { message: String(error), stack: error.stack }); console.error(error); process.exitCode = 1; });
