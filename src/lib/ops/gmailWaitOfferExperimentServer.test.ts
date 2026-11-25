import assert from "node:assert/strict";
import test from "node:test";
import { GMAIL_CONNECTION_CONFIRMED_EVENT, GMAIL_WAIT_OFFER_EXPOSURE_EVENT } from "@/lib/career/gmailWaitOfferExperiment";
import { fetchGmailWaitOfferExperimentRows } from "./gmailWaitOfferExperimentServer";

/** Answers each table from fixed rows, applying eq/in/gte/lte filters and range paging like PostgREST. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const reads: { table: string; from: number }[] = [];
  const from = (table: string) => {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
      gte: (column: string, value: string) => { filters.push((row) => String(row[column]) >= value); return chain; },
      lte: (column: string, value: string) => { filters.push((row) => String(row[column]) <= value); return chain; },
      range: async (start: number, end: number) => {
        reads.push({ table, from: start });
        return { data: (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row))).slice(start, end + 1), error: null };
      },
    };
    return chain;
  };
  return { admin: { from } as any, reads };
}

const START = "2026-11-23T00:00:00Z";
const END = "2026-11-25T00:00:00Z";

test("reads what exposed people did: confirmed connections, finished applications and the person's own moves", async () => {
  const op = (kind: string, created_at: string, extra: Record<string, unknown>) => ({ kind, "request->>execution_environment": "production",
    user_id: "u", created_at, updated_at: created_at, ...extra });
  const { admin } = fakeAdmin({
    logs: [
      // Exposures before the range still come back, so the builder can tell who was first seen earlier.
      { type: GMAIL_WAIT_OFFER_EXPOSURE_EVENT, user_id: "old", created_at: "2026-11-20T00:00:00Z", meta_data: {} },
      { type: GMAIL_WAIT_OFFER_EXPOSURE_EVENT, user_id: "u", created_at: "2026-11-24T00:00:00Z", meta_data: {} },
      { type: GMAIL_CONNECTION_CONFIRMED_EVENT, user_id: "u", created_at: "2026-11-24T01:00:00Z" },
      // The app's own log is not the measure.
      { type: "career_gmail_connect_succeeded", user_id: "u", created_at: "2026-11-24T01:00:01Z" },
      { type: "career_click_mobile_history_external_apply_directly", user_id: "u", created_at: "2026-11-24T01:30:00Z" },
    ],
    talent_external_operations: [
      op("browser_run", "2026-11-24T03:00:00Z", { mode: "execute", submitted: "YES" }),
      op("browser_run", "2026-11-24T04:00:00Z", { mode: "prepare", submitted: "no" }),
      { ...op("browser_run", "2026-11-24T05:00:00Z", { mode: "execute", submitted: "yes" }), "request->>execution_environment": "development:x" },
      op("email_send", "2026-11-24T06:00:00Z", { status: "succeeded", action: "send" }),
      // A reply to a company's mail, or a mail that did not go out, is not an application.
      op("email_send", "2026-11-24T07:00:00Z", { status: "succeeded", action: "reply" }),
      op("email_send", "2026-11-24T08:00:00Z", { status: "failed", action: "send" }),
    ],
    talent_messages: [
      { message_type: "chat", role: "user", user_id: "u", created_at: "2026-11-24T00:10:00Z" },
      { message_type: "chat", role: "assistant", user_id: "u", created_at: "2026-11-24T00:11:00Z" },
      { message_type: "career_form_response", role: "user", user_id: "u", created_at: "2026-11-24T00:30:00Z" },
      { message_type: "career_form", role: "assistant", user_id: "u", created_at: "2026-11-24T00:20:00Z" },
    ],
  });
  const { exposures, outcomes } = await fetchGmailWaitOfferExperimentRows(admin, START, END);
  assert.deepEqual(exposures.map((row) => row.user_id), ["old", "u"]);
  assert.deepEqual(outcomes.connections.map((event) => event.at), ["2026-11-24T01:00:00Z"]);
  assert.deepEqual(outcomes.completions.map((event) => event.at).sort(), ["2026-11-24T03:00:00Z", "2026-11-24T06:00:00Z"]);
  assert.deepEqual(outcomes.actions.map((event) => event.at).sort(),
    ["2026-11-24T00:10:00Z", "2026-11-24T00:30:00Z", "2026-11-24T01:30:00Z", "2026-11-24T03:00:00Z"]);
});

test("pages through more than one page of exposures and reads nothing more when no one is in range", async () => {
  const many = Array.from({ length: 1001 }, (_, index) => ({ type: GMAIL_WAIT_OFFER_EXPOSURE_EVENT, user_id: "old",
    created_at: "2026-11-20T00:00:00Z", meta_data: {}, index }));
  const { admin, reads } = fakeAdmin({ logs: many });
  const rows = await fetchGmailWaitOfferExperimentRows(admin, START, END);
  assert.equal(rows.exposures.length, 1001);
  // Two pages of exposures; no one was first seen in range, so no outcome reads.
  assert.deepEqual(reads, [{ table: "logs", from: 0 }, { table: "logs", from: 1000 }]);
});
