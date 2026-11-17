import type { PGlite } from "@electric-sql/pglite";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

/** Test-only PostgREST transport over the actual local SQL migration functions.
 * No provider, model, owner check, calculation, or queue algorithm is mocked here. */
export function resourcePgliteTransport(db: PGlite) {
  const ident = (name: string) => {
    if (!/^[a-z_][a-z_0-9]*$/.test(name))
      throw new Error(`Unexpected test identifier ${name}`);
    return `"${name}"`;
  };
  const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === "create_talent_external_operation") {
          const existing = await db.query(
            "select * from talent_external_operations where user_id=$1 and kind=$2 and idempotency_key=$3",
            [args.p_user_id, args.p_kind, args.p_idempotency_key]
          );
          if (existing.rows.length)
            return { data: wire(existing.rows[0]), error: null };
          const inserted = await db.query(
            "insert into talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,request) values($1,$2,$3,$4,$5,$6) returning *",
            [
              args.p_user_id,
              args.p_conversation_id,
              args.p_kind,
              args.p_parent_id,
              args.p_idempotency_key,
              args.p_request,
            ]
          );
          return { data: wire(inserted.rows[0]), error: null };
        }
        const fields = Object.keys(args),
          result = await db.query<{ value: unknown }>(
            `select to_jsonb(${ident(name)}(${fields.map((key, i) => `${ident(key)} := $${i + 1}`).join(",")})) value`,
            Object.values(args)
          );
        return {
          data: wire(
            ["career_read_result_items_v1", "career_list_opportunities_v1", "career_search_history_v1"].includes(name)
              ? result.rows.map((row) => row.value)
              : (result.rows[0]?.value ?? null)
          ),
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table: string) {
      const values: unknown[] = [],
        where: string[] = [],
        orders: string[] = [];
      let fields = "*",
        changes: Record<string, unknown> | undefined,
        limit: number | undefined, offset: number | undefined, exactCount = false;
      const parameter = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const execute = async (single = false) => {
        try {
          const filter = where.length ? ` where ${where.join(" and ")}` : "";
          const sql = changes
            ? `update ${ident(table)} set ${Object.entries(changes)
                .map(([key, value]) => `${ident(key)}=${parameter(value)}`)
                .join(",")}${filter} returning ${fields}`
            : `select ${fields} from ${ident(table)}${filter}${orders.length ? ` order by ${orders.join(",")}` : ""}${limit === undefined ? "" : ` limit ${limit}`}${offset === undefined ? "" : ` offset ${offset}`}`;
          // PostgREST serializes numeric columns (including display_order) as
          // JSON numbers. PGlite's default wire parser returns numeric strings.
          const result = await db.query(sql, values, { parsers: { 1700: Number } });
          const count = exactCount
            ? (await db.query<{ n: number }>(`select count(*)::int n from ${ident(table)}${filter}`, values)).rows[0].n
            : null;
          return {
            count,
            data: wire(single ? (result.rows[0] ?? null) : result.rows),
            error: null,
          };
        } catch (error) {
          return { data: null, error };
        }
      };
      const query = {
        select(columns = "*", options?: { count: "exact" }) {
          exactCount = options?.count === "exact";
          fields =
            columns === "*" ? "*" : columns.split(",").map(ident).join(",");
          return query;
        },
        eq(key: string, value: unknown) {
          where.push(`${ident(key)}=${parameter(value)}`);
          return query;
        },
        in(key: string, allowed: unknown[]) {
          where.push(allowed.length ? `${ident(key)} in (${allowed.map(parameter).join(",")})` : "false");
          return query;
        },
        is(key: string, value: unknown) {
          if (value !== null) throw new Error("Unsupported test predicate");
          where.push(`${ident(key)} is null`);
          return query;
        },
        order(key: string, options?: { ascending?: boolean }) {
          orders.push(
            `${ident(key)} ${options?.ascending === false ? "desc" : "asc"}`
          );
          return query;
        },
        range(from: number, to: number) {
          offset = from;
          limit = to - from + 1;
          return query;
        },
        limit(value: number) {
          limit = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          changes = value;
          return query;
        },
        single: () => execute(true),
        maybeSingle: () => execute(true),
        then: (resolve: any, reject: any) => execute().then(resolve, reject),
      };
      return query;
    },
  };
  return client as unknown as TalentAdminClient;
}
