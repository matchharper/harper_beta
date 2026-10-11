// Local-only Postgres fixture. No production data or Supabase connection.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
export async function createWorkspaceBillingFixture(db = new PGlite()) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_workspace(company_workspace_id uuid primary key,company_name text,signup_state jsonb,signup_domain text,created_at timestamptz default now());
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,status text default 'draft',source_type text default 'internal',is_expired boolean default false,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),name text,information jsonb);
    create table company_internal_roles(role_id uuid primary key, is_harper_tailored_role boolean default false);
    create table company_intro_candidates(id uuid primary key,company_workspace_id uuid,role_id uuid,talent_id uuid,status text);
    create table talent_opportunity_recommendation(id uuid primary key,role_id uuid,talent_id uuid,processed_stage text,updated_at timestamptz);
    create table talent_opportunity_tag(id bigserial primary key,talent_id uuid,opportunity_id uuid,tag text);
    create table talent_progress(id uuid primary key,company_user_id uuid,kind text,metadata jsonb,recommendation_id uuid,role_id uuid,talent_id uuid,text text,user_id text);
    create function request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  for (const file of [
    "20261007052736_workspace_agent_subscriptions.sql",
    "20261007061858_workspace_billing_annual_credits.sql",
    "20261007113918_workspace_slot_credits.sql",
    "20261007125852_workspace_billing_slot_terminology.sql",
    "20261007130037_workspace_slot_free_period_terminology.sql",
    "20261008062440_workspace_slot_grants.sql",
    "20261008080835_workspace_bulk_slot_checkout.sql",
    "20261008115719_workspace_shared_free_credits.sql",
  ])
    await db.exec(
      readFileSync(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8"
      )
    );
  return db;
}

// Small transport adapter for testing the real service against real SQL RPCs.
// Only the three billing tables / billing RPCs are exposed; no auth or network DB.
export function billingFixtureFetch(db, fallback = globalThis.fetch) {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (url.origin !== "https://billing-fixture.invalid")
      return fallback(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const resource = url.pathname.split("/").at(-1);
    let result;
    try {
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        if (!/^workspace_billing_[a-z0-9_]+$/.test(resource))
          throw new Error("Unexpected fixture RPC");
        const args = JSON.parse(init?.body ?? "{}");
        const entries = Object.entries(args);
        if (entries.some(([k]) => !/^p_[a-z_]+$/.test(k)))
          throw new Error("Invalid fixture argument");
        const sql = `select public.${resource}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) result`;
        result = (
          await db.query(
            sql,
            entries.map(([, value]) =>
              typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : value
            )
          )
        ).rows[0].result;
      } else {
        if (
          ![
            "company_workspace",
            "company_workspace_slots",
            "company_workspace_credit_periods",
          ].includes(resource)
        )
          throw new Error("Unexpected fixture table");
        const columns = url.searchParams.get("select") || "*";
        if (!/^[a-z_,*]+$/.test(columns))
          throw new Error("Invalid fixture projection");
        const where = [],
          values = [];
        for (const [key, value] of url.searchParams) {
          if (["select", "limit", "order"].includes(key)) continue;
          if (!/^[a-z_]+$/.test(key)) throw new Error("Invalid fixture column");
          if (value === "not.is.null") {
            where.push(`${key} is not null`);
            continue;
          }
          const match = /^(eq|lte|gt)\.(.*)$/.exec(value);
          if (!match) throw new Error(`Unsupported fixture filter ${value}`);
          values.push(match[2]);
          where.push(
            `${key} ${{ eq: "=", lte: "<=", gt: ">" }[match[1]]} $${values.length}`
          );
        }
        result = (
          await db.query(
            `select ${columns} from public.${resource}${where.length ? " where " + where.join(" and ") : ""}`,
            values
          )
        ).rows;
        if (
          headers.get("accept")?.includes("application/vnd.pgrst.object+json")
        ) {
          if (result.length > 1)
            throw new Error("Multiple fixture rows for single request");
          result = result[0] ?? null;
        }
      }
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          message: error.message,
          code: error.code ?? "FIXTURE",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
  };
}
