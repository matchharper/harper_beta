import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { formatCompanyIntroductionNotices, readAgentCorrespondence } from "./read";

// Incident #107: a later letter's run must see what the company team was
// already told about the same introduction, so it does not repeat it.
const workspace = "00000000-0000-4000-8000-0000000000b1";
const otherWorkspace = "00000000-0000-4000-8000-0000000000b2";
const role = "00000000-0000-4000-8000-0000000000d1";
const talent = "00000000-0000-4000-8000-0000000000e1";
const recommendation = "00000000-0000-4000-8000-0000000000f1";
const root = "00000000-0000-4000-8000-0000000000a1";
const otherRoot = "00000000-0000-4000-8000-0000000000a2";
const later = "00000000-0000-4000-8000-0000000000a3";
const job = "00000000-0000-4000-8000-0000000000c1";
const letter = (id: string, createdAt: string, body: string) => ({
  id, root_id: root, reply_to_id: id === root ? null : root, direction: "to_company",
  company_workspace_id: workspace, role_id: role, talent_id: talent, recommendation_id: recommendation,
  material_id: null, body, created_at: createdAt, cancelled_at: null, receiver_kind: "company",
  receiver_status: "processing", pair_introduction: true, document_refs: [], source: {},
});
const letters = [
  letter(root, "2026-11-09T02:27:10Z", "Candidate A would like to be introduced."),
  letter(later, "2026-11-09T02:32:56Z", "Candidate A added a portfolio link."),
];
let notices: PGlite;
const seen: string[] = [];

const db = {
  transaction: async (work: any) => work(db.query),
  query: async (sql: string, params: any[] = []) => {
    seen.push(sql);
    if (sql.includes("SELECT m.*,root.cancelled_at")) {
      return params[6] ? letters.filter((m) => m.id === params[6]) : [...letters].reverse();
    }
    if (sql.includes("FROM public.company_agent_web_action_jobs j")) {
      return [{ id: job, action_name: "agent_contact_received", action_context: { introductionRootId: root } }];
    }
    if (sql.includes("m.id=m.root_id")) return [letters[0]];
    if (sql.includes("SELECT r.role_id")) return [{ role_id: role, profile_visibility: "visible" }];
    if (sql.includes("FROM public.company_messages")) return (await notices.query(sql, params)).rows;
    return [];
  },
};
const companyRun = {
  kind: "company_event" as const, workspaceId: workspace, roleId: role, jobId: job, leaseOwner: "worker",
};

before(async () => {
  notices = new PGlite();
  await notices.exec(`
    create table public.company_messages (
      id bigint primary key, company_workspace_id uuid, role text, message_type text,
      content text, metadata jsonb default '{}'::jsonb, created_at timestamptz
    );
    insert into public.company_messages values
      (6353, '${workspace}', 'assistant', 'chat',
        E'A new candidate has applied for the FDE role and is ready for your review:\\n### Candidate A',
        '{"agentIntroductionRootId":"${root}"}', '2026-11-09T02:33:39Z'),
      (6354, '${workspace}', 'assistant', 'slack', 'Slack copy of the same notice',
        '{"agentIntroductionRootId":"${root}","companyEventUiDuplicateOf":6353}', '2026-11-09T02:33:39Z'),
      (6355, '${workspace}', 'system', 'web_action', 'agent_contact_received',
        '{"agentIntroductionRootId":"${root}"}', '2026-11-09T02:35:12Z'),
      (6356, '${workspace}', 'assistant', 'chat', 'Another introduction of another candidate',
        '{"agentIntroductionRootId":"${otherRoot}"}', '2026-11-09T02:36:22Z'),
      (6357, '${otherWorkspace}', 'assistant', 'chat', 'Another company''s message',
        '{"agentIntroductionRootId":"${root}"}', '2026-11-09T02:37:00Z'),
      (5435, '${workspace}', 'assistant', 'slack', 'An older Slack-only notice for this introduction',
        '{"agentIntroductionRootId":"${root}"}', '2026-11-08T01:00:00Z');
  `);
});

after(async () => {
  await notices?.close();
});

test("a later letter's run sees what the company team was already told about the introduction", async () => {
  const result = await readAgentCorrespondence(companyRun, { contextMessageId: later }, db as any);

  assert.match(
    result.modelOutput,
    new RegExp(
      `Already posted to the company team about introduction ${root}, oldest first, beginnings only:\\n` +
      "- 2026-11-08 10:00: An older Slack-only notice for this introduction\\n" +
      "- 2026-11-09 11:33: A new candidate has applied for the FDE role and is ready for your review: ### Candidate A"
    )
  );
  assert.doesNotMatch(result.modelOutput, /Slack copy of the same notice|Another introduction|Another company|agent_contact_received/);
});

test("the candidate side never reads the company's own notices", async () => {
  seen.length = 0;
  const career = {
    kind: "career" as const, talentId: talent, conversationId: "00000000-0000-4000-8000-000000000099",
  } as any;
  const result = await readAgentCorrespondence(career, { contextMessageId: later }, db as any);

  assert.equal(seen.some((sql) => sql.includes("FROM public.company_messages")), false);
  assert.doesNotMatch(result.modelOutput, /Already posted to the company team/);
});

test("long introductions show the newest notices and say how many there are", () => {
  const rows = [8, 9, 10, 11, 12].map((id) => ({
    id, root_id: root, total: 7, created_at: `2026-11-10T0${id - 8}:00:00Z`, content: `Update ${id} ${"x".repeat(250)}`,
  }));
  const [text] = formatCompanyIntroductionNotices(rows);

  assert.match(text, new RegExp(`introduction ${root} \\(latest 5 of 7\\)`));
  assert.equal(text.split("\n").length, 6);
  assert.match(text, /^- 2026-11-10 09:00: Update 8 x+…$/m);
  assert.equal(text.split("\n")[1].length, "- 2026-11-10 09:00: ".length + 200 + 1);
});
