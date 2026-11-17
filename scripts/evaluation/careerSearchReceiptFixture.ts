import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import * as history from "@/lib/career/resources/searchHistory";
import { record } from "@/lib/career/resources/types";
import { readResource } from "@/lib/career/resources/read";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";

export function createSearchReceiptFixture(
  userId: string,
  conversationId: string,
  requestTime: string,
  pages: { resourceId: string; title: string; url: string }[]
) {
  let database: Promise<PGlite> | undefined;
  let written = false;
  const db = () =>
    (database ??= (async () => {
      const pg = new PGlite();
      await pg.exec(`create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key, deleted_at timestamptz);
      create table talent_conversations(id uuid primary key,user_id uuid);
      create table opportunity_discovery_run(id uuid primary key,talent_id uuid,trigger text,trigger_payload jsonb);
      create table talent_integrations(talent_id uuid,provider text,status text,career_mail_sync jsonb);
      create sequence receipt_clock;
      create table talent_external_operations(id uuid primary key default gen_random_uuid(),user_id uuid,conversation_id uuid,
        parent_id uuid,kind text,idempotency_key text,unique(user_id,kind,idempotency_key),status text,revision bigint default 1,
        request jsonb,result jsonb,provider_refs jsonb default '{}',
        created_at timestamptz default current_setting('fixture.at')::timestamptz + nextval('receipt_clock') * interval '1 millisecond',
        updated_at timestamptz default current_setting('fixture.at')::timestamptz);
      create function career_resource_available_v1(p_user uuid,p_ref jsonb) returns boolean language sql as $$
        select exists(select 1 from talent_external_operations where user_id=p_user and p_ref->>'kind'='operation' and id::text=p_ref->>'id')
      $$;`);
      await pg.query("select set_config('fixture.at',$1,false)", [requestTime]);
      await pg.query("insert into talent_users(user_id) values ($1)", [userId]);
      await pg.query("insert into talent_conversations values ($1,$2)", [
        conversationId,
        userId,
      ]);
      await pg.query(
        "insert into talent_integrations values ($1,'gmail','active',$2)",
        [userId, JSON.stringify({ generation: "fixture-account" })]
      );
      const sql = await readFile(
        "supabase/migrations/20261116081510_career_search_receipts.sql",
        "utf8"
      );
      await pg.exec(sql.split("-- Keep the lightweight execution facts")[0]);
      return pg;
    })());
  const admin: any = {
    async rpc(name: string, args: Record<string, any>) {
      const pg = await db();
      if (name === "career_record_search_receipt_v1") {
        await pg.query(
          "select career_record_search_receipt_v1($1,$2,$3,$4,$5,$6)",
          [
            args.p_user,
            args.p_conversation,
            args.p_key,
            JSON.stringify(args.p_request),
            args.p_status,
            JSON.stringify(args.p_result),
          ]
        );
        written = true;
        return { data: null, error: null };
      }
      if (name === "career_search_history_v1") {
        const { rows } = await pg.query<any>(
          "select * from career_search_history_v1($1,$2,$3,$4,$5)",
          [args.p_user, args.p_query, args.p_since, args.p_offset, args.p_limit]
        );
        return {
          data: rows.map((r) => ({
            ...r,
            created_at: r.created_at.toISOString(),
          })),
          error: null,
        };
      }
      assert.equal(name, "career_resource_available_v1");
      const { rows } = await pg.query<any>(
        "select career_resource_available_v1($1,$2) as allowed",
        [args.p_user, JSON.stringify(args.p_ref)]
      );
      return { data: rows[0].allowed, error: null };
    },
    from(table: string) {
      if (table === "documents")
        return {
          select: () => ({
            eq: (scopeKey: string, scopeValue: string) => {
              assert.equal(scopeKey, "source_scope");
              assert.equal(scopeValue, "public");
              return {
                in: async (key: string, ids: (string | number)[]) => {
                  assert.equal(key, "id");
                  return {
                    data: pages
                      .filter((p) => ids.map(String).includes(p.resourceId))
                      .map((p) => ({
                        id: Number(p.resourceId),
                        url: p.url,
                        title: p.title,
                      })),
                    error: null,
                  };
                },
              };
            },
          }),
        };
      assert.equal(table, "talent_external_operations");
      const filter: Record<string, string> = {};
      const statement = {
        select: () => statement,
        eq(key: string, value: string) {
          filter[key] = value;
          return statement;
        },
        async maybeSingle() {
          const { rows } = await (
            await db()
          ).query<any>(
            "select * from talent_external_operations where user_id=$1 and id=$2",
            [filter.user_id, filter.id]
          );
          const row = rows[0];
          return {
            data: row
              ? {
                  ...row,
                  created_at: row.created_at.toISOString(),
                  updated_at: row.updated_at.toISOString(),
                }
              : null,
            error: null,
          };
        },
      };
      return statement;
    },
  };
  const context = { userId, admin, conversationId };
  return {
    record(
      name: string,
      input: Record<string, unknown>,
      observation: { result: unknown } | { error: unknown },
      userMessageId: number,
      callId: number
    ) {
      return history.recordSearchExecution(
        name,
        input,
        { ...context, userMessageId, toolCallId: String(callId) } as any,
        observation
      );
    },
    read(input: Record<string, unknown>) {
      return history.readSearchHistory(context, input);
    },
    operation(id: string, revision?: string) {
      return readResource(context, { kind: "operation", id, revision });
    },
    async latest() {
      if (!written) return "";
      const result = await history.readSearchHistory(context, { limit: 1 });
      const last = result.searches[0];
      if (!last) return "";
      const module = history as typeof history & {
        formatLatestCareerSearch?: (row: typeof last) => string;
      };
      if (module.formatLatestCareerSearch)
        return module.formatLatestCareerSearch(last);
      // Replaying the pre-November 17 product, which had this text inline in agentTurnRuntime.
      const request = record(last.request),
        scope = record(request.scope),
        outcome = record(last.result);
      return `Last search: ${formatLlmDateTime(last.created_at)} (${PROMPT_TIME_ZONE}), ${request.source}, ${scope.query ?? (Array.isArray(scope.queries) ? scope.queries.join("; ") : (request.purpose ?? scope.purpose ?? "see execution scope"))}, ${last.status}, ${outcome.count ?? "unknown"} results. read_talent_activity_events(scope=searches) retrieves earlier search scope and outcomes by subject or date.`;
    },
    async close() {
      if (database) await (await database).close();
    },
  };
}
