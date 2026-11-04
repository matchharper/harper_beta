import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function followDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table talent_users(user_id uuid primary key,deleted_at timestamptz);
    create table talent_setting(user_id uuid primary key,get_external_recommendation boolean default true,get_internal_recommendation boolean default true,profile_visibility text default 'open_to_matches',status text default 'active',blocked_companies text[] default '{}');
    create table company_db(id bigint primary key,name text,website_url text);
    create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,company_name text,published_name text,homepage_url text,external_roles_enabled boolean default true);
    create table talent_company_follow(id uuid primary key,talent_id uuid,company_db_id bigint,company_workspace_id uuid,scope text default 'company',instruction text default '',revision int default 1,followed_at timestamptz default now(),unfollowed_at timestamptz);
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text default 'external',source_provider text default 'crawler',name text,status text default 'active',is_expired boolean default false,expires_at timestamptz,information jsonb default '{}',posted_at timestamptz,created_at timestamptz default now());
    create table talent_opportunity_recommendation(id bigint primary key,talent_id uuid,role_id uuid);
    create table talent_external_evaluations(id uuid primary key,talent_id uuid,role_id uuid,run_id uuid,assessment jsonb,evaluated_at timestamptz default now());
    create table company_role_candidate_evaluations(id uuid primary key,talent_id uuid,role_id uuid,discovery_run_id uuid,assessment jsonb,stage int,evaluated_at timestamptz default now());
    create table opportunity_discovery_run(id uuid primary key,talent_id uuid,conversation_id uuid,status text default 'handed_off',trigger_payload jsonb default '{"runContract":"career_agent_v1","sourceEvents":[{"sourceKind":"schedule","scheduleKey":"career_check_in"}]}',coverage jsonb default '{}',error_message text,dedupe_key text);
    create table external_recommendation_runs(id uuid primary key,talent_id uuid,status text,error text,operation_id text);
    create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'free'::text$$;
    insert into talent_users values('${id(1)}',null),('${id(2)}',null);
    insert into talent_setting(user_id) values('${id(1)}'),('${id(2)}');
    insert into company_db values(1,'Atlas','https://atlas.example'),(2,'Other','https://other.example');
    insert into company_workspace(company_workspace_id,company_db_id,company_name) values('${id(10)}',1,'Atlas Seoul'),('${id(11)}',1,'Atlas Busan'),('${id(12)}',2,'Other');
    insert into talent_company_follow(id,talent_id,company_db_id) values('${id(20)}','${id(1)}',1),('${id(21)}','${id(2)}',1);
    insert into company_roles(role_id,company_workspace_id,name) values('${id(30)}','${id(10)}','Platform engineer'),('${id(31)}','${id(11)}','Designer'),('${id(32)}','${id(12)}','Other role');
    insert into opportunity_discovery_run(id,talent_id) values('${id(40)}','${id(1)}'),('${id(41)}','${id(1)}');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261102080129_career_follow_preparation.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  return db;
}
export function followAdmin(db: PGlite): any {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === "set_timeout_and_execute_raw_sql")
          return {
            data: (await db.query(String(args.sql_query))).rows,
            error: null,
          };
        const result = await db.query<{ value: any }>(
          `select ${name}(${Object.keys(args)
            .map((key, i) => `${key}=>$${i + 1}`)
            .join(",")}) value`,
          Object.values(args).map((value) =>
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : value
          )
        );
        return { data: result.rows[0].value, error: null };
      } catch (error: any) {
        return {
          data: null,
          error: { message: error.message, code: error.code },
        };
      }
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | undefined;
      const q: any = {
        select() {
          return q;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return q;
        },
        update(value: Record<string, unknown>) {
          patch = value;
          return q;
        },
        async execute(single = false) {
          try {
            const values: unknown[] = [];
            const bind = (value: unknown) => {
              values.push(
                typeof value === "object" && value !== null
                  ? JSON.stringify(value)
                  : value
              );
              return `$${values.length}`;
            };
            const set = patch
              ? Object.entries(patch)
                  .map(([key, value]) => `${key}=${bind(value)}`)
                  .join(",")
              : "";
            const where = filters
              .map(([key, value]) => `${key}=${bind(value)}`)
              .join(" and ");
            const sql = patch
              ? `update ${table} set ${set} where ${where} returning *`
              : `select * from ${table}${where ? " where " + where : ""}`;
            const rows = (await db.query(sql, values)).rows;
            return { data: single ? (rows[0] ?? null) : rows, error: null };
          } catch (error: any) {
            return {
              data: null,
              error: { message: error.message, code: error.code },
            };
          }
        },
        single() {
          return q.execute(true);
        },
        maybeSingle() {
          return q.execute(true);
        },
        then(resolve: any, reject: any) {
          return q.execute().then(resolve, reject);
        },
      };
      return q;
    },
  };
}
