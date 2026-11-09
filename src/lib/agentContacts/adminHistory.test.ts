import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readAdminAgentHistory } from "./adminHistory";

test("history preserves both agents' original messages and paginates within the candidate and Role", async () => {
  const db = new PGlite();
  const query = async (sql: string, params: any[] = []) => (await db.query(sql, params)).rows as any[];
  const talent = "10000000-0000-4000-8000-000000000001";
  const role = "10000000-0000-4000-8000-000000000002";
  const other = "10000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`CREATE TABLE agent_contact_messages(id uuid,root_id uuid,reply_to_id uuid,talent_id uuid,role_id uuid,direction text,body text,created_at timestamptz)`);
    for (let n = 0; n < 32; n++) {
      await query(`INSERT INTO agent_contact_messages VALUES($1,$2,NULL,$3,$4,$5,$6,'2026-11-09T03:00:00Z')`, [
        `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`, other, talent, role,
        n % 2 ? "to_talent" : "to_company", `원문 ${n}\n  공백 **그대로** <script>not HTML</script>`,
      ]);
    }
    await query(`INSERT INTO agent_contact_messages SELECT gen_random_uuid(),root_id,NULL,$1,role_id,direction,'다른 후보자',created_at FROM agent_contact_messages LIMIT 1`, [other]);
    await query(`INSERT INTO agent_contact_messages SELECT gen_random_uuid(),root_id,NULL,talent_id,$1,direction,'다른 Role',created_at FROM agent_contact_messages LIMIT 1`, [other]);
    const first = await readAdminAgentHistory(query, talent, role);
    const last = await readAdminAgentHistory(query, talent, role, first.nextOffset!);
    assert.equal(first.messages.length, 30);
    assert.equal(last.messages.length, 2);
    assert.equal(last.nextOffset, null);
    assert.equal(new Set([...first.messages, ...last.messages].map(m => m.id)).size, 32);
    assert.equal(first.messages[0].direction, "to_company");
    assert.equal(first.messages[1].direction, "to_talent");
    assert.equal(first.messages[0].body, "원문 0\n  공백 **그대로** <script>not HTML</script>");
    assert.equal((await readAdminAgentHistory(query, role, talent)).messages.length, 0);
  } finally { await db.close(); }
});
