import { applicationSubmissionState } from "./simulation/applicationExecution";
import type { SimulationSession } from "./simulation/session";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getCareerDevSqlClient } from "./devSql";
import {
  CAREER_CHECKPOINT_EMAIL,
  CAREER_CHECKPOINT_LABEL,
  CAREER_CHECKPOINT_SHA256,
  CAREER_CHECKPOINT_USER_ID,
  type CareerCheckpointStatus,
} from "./devCheckpointContract";
import {
  CHECKPOINT_TABLES,
  CHECKPOINT_OWNERS,
  CHECKPOINT_CHILDREN,
  type CareerCheckpoint,
  canonicalRows,
  tableSql,
} from "./devCheckpointData";
import {
  readCheckpointRows,
  restoreCheckpointRows,
  type CheckpointQuery,
} from "./devCheckpointRestore";

export async function loadCareerCheckpoint() {
  const bytes = await readFile(
    path.join(process.cwd(), ".local/career-reset/baseline.json")
  );
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    CAREER_CHECKPOINT_SHA256
  ) {
    throw new Error(
      "고정 기준 파일이 변경됐습니다. 원본 checkpoint를 복구해 주세요."
    );
  }
  const snapshot = JSON.parse(bytes.toString("utf8")) as CareerCheckpoint;
  if (
    snapshot.user.id !== CAREER_CHECKPOINT_USER_ID ||
    snapshot.user.email !== CAREER_CHECKPOINT_EMAIL
  ) {
    throw new Error("기준 계정이 일치하지 않습니다.");
  }
  // The private read-only capture also contains audit records. Never treat an
  // author's user_id on someone else's progress row as account ownership.
  for (const [table, owner] of Object.entries(CHECKPOINT_OWNERS)) {
    snapshot.tables[table] = (snapshot.tables[table] ?? []).filter(
      (row) => row[owner] === snapshot.user.id
    );
  }
  for (const [table, relation] of Object.entries(CHECKPOINT_CHILDREN)) {
    const ids = new Set(
      snapshot.tables[relation.parent].map((row) => row[relation.key])
    );
    snapshot.tables[table] = (snapshot.tables[table] ?? []).filter((row) =>
      ids.has(row[relation.column])
    );
  }
  return snapshot;
}

function equalRows(a: Record<string, unknown>[], b: Record<string, unknown>[]) {
  return JSON.stringify(canonicalRows(a)) === JSON.stringify(canonicalRows(b));
}

export async function assertCheckpointQuiescent(
  query: CheckpointQuery,
  snapshot: CareerCheckpoint
) {
  const id = snapshot.user.id;
  // These are actual executor/lease states, not language or quality checks.
  const busy = await query(
    `
    select '추천 검색' kind from opportunity_discovery_run where talent_id = $1::uuid and status in ('queued','running')
    union all select '외부 추천 검색' from external_recommendation_runs where talent_id = $1::uuid and status in ('queued','running')
    union all select '음성 통화' from talent_calls where user_id = $1::uuid and status in ('active','starting')
    union all select '지원 작업' from talent_simulate_application where user_id = $1::uuid and (
      payload->'browser'->>'status' in ('queued','running','waiting')
      or payload->'preparation'->'generation'->>'status' = 'running'
      or payload->>'analysisStatus' = 'running'
      or payload->'applicationInspection'->>'status' in ('queued','running')
      or (payload->'browser'->>'leaseUntil')::timestamptz > now()
    ) limit 1`,
    [id]
  );
  if (busy.length)
    throw new Error(
      `${busy[0].kind}이 진행 중입니다. 작업을 종료한 뒤 다시 복원해 주세요.`
    );
  // An application submission may be recorded inside an activity instead of a
  // delivery table. Keep that evidence rather than permitting a blind replay.
  const attempts = await query(
    `select id::text, payload->'browser' browser from talent_simulate_application where user_id=$1::uuid and payload->'browser' is not null`,
    [id]
  );
  for (const row of attempts) {
    const b = row.browser;
    const baseline = snapshot.tables.talent_simulate_application.find(
      (item) => item.id === row.id
    )?.payload as { browser?: unknown } | undefined;
    if (
      [b, ...(b.previousAttempts ?? [])].some(
        (browser) =>
          applicationSubmissionState({ browser } as SimulationSession) !==
          "not_submitted"
      ) &&
      !equalRows([b], [(baseline?.browser as Record<string, unknown>) ?? {}])
    ) {
      throw new Error(
        "외부 지원 시도 기록이 있습니다. 중복 제출 방지를 위해 이 기록을 지우는 복원은 중단했습니다."
      );
    }
  }
  // External receipts are not rolled back. If they changed, restoring old
  // account state could make already delivered work appear unexecuted.
  for (const [table, owner] of [
    ["contact_queue", "user_id"],
    ["career_email_messages", "talent_id"],
    ["email_reply_jobs", "talent_id"],
    ["talent_opportunity_delivery", "talent_id"],
    ["org_intro_email_threads", "talent_id"],
    ["meeting_schedules", "talent_id"],
  ]) {
    const rows = await query(
      `select to_jsonb(t) data from ${tableSql(table)} t where ${owner}=$1::uuid`,
      [id]
    );
    if (
      !equalRows(
        rows.map((row) => row.data),
        snapshot.tables[table] ?? []
      )
    ) {
      throw new Error(
        `연락·발송·일정 기록이 기준 시점 이후 바뀌어 복원하지 않았습니다 (${table}). 외부 실행은 리셋할 수 없습니다.`
      );
    }
  }
}

export async function inspectCareerCheckpoint(): Promise<CareerCheckpointStatus> {
  const snapshot = await loadCareerCheckpoint();
  return getCareerDevSqlClient().begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const query: CheckpointQuery = (sql, params = []) =>
        tx.unsafe(sql, params as never[]);
      const current = await readCheckpointRows(query, snapshot.user.id);
      return {
        available: true,
        capturedAt: CAREER_CHECKPOINT_LABEL,
        tables: CHECKPOINT_TABLES.map((name) => ({
          name,
          baseline: snapshot.tables[name].length,
          current: current[name].length,
          changed: !equalRows(snapshot.tables[name], current[name]),
        })),
      };
    }
  );
}

export async function restoreCareerCheckpoint() {
  const snapshot = await loadCareerCheckpoint();
  await getCareerDevSqlClient().begin(
    "isolation level serializable",
    async (tx) => {
      const query: CheckpointQuery = (sql, params = []) =>
        tx.unsafe(sql, params as never[]);
      await query("set local lock_timeout = '3000ms'");
      await query("set local statement_timeout = '30000ms'");
      await query("select pg_advisory_xact_lock(hashtext($1))", [
        `career-checkpoint:${snapshot.user.id}`,
      ]);
      const [identity] = await query(
        "select email from auth.users where id=$1::uuid",
        [snapshot.user.id]
      );
      if (identity?.email?.toLowerCase() !== CAREER_CHECKPOINT_EMAIL)
        throw new Error("복원 대상 계정을 확인할 수 없습니다.");
      // New columns/FKs require a new reviewed restore implementation, never a
      // silently recaptured baseline. Compare catalog definitions before writing.
      const columns = await query(
        `select table_name,column_name,is_generated from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position`,
        [CHECKPOINT_TABLES]
      );
      const frozenColumns = snapshot.columns
        .filter((c) => CHECKPOINT_TABLES.includes(c.table_name))
        .map(({ table_name, column_name, is_generated }) => ({
          table_name,
          column_name,
          is_generated,
        }));
      if (!equalRows(columns, frozenColumns))
        throw new Error("기준 시점과 DB 구조가 달라 복원을 중단했습니다.");
      snapshot.fks =
        (await query(`select child.relname child, parent.relname parent,pn.nspname parent_schema,
      array(select a.attname from unnest(con.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num order by k.pos) child_columns,
      array(select a.attname from unnest(con.confkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num order by k.pos) parent_columns
      from pg_constraint con join pg_class child on child.oid=con.conrelid join pg_class parent on parent.oid=con.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
      where con.contype='f' and con.connamespace='public'::regnamespace`)) as CareerCheckpoint["fks"];
      // Guard tables are locked as well, so another dispatcher cannot change the
      // delivery evidence between this check and commit.
      await query(
        `lock table contact_queue, career_email_messages, email_reply_jobs, talent_opportunity_delivery, org_intro_email_threads, meeting_schedules in share row exclusive mode`
      );
      await restoreCheckpointRows(query, snapshot, CHECKPOINT_TABLES, () =>
        assertCheckpointQuiescent(query, snapshot)
      );
    }
  );
}
