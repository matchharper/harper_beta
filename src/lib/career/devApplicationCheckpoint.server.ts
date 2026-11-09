import { assertApplicationOperationsQuiescent } from "./devApplicationCheckpointGuard";
export { assertApplicationOperationsQuiescent } from "./devApplicationCheckpointGuard";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getCareerDevSqlClient } from "./devSql";
import {
  canonicalRows,
  tableSql,
  type CareerCheckpoint,
} from "./devCheckpointData";
import {
  readCheckpointRows,
  restoreCheckpointRows,
  type CheckpointQuery,
} from "./devCheckpointRestore";
import { assertCheckpointQuiescent } from "./devCheckpoint.server";
import {
  APPLICATION_CHECKPOINT_USER_ID as USER_ID,
  APPLICATION_CHECKPOINT_EMAIL as EMAIL,
  APPLICATION_CHECKPOINT_LABEL as LABEL,
  APPLICATION_CHECKPOINT_SHA256 as SHA256,
  APPLICATION_CHECKPOINT_TABLES as TABLES,
  APPLICATION_CHECKPOINT_SCOPES as SCOPES,
} from "./devApplicationCheckpoint";

export const APPLICATION_CHECKPOINT_GUARDS = {
  contact_queue: "user_id",
  career_email_messages: "talent_id",
  email_reply_jobs: "talent_id",
  talent_opportunity_delivery: "talent_id",
  org_intro_email_threads: "talent_id",
  meeting_schedules: "talent_id",
  talent_agent_schedules: "talent_id",
  career_daily_sources: "talent_id",
};
const equal = (a: Record<string, unknown>[], b: Record<string, unknown>[]) =>
  JSON.stringify(canonicalRows(a)) === JSON.stringify(canonicalRows(b));
export type ApplicationCheckpointSource = { file: string; sha256: string; label: string; legacyBriefRevision?: boolean };
const DEFAULT_SOURCE: ApplicationCheckpointSource = { file: ".local/channel-reset/baseline.json", sha256: SHA256, label: LABEL, legacyBriefRevision: true };

export async function loadApplicationCheckpoint(source = DEFAULT_SOURCE) {
  const bytes = await readFile(
    path.join(process.cwd(), source.file)
  );
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new Error("복원 기준 파일이 변경됐습니다.");
  const snapshot = JSON.parse(bytes.toString("utf8")) as CareerCheckpoint;
  if (snapshot.user.id !== USER_ID || snapshot.user.email !== EMAIL)
    throw new Error("복원 계정이 일치하지 않습니다.");
  // Reviewed additive migration: historical evaluations predate the new nullable
  // Brief revision link. Preserve that absence instead of assigning today's Brief.
  if (source.legacyBriefRevision) {
  snapshot.columns.push({ table_name: "company_role_candidate_evaluations", column_name: "brief_revision", is_generated: "NEVER" });
  for (const row of snapshot.tables.company_role_candidate_evaluations) row.brief_revision = null;
  }
  return snapshot;
}

export async function inspectApplicationCheckpoint(source = DEFAULT_SOURCE) {
  const snapshot = await loadApplicationCheckpoint(source);
  return getCareerDevSqlClient().begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const query: CheckpointQuery = (sql, params = []) =>
        tx.unsafe(sql, params as never[]);
      const current = await readCheckpointRows(query, USER_ID, TABLES, SCOPES);
      return {
        available: true,
        capturedAt: source.label,
        tables: TABLES.map((name) => ({
          name,
          baseline: snapshot.tables[name].length,
          current: current[name].length,
          changed: !equal(snapshot.tables[name], current[name]),
        })),
      };
    }
  );
}

async function restoreApplicationCheckpointOnce(source: ApplicationCheckpointSource) {
  const snapshot = await loadApplicationCheckpoint(source);
  await getCareerDevSqlClient().begin(
    "isolation level serializable",
    async (tx) => {
      const query: CheckpointQuery = (sql, params = []) =>
        tx.unsafe(sql, params as never[]);
      await query("set local lock_timeout='3000ms'");
      await query("set local statement_timeout='30000ms'");
      await query("select pg_advisory_xact_lock(hashtext($1))", [
        `career-checkpoint:${USER_ID}`,
      ]);
      const [identity] = await query(
        "select email from auth.users where id=$1::uuid",
        [USER_ID]
      );
      if (identity?.email?.toLowerCase() !== EMAIL)
        throw new Error("복원 대상 계정을 확인할 수 없습니다.");
      const columns = await query(
        "select table_name,column_name,is_generated from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position",
        [TABLES]
      );
      if (!equal(columns, snapshot.columns))
        throw new Error("DB 구조가 바뀌어 복원을 중단했습니다.");
      // Unchanged account tables need no replacement. Locking their entire FK
      // graph needlessly contends with production discovery workers.
      const observed = await readCheckpointRows(query, USER_ID, TABLES, SCOPES);
      const changed = TABLES.filter(name => !equal(observed[name], snapshot.tables[name]));
      if (!changed.length) return;
      snapshot.fks =
        (await query(`select child.relname child,parent.relname parent,pn.nspname parent_schema,
      array(select a.attname from unnest(con.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num order by k.pos) child_columns,
      array(select a.attname from unnest(con.confkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num order by k.pos) parent_columns
      from pg_constraint con join pg_class child on child.oid=con.conrelid join pg_class parent on parent.oid=con.confrelid join pg_namespace pn on pn.oid=parent.relnamespace where con.contype='f' and con.connamespace='public'::regnamespace`)) as CareerCheckpoint["fks"];
      await query(
        `lock table ${Object.keys(APPLICATION_CHECKPOINT_GUARDS).map(tableSql).join(",")} in share row exclusive mode nowait`
      );
      await restoreCheckpointRows(
        query,
        snapshot,
        changed,
        async () => {
          await assertCheckpointQuiescent(query, snapshot);
          const guards = await readCheckpointRows(
            query,
            USER_ID,
            Object.keys(APPLICATION_CHECKPOINT_GUARDS),
            { owners: APPLICATION_CHECKPOINT_GUARDS, children: {} }
          );
          for (const name of Object.keys(APPLICATION_CHECKPOINT_GUARDS))
            if (!equal(guards[name], snapshot.tables[name]))
              throw new Error(
                `발송·일정 기록이 변경돼 복원을 중단했습니다 (${name}).`
              );
          const current = await readCheckpointRows(
            query,
            USER_ID,
            [
              "talent_external_operations",
              "talent_agent_runtime",
              "talent_agent_work_runtime",
            ],
            SCOPES
          );
          assertApplicationOperationsQuiescent(
            current.talent_external_operations,
            snapshot.tables.talent_external_operations
          );
          if (
            [
              ...current.talent_agent_runtime,
              ...current.talent_agent_work_runtime,
            ].some((row) => {
              const state = row.state as Record<string, unknown> | undefined;
              return (
                state?.activeReply ||
                Object.keys(state?.checkpoints ?? {}).length ||
                state?.checkpoint
              );
            })
          )
            throw new Error(
              "대화 작업이 진행 중이거나 재개 대기 중입니다. 먼저 종료해 주세요."
            );
        },
        SCOPES
      );
      // A changed parent can affect a child's ownership scope. Verify the full
      // checkpoint in this serializable transaction before reporting success.
      const restored = await readCheckpointRows(query, USER_ID, TABLES, SCOPES);
      for (const name of TABLES)
        if (!equal(restored[name], snapshot.tables[name]))
          throw new Error(`복원 결과가 기준 데이터와 다릅니다: ${name}`);
    }
  );
}

/** Lock contention rolls back the entire attempt; never hold table locks while waiting. */
export async function restoreApplicationCheckpoint(source = DEFAULT_SOURCE) {
  for (let attempt = 0; ; attempt++) {
    try { return await restoreApplicationCheckpointOnce(source); }
    catch (error) {
      if (attempt >= 2 || !(error && typeof error === "object" && "code" in error && ["55P03", "40001", "40P01"].includes(String(error.code)))) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
