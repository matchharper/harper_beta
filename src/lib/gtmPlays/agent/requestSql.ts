/**
 * The job-page request's own queries (agent/request.server.ts): writing a request against the rate limits, and the
 * tick's claim of a request due now. Apart from the server-only module so a test can run them on an in-memory Postgres
 * (requestSql.test.ts).
 */
import type { GtmWriteSql } from "../db.server";
import { REQUEST_LEASE_MS, REQUEST_SOURCE, requestRateLimit, type NewRequestRow } from "./request";

const AGENT = "agent";

export type AcceptedRequest =
  | { status: "accepted"; personId: string }
  | { status: "rate_limited"; personId: string; limit: "email_recent" | "email_daily" | "ip" };

/**
 * In one transaction: a lock on the address and one on the IP (two requests at once are counted one after the other),
 * the row written (found, its lease REQUEST_LEASE_MS ahead: the route's run holds it), then counted against the rate
 * limits (agent/request.ts REQUEST_RATE_LIMITS) with every request of the last 24 hours. Over a limit the row stays as
 * the marker the next requests count (skipped, rate_limit, never mailed, its CV text not kept): toward the IP limit
 * only.
 */
export async function acceptRequestQuery(sql: GtmWriteSql, row: NewRequestRow): Promise<AcceptedRequest> {
  const ipHash = row.request.ipHash;
  await sql`select pg_advisory_xact_lock(hashtextextended(${`gtm_job_page_request:email:${row.email}`}::text, 0))`;
  if (ipHash) await sql`select pg_advisory_xact_lock(hashtextextended(${`gtm_job_page_request:ip:${ipHash}`}::text, 0))`;
  const events = [{ at: new Date().toISOString(), kind: "found", by: AGENT, note: row.foundNote }];
  const [inserted] = await sql<Array<{ id: string }>>`
    insert into public.gtm_agent_people (
      run_id, source, method, person_key, profile_url, profile_text, signal_text, signal_at, email, email_source, is_test,
      language, status, events, request, retry_at
    ) values (
      null, ${REQUEST_SOURCE}, 'request', ${row.personKey}, ${row.profileUrl}, ${row.profileText}, ${row.signalText},
      ${row.signalAt}::timestamptz, ${row.email}, 'self', ${row.isTest}, ${row.language}, 'found', ${sql.json(events)}::jsonb,
      ${sql.json(row.request as never)}::jsonb, now() + make_interval(secs => ${REQUEST_LEASE_MS / 1000}::int)
    )
    returning id::text as id
  `;
  const [counts] = await sql<Array<{ email10m: number; email_day: number; ip1h: number }>>`
    select
      count(*) filter (where lower(p.email) = ${row.email}::text and p.created_at > now() - interval '10 minutes'
        and not coalesce((p.request ->> 'rateLimited')::boolean, false))::int as email10m,
      count(*) filter (where lower(p.email) = ${row.email}::text
        and not coalesce((p.request ->> 'rateLimited')::boolean, false))::int as email_day,
      count(*) filter (where ${ipHash}::text is not null and p.request ->> 'ipHash' = ${ipHash}::text
        and p.created_at > now() - interval '1 hour')::int as ip1h
    from public.gtm_agent_people p
    where p.method = 'request' and p.created_at > now() - interval '24 hours'
  `;
  const limit = requestRateLimit({ email10m: Number(counts?.email10m ?? 0), emailDay: Number(counts?.email_day ?? 0), ip1h: Number(counts?.ip1h ?? 0) });
  if (!limit) return { status: "accepted", personId: inserted.id };
  const note = `요청이 너무 잦아서 받지 않았어요 (${limit === "ip" ? "같은 IP 1시간" : limit === "email_recent" ? "같은 주소 10분" : "같은 주소 하루"})`;
  await sql`
    update public.gtm_agent_people set status = 'skipped', skip_reason = 'rate_limit', profile_text = null, retry_at = null,
      request = request || '{"rateLimited": true}'::jsonb,
      events = events || ${sql.json([{ at: new Date().toISOString(), kind: "skipped", by: AGENT, note }])}::jsonb, updated_at = now()
    where id = ${inserted.id}::uuid
  `;
  return { status: "rate_limited", personId: inserted.id, limit };
}

/**
 * The request due longest ago (a run that never finished: its lease ran out; a hold or a wait that ended), any day of
 * the week, its lease written; null when none is due. Rows another tick is claiming are skipped, not waited for.
 */
export async function claimDueRequestQuery(sql: GtmWriteSql): Promise<string | null> {
  const [row] = await sql<Array<{ id: string }>>`
    with due as (
      select p.id from public.gtm_agent_people p
      where p.method = 'request' and p.status in ('found', 'matched', 'approved')
        and coalesce(p.retry_at, '-infinity'::timestamptz) <= now()
      order by p.retry_at nulls first, p.created_at
      limit 1
      for update skip locked
    )
    update public.gtm_agent_people p set retry_at = now() + make_interval(secs => ${REQUEST_LEASE_MS / 1000}::int)
    from due where p.id = due.id
    returning p.id::text as id
  `;
  return row?.id ?? null;
}
