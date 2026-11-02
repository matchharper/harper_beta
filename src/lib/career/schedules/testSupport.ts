import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const owner = "11111111-1111-4111-8111-111111111111";
export const other = "22222222-2222-4222-8222-222222222222";
export const workspace = "33333333-3333-4333-8333-333333333333";
export const second = "44444444-4444-4444-8444-444444444444";
export const role = "55555555-5555-4555-8555-555555555555";
export const roleTwo = "66666666-6666-4666-8666-666666666666";
export const fixture = `
create role anon; create role authenticated; create role service_role; create role harper_worker bypassrls;
create table talent_users(user_id uuid primary key,deleted_at timestamptz,name text,headline text,bio text,location text,current_location jsonb);
create table talent_conversations(id uuid primary key,user_id uuid);
create table talent_messages(id bigint primary key,user_id uuid,role text,content text,created_at timestamptz default now(),message_type text default 'chat',payload jsonb default '{}');
create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,status text,dedupe_key text unique,trigger_payload jsonb,coverage jsonb default '{}',updated_at timestamptz default now(),completed_at timestamptz,lease_token uuid,lease_heartbeat_at timestamptz,not_before timestamptz default now(),created_at timestamptz default now());
create table talent_external_operations(id uuid primary key default gen_random_uuid(),user_id uuid,conversation_id uuid,kind text,idempotency_key text,status text,request jsonb,result jsonb,unique(user_id,kind,idempotency_key));
create table company_db(id bigint primary key,name text);
create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,company_description text,brief text,pitch text);
create table talent_company_follow(id uuid primary key default gen_random_uuid(),talent_id uuid,company_db_id bigint not null references company_db(id),company_workspace_id uuid references company_workspace(company_workspace_id),conversation_id uuid,source text,tracking_summary text,discovery_channel_summary text,followed_at timestamptz default now(),unfollowed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),unique(talent_id,company_db_id));
create table talent_experiences(id bigint primary key,talent_id uuid);
create table talent_educations(id bigint primary key,talent_id uuid);
create table talent_extras(talent_id uuid primary key,content jsonb);
create table talent_contexts(talent_id uuid,ref bigint,revision bigint,collection text,deleted_at timestamptz);
create table talent_behavior_context_changes(id bigint,talent_id uuid);
create table talent_setting(user_id uuid primary key,profile_visibility text,get_external_recommendation boolean,get_internal_recommendation boolean,blocked_companies text[],status text);
create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,name text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
create function company_role_search_brief_version_v1(uuid) returns bigint language sql as $$select 1::bigint$$;
create table company_memory_entries(id bigint,revision bigint,company_workspace_id uuid,deleted_at timestamptz);
create table company_memories(id bigint,updated_at timestamptz,company_workspace_id uuid);
create table opportunity_scheduler_state(talent_id uuid,next_check_at timestamptz);
create table company_talent_followups(id uuid primary key,talent_id uuid,revision bigint default 1);
insert into talent_users(user_id) values('${owner}'),('${other}');
insert into company_db values(1,'Example');
insert into company_workspace(company_workspace_id,company_db_id) values('${workspace}',1),('${second}',1);
insert into talent_setting values('${owner}','open_to_matches',true,true,'{}','active'),('${other}','open_to_matches',true,true,'{}','stopped');
alter table talent_setting add column is_onboarding_done boolean default false;
alter table talent_external_operations add column created_at timestamptz default now();
insert into company_roles values('${role}','${workspace}','internal','Engineer','active',false,null,'{}'),('${roleTwo}','${second}','external','Designer','active',false,null,'{}');
`;
export async function setup() {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261029182909_career_company_follows_and_schedules.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261102064501_career_adaptive_check_in.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  return db;
}
export async function write(
  db: PGlite,
  input: object,
  request: string,
  userId = owner
) {
  const result = await db.query<{ item: any }>(
    "select write_career_schedule($1::uuid,null,$2,$3::jsonb) item",
    [userId, request, JSON.stringify(input)]
  );
  return result.rows[0].item;
}

// This adapter executes the production RPC SQL against PGlite. REST transport is
// stubbed; these tests do not claim to exercise the hosted PostgREST service.
export function localAdmin(db: PGlite): any {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        const keys = Object.keys(args);
        const result = await db.query<any>(
          `select public.${name}(${keys.map((key, index) => `${key}=>$${index + 1}`).join(",")}) value`,
          keys.map((key) =>
            typeof args[key] === "object" && args[key] !== null
              ? JSON.stringify(args[key])
              : args[key]
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
      const filters: Array<(row: any) => boolean> = [];
      let inserted: Record<string, unknown> | null = null;
      let limit = Infinity,
        offset = 0;
      const ordering: { key: string; ascending: boolean }[] = [];
      const query: any = {
        select() {
          return this;
        },
        order(key: string, options?: { ascending?: boolean }) {
          ordering.push({ key, ascending: options?.ascending !== false });
          return this;
        },
        range(start: number, end: number) {
          offset = start;
          limit = end - start + 1;
          return this;
        },
        is(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return this;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return this;
        },
        lte(key: string, value: string) {
          filters.push(
            (row) =>
              row[key] !== null &&
              new Date(row[key]).getTime() <= new Date(value).getTime()
          );
          return this;
        },
        limit(value: number) {
          limit = value;
          return this;
        },
        in(key: string, values: unknown[]) {
          filters.push((row) => values.includes(row[key]));
          return this;
        },
        insert(value: Record<string, unknown>) {
          inserted = value;
          return this;
        },
        async execute() {
          try {
            if (inserted) {
              const entries = Object.entries(inserted);
              const result = await db.query<any>(
                `insert into ${table}(${entries.map(([key]) => key).join(",")}) values(${entries.map((_, index) => `$${index + 1}`).join(",")}) returning *`,
                entries.map(([, value]) =>
                  typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : value
                )
              );
              return { data: result.rows, error: null };
            }
            const result = await db.query<any>(`select * from ${table}`);
            const rows = result.rows
              .filter((row) => filters.every((filter) => filter(row)))
              .sort((a, b) => {
                for (const order of ordering) {
                  const diff =
                    a[order.key] < b[order.key]
                      ? -1
                      : a[order.key] > b[order.key]
                        ? 1
                        : 0;
                  if (diff) return order.ascending ? diff : -diff;
                }
                return 0;
              });
            if (table === "talent_agent_schedules")
              for (const row of rows) {
                row.last_change = row.last_operation_id
                  ? (
                      await db.query<any>(
                        "select id,request,created_at from talent_external_operations where id=$1",
                        [row.last_operation_id]
                      )
                    ).rows[0]
                  : null;
              }
            return {
              data: rows.slice(offset, offset + limit),
              count: rows.length,
              error: null,
            };
          } catch (error: any) {
            return {
              data: null,
              error: { message: error.message, code: error.code },
            };
          }
        },
        async maybeSingle() {
          const result = await this.execute();
          return { ...result, data: result.data?.[0] ?? null };
        },
        then(resolve: any, reject: any) {
          return this.execute().then(resolve, reject);
        },
      };
      return query;
    },
  };
}

export async function follow(
  db: PGlite,
  input: object,
  key: string,
  userId = owner
) {
  return (
    await db.query<any>(
      "select write_career_company_follow($1,null,$2,$3) item",
      [userId, key, JSON.stringify(input)]
    )
  ).rows[0].item;
}
