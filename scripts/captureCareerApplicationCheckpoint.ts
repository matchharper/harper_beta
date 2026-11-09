/** Read-only capture of the authorized application's current QA account. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getCareerDevSqlClient } from "../src/lib/career/devSql";
import { readCheckpointRows } from "../src/lib/career/devCheckpointRestore";
import { assertCheckpointQuiescent } from "../src/lib/career/devCheckpoint.server";
import { APPLICATION_CHECKPOINT_GUARDS, assertApplicationOperationsQuiescent } from "../src/lib/career/devApplicationCheckpoint.server";
import { APPLICATION_CHECKPOINT_SCOPES as scopes, APPLICATION_CHECKPOINT_TABLES as tables,
  APPLICATION_CHECKPOINT_USER_ID as userId, APPLICATION_CHECKPOINT_EMAIL as email } from "../src/lib/career/devApplicationCheckpoint";
import type { CareerCheckpoint } from "../src/lib/career/devCheckpointData";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Local development only");
  const output = process.argv[2];
  if (!output || !path.resolve(output).startsWith(path.resolve(".local") + path.sep)) throw new Error("Choose a new private file under .local");
  const db = getCareerDevSqlClient();
  try {
    const snapshot = await db.begin("isolation level repeatable read read only", async tx => {
      const query = (sql: string, params: unknown[] = []) => tx.unsafe(sql, params as never[]);
      await query("set local statement_timeout='30000ms'");
      const [identity] = await query("select email from auth.users where id=$1::uuid", [userId]);
      if (identity?.email !== email) throw new Error("Wrong checkpoint account");
      const data = await readCheckpointRows(query, userId, tables, scopes);
      Object.assign(data, await readCheckpointRows(query, userId, Object.keys(APPLICATION_CHECKPOINT_GUARDS),
        { owners: APPLICATION_CHECKPOINT_GUARDS, children: {} }));
      const columns = await query("select table_name,column_name,is_generated from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position", [tables]);
      const snapshot = { version: 1, user: { id: userId, email, captured_at: new Date().toISOString() }, columns, fks: [], tables: data } as CareerCheckpoint;
      await assertCheckpointQuiescent(query, snapshot);
      assertApplicationOperationsQuiescent(data.talent_external_operations, data.talent_external_operations);
      if ([...data.talent_agent_runtime, ...data.talent_agent_work_runtime].some(row => {
        const state = row.state as Record<string, unknown> | undefined;
        return state?.activeReply || state?.checkpoint || Object.keys(state?.checkpoints ?? {}).length;
      })) throw new Error("An unfinished conversation cannot become a reset baseline");
      return snapshot;
    });
    const bytes = JSON.stringify(snapshot);
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ file: output, sha256: createHash("sha256").update(bytes).digest("hex"), capturedAt: snapshot.user.captured_at,
      messages: snapshot.tables.talent_messages.length, documents: snapshot.tables.talent_documents.length }));
  } finally { await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
