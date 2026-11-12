import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { APPLICATION_CHECKPOINT_SCOPES } from "./devApplicationCheckpoint";
import {
  APPLICATION_CHECKPOINT_GUARDS,
  assertApplicationOperationsQuiescent,
  assertCheckpointRuntimeIdle,
} from "./devApplicationCheckpointGuard";
import { assertCheckpointQuiescent } from "./devCheckpoint.server";
import {
  canonicalRows,
  tableSql,
  type CareerCheckpoint,
  type CheckpointScopes,
} from "./devCheckpointData";
import {
  readCheckpointRows,
  readCheckpointRowTexts,
  restoreCheckpointRows,
  type CheckpointQuery,
} from "./devCheckpointRestore";
import { getCareerDevSqlClient } from "./devSqlClient";

type Identity = { id: string; email: string };
type TimedCheckpoint = Omit<CareerCheckpoint, "tables"> & { rows: Record<string, string[]> };
const scopes: CheckpointScopes = {
  owners: {
    ...Object.fromEntries(
      Object.entries(APPLICATION_CHECKPOINT_SCOPES.owners).filter(
        ([name]) => !name.startsWith("company_")
      )
    ),
    talent_external_evaluations: "talent_id",
  },
  children: Object.fromEntries(
    Object.entries(APPLICATION_CHECKPOINT_SCOPES.children).filter(
      ([, relation]) => !relation.parent.startsWith("company_")
    )
  ),
};
const tables = [...Object.keys(scopes.owners), ...Object.keys(scopes.children)];
const guardScopes = { owners: APPLICATION_CHECKPOINT_GUARDS, children: {} };
const guardTables = Object.keys(guardScopes.owners);
const equal = (a: Record<string, unknown>[], b: Record<string, unknown>[]) =>
  JSON.stringify(canonicalRows(a)) === JSON.stringify(canonicalRows(b));

const readColumns = (query: CheckpointQuery) =>
  query(
    `select table_name, column_name, is_generated from information_schema.columns
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name, ordinal_position`,
    [tables]
  ) as Promise<CareerCheckpoint["columns"]>;

async function readIdentity(query: CheckpointQuery, user: Identity) {
  const [identity] = await query(
    `select a.email, statement_timestamp() as captured_at
     from auth.users a join public.talent_users t on t.user_id = a.id
     where a.id = $1::uuid`,
    [user.id]
  );
  if (identity?.email?.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("DB에서 현재 Career 계정을 확인할 수 없습니다.");
  }
  return new Date(identity.captured_at).toISOString();
}

function checkpointDirectory(user: Identity) {
  return path.join(process.cwd(), ".local/career-reset/snapshots", user.id);
}

export function isTimedCheckpointTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value &&
    /^\d{4}-/.test(value);
}

function fileName(time: string) {
  return `${time.replaceAll(":", "-")}.json`;
}

export async function listTimedCareerCheckpoints(user: Identity) {
  const names = await readdir(checkpointDirectory(user)).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5).replace(/T(\d{2})-(\d{2})-/, "T$1:$2:"))
    .filter(isTimedCheckpointTime)
    .sort()
    .reverse();
}

async function assertRestoreSafe(query: CheckpointQuery, checkpoint: TimedCheckpoint) {
  const snapshot: CareerCheckpoint = {
    ...checkpoint,
    tables: Object.fromEntries(
      [...guardTables, "talent_simulate_application", "talent_external_operations"].map(
        (table) => [table, checkpoint.rows[table].map((row) => JSON.parse(row))]
      )
    ),
  };
  const id = snapshot.user.id;
  await assertCheckpointQuiescent(query, snapshot);
  const handedOff = await query(
    `select 1 from public.opportunity_discovery_run
     where talent_id = $1::uuid and status = 'handed_off' limit 1`,
    [id]
  );
  if (handedOff.length) throw new Error("추천 작업이 진행 중입니다. 작업을 종료한 뒤 다시 시도해 주세요.");
  const guards = await readCheckpointRowTexts(query, id, guardTables, guardScopes);
  for (const table of guardTables) {
    if (JSON.stringify(guards[table]) !== JSON.stringify(checkpoint.rows[table])) {
      throw new Error(`발송·일정 기록이 바뀌어 복원을 중단했습니다 (${table}).`);
    }
  }
  const current = await readCheckpointRows(query, id, [
    "talent_external_operations",
    "talent_agent_runtime",
    "talent_agent_work_runtime",
  ], scopes);
  assertApplicationOperationsQuiescent(
    current.talent_external_operations,
    snapshot.tables.talent_external_operations
  );
  assertCheckpointRuntimeIdle(current.talent_agent_runtime, current.talent_agent_work_runtime);
}

export async function saveTimedCareerCheckpoint(
  user: Identity,
  source: ReturnType<typeof postgres> = getCareerDevSqlClient(),
  recoveredAt?: string
) {
  if (recoveredAt !== undefined &&
      (!isTimedCheckpointTime(recoveredAt) || Date.parse(recoveredAt) > Date.now())) {
    throw new Error("백업의 복구 시각을 UTC ISO 형식으로 지정해 주세요.");
  }
  const snapshot = await source.begin("isolation level repeatable read read only", async (tx) => {
    const query: CheckpointQuery = (sql, params = []) => tx.unsafe(sql, params as never[]);
    await query("set local statement_timeout = '30000ms'");
    await query("set local time zone 'UTC'");
    const observedAt = await readIdentity(query, user);
    const capturedAt = recoveredAt ?? observedAt;
    const columns = await readColumns(query);
    const rows = await readCheckpointRowTexts(query, user.id, tables, scopes);
    Object.assign(rows, await readCheckpointRowTexts(query, user.id, guardTables, guardScopes));
    const snapshot: TimedCheckpoint = {
      version: 1,
      user: { ...user, captured_at: capturedAt },
      columns,
      fks: [],
      rows,
    };
    await assertRestoreSafe(query, snapshot);
    return snapshot;
  });
  const directory = checkpointDirectory(user);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryFile = path.join(directory, randomUUID());
  try {
    await writeFile(temporaryFile, JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
    // Publish only a complete file, and keep the first snapshot for each instant.
    await link(temporaryFile, path.join(directory, fileName(snapshot.user.captured_at)));
  } finally {
    await rm(temporaryFile, { force: true });
  }
  return snapshot.user.captured_at;
}

export async function restoreTimedCareerCheckpoint(user: Identity, time: string) {
  if (!isTimedCheckpointTime(time)) throw new Error("저장된 복원 시각을 선택해 주세요.");
  const file = await readFile(path.join(checkpointDirectory(user), fileName(time)), "utf8");
  const snapshot = JSON.parse(file) as TimedCheckpoint;
  if (
    snapshot.version !== 1 || snapshot.user.id !== user.id ||
    snapshot.user.email.toLowerCase() !== user.email.toLowerCase() ||
    snapshot.user.captured_at !== time ||
    [...tables, ...guardTables].some((name) => !Array.isArray(snapshot.rows[name]))
  ) {
    throw new Error("이 계정과 시각에 해당하는 복원 데이터를 확인할 수 없습니다.");
  }

  await getCareerDevSqlClient().begin(async (tx) => {
    const query: CheckpointQuery = (sql, params = []) => tx.unsafe(sql, params as never[]);
    await query("set local lock_timeout = '3000ms'");
    await query("set local statement_timeout = '30000ms'");
    await query("set local time zone 'UTC'");
    await query("select pg_advisory_xact_lock(hashtext($1))", [`career-checkpoint:${user.id}`]);
    // Read only after these locks, including on tables that may appear unchanged.
    await query(`lock table ${[...tables, ...guardTables].sort().map(tableSql).join(", ")}
      in share row exclusive mode nowait`);
    await readIdentity(query, user);
    if (!equal(await readColumns(query), snapshot.columns)) {
      throw new Error("저장 시점과 현재 DB 구조가 달라 복원을 중단했습니다.");
    }
    await assertRestoreSafe(query, snapshot);
    const current = await readCheckpointRowTexts(query, user.id, tables, scopes);
    const changed = tables.filter(
      (table) => JSON.stringify(current[table]) !== JSON.stringify(snapshot.rows[table])
    );
    if (!changed.length) return;

    snapshot.fks = await query(`select child.relname child, parent.relname parent, pn.nspname parent_schema,
      array(select a.attname from unnest(con.conkey) with ordinality k(num,pos)
        join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num order by k.pos) child_columns,
      array(select a.attname from unnest(con.confkey) with ordinality k(num,pos)
        join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num order by k.pos) parent_columns
      from pg_constraint con join pg_class child on child.oid=con.conrelid
      join pg_class parent on parent.oid=con.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
      where con.contype='f' and con.connamespace='public'::regnamespace`) as CareerCheckpoint["fks"];
    await restoreCheckpointRows(query, { ...snapshot, tables: {} }, changed, undefined, scopes, snapshot.rows);
    const restored = await readCheckpointRowTexts(query, user.id, tables, scopes);
    for (const table of tables) {
      if (JSON.stringify(restored[table]) !== JSON.stringify(snapshot.rows[table])) {
        throw new Error(`복원 결과가 기준 데이터와 다릅니다 (${table}).`);
      }
    }
  });
}
