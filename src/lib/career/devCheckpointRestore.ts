import {
  CHECKPOINT_TABLES,
  type CareerCheckpoint,
  type CheckpointRow,
  quoteIdentifier as q,
  scopeSql,
  tableSql,
  canonicalRows,
} from "./devCheckpointData";

export type CheckpointQuery = (
  sql: string,
  parameters?: unknown[]
) => Promise<Record<string, any>[]>;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const runStatements = (query: CheckpointQuery, statements: string[]) =>
  query(
    `do ${literal(`begin ${statements.map((statement) => `execute ${literal(statement)};`).join("\n")} end`)};`
  );
const beforeTable = (table: string) => `pg_temp.${q(`checkpoint_${table}`)}`;

export async function readCheckpointRows(
  query: CheckpointQuery,
  userId: string,
  tables = CHECKPOINT_TABLES
) {
  const rows = await query(
    tables
      .map(
        (table) =>
          `select '${table}' as name, coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as data from ${tableSql(table)} t where ${scopeSql(table, "t")}`
      )
      .join(" union all "),
    [userId]
  );
  const current: Record<string, CheckpointRow[]> = Object.fromEntries(
    rows.map((row) => [row.name, row.data])
  );
  return current;
}

/** Caller owns one transaction. No side-effect triggers or FK cascades run during
 * rewind. We lock every affected FK endpoint and explicitly verify every edge
 * touching replaced rows before commit. A dangling external reference aborts the
 * whole transaction rather than deleting another account/company's records. */
export async function restoreCheckpointRows(
  query: CheckpointQuery,
  snapshot: CareerCheckpoint,
  tables = CHECKPOINT_TABLES,
  beforeRestore?: () => Promise<void>
) {
  const selected = new Set(tables);
  const edges = snapshot.fks.filter(
    (f) =>
      selected.has(f.child) ||
      (f.parent_schema === "public" && selected.has(f.parent))
  );
  const locks = new Set(tables);
  for (const edge of edges) {
    locks.add(edge.child);
    if (edge.parent_schema === "public") locks.add(edge.parent);
  }
  await query(
    `lock table ${[...locks].sort().map(tableSql).join(", ")} in share row exclusive mode`
  );
  await beforeRestore?.();
  await query("set local standard_conforming_strings = on");
  const statements: string[] = [];
  // Persist original rows in transaction-local tables for scopes whose parent is
  // restored first, and for checking external references after the replacement.
  for (const table of tables) {
    statements.push(
      `create temporary table ${q(`checkpoint_${table}`)} on commit drop as select t.ctid as _checkpoint_ctid, t.* from ${tableSql(table)} t where ${scopeSql(table, "t", literal(snapshot.user.id))}`
    );
  }
  statements.push("set local session_replication_role = replica");
  for (const table of tables) {
    const columns = snapshot.columns
      .filter((c) => c.table_name === table && c.is_generated === "NEVER")
      .map((c) => c.column_name);
    // Locked tuple IDs keep deletion indexed and account-scoped, including
    // tables without primary keys. They are used only inside this transaction.
    statements.push(
      `delete from ${tableSql(table)} t using ${beforeTable(table)} b where t.ctid = b._checkpoint_ctid`
    );
    if (snapshot.tables[table].length) {
      const names = columns.map(q).join(", ");
      statements.push(
        `insert into ${tableSql(table)} (${names}) overriding system value select ${names} from jsonb_populate_recordset(null::${tableSql(table)}, ${literal(JSON.stringify(snapshot.tables[table]))}::jsonb)`
      );
    }
  }
  await runStatements(query, statements);
  const checks: string[] = [];
  for (const edge of edges) {
    const child = tableSql(edge.child);
    const parent = `${q(edge.parent_schema)}.${q(edge.parent)}`;
    const equality = (a: string, b: string) =>
      edge.child_columns
        .map((col, i) => `${a}.${q(col)} = ${b}.${q(edge.parent_columns[i])}`)
        .join(" and ");
    const affected: string[] = [];
    if (selected.has(edge.child))
      affected.push(scopeSql(edge.child, "c", literal(snapshot.user.id)));
    if (edge.parent_schema === "public" && selected.has(edge.parent)) {
      affected.push(
        `exists(select 1 from ${beforeTable(edge.parent)} b where ${equality("c", "b")})`
      );
    }
    const required = edge.child_columns
      .map((col) => `c.${q(col)} is not null`)
      .join(" and ");
    checks.push(
      `if exists(select 1 from ${child} c where (${affected.join(" or ")}) and ${required} and not exists(select 1 from ${parent} p where ${equality("c", "p")})) then raise exception '%', ${literal(`다른 기록이 연결돼 있어 복원하지 않았습니다: ${edge.child} → ${edge.parent}`)}; end if;`
    );
  }
  await query(`do ${literal(`begin ${checks.join("\n")} end`)};`);
  await query("set local session_replication_role = origin");
  const restored = await readCheckpointRows(query, snapshot.user.id, tables);
  for (const table of tables) {
    if (
      JSON.stringify(canonicalRows(restored[table])) !==
      JSON.stringify(canonicalRows(snapshot.tables[table]))
    ) {
      throw new Error(`복원 결과가 기준 데이터와 다릅니다: ${table}`);
    }
  }
}
