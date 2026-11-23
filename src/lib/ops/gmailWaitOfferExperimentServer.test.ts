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

test("reads what exposed people did: server-confirmed connections, submissions, code stops, review forms and their answers", async () => {
  const run = (updated_at: string, extra: Record<string, unknown>) => ({ kind: "browser_run", "request->>execution_environment": "production",
    user_id: "u", created_at: updated_at, updated_at, ...extra });
  const { admin } = fakeAdmin({
    logs: [
      // Exposures before the range still come back, so the builder can tell who was first seen earlier.
      { type: GMAIL_WAIT_OFFER_EXPOSURE_EVENT, user_id: "old", created_at: "2026-11-20T00:00:00Z", meta_data: {} },
      { type: GMAIL_WAIT_OFFER_EXPOSURE_EVENT, user_id: "u", created_at: "2026-11-24T00:00:00Z", meta_data: {} },
      { type: GMAIL_CONNECTION_CONFIRMED_EVENT, user_id: "u", created_at: "2026-11-24T01:00:00Z" },
      // The app's own log is not the measure.
      { type: "career_gmail_connect_succeeded", user_id: "u", created_at: "2026-11-24T01:00:01Z" },
    ],
    talent_external_operations: [
      run("2026-11-24T03:00:00Z", { submitted: "YES", verificationCode: "none" }),
      run("2026-11-24T04:00:00Z", { submitted: "no", verificationCode: "email" }),
      { ...run("2026-11-24T05:00:00Z", { submitted: "yes" }), "request->>execution_environment": "development:x" },
    ],
    talent_messages: [
      { message_type: "career_form", user_id: "u", created_at: "2026-11-24T00:10:00Z", form_id: "10", related_refs: [{ type: "browser_session", id: "s" }] },
      { message_type: "career_form", user_id: "u", created_at: "2026-11-24T00:20:00Z", form_id: "11", related_refs: [{ type: "document", id: "d" }] },
      { message_type: "career_form_response", user_id: "u", created_at: "2026-11-24T00:30:00Z", form_id: "10", responses: null },
      { message_type: "career_form_response", user_id: "u", created_at: "2026-11-24T00:40:00Z", form_id: null, responses: [{ formId: "12" }, { formId: 13 }] },
    ],
  });
  const { exposures, outcomes } = await fetchGmailWaitOfferExperimentRows(admin, START, END);
  assert.deepEqual(exposures.map((row) => row.user_id), ["old", "u"]);
  assert.deepEqual(outcomes.connections.map((event) => event.at), ["2026-11-24T01:00:00Z"]);
  assert.deepEqual(outcomes.submissions.map((event) => event.at), ["2026-11-24T03:00:00Z"]);
  assert.deepEqual(outcomes.emailCodeStops.map((event) => event.at), ["2026-11-24T04:00:00Z"]);
  assert.deepEqual(outcomes.reviewForms.map((form) => form.formId), ["10"]);
  assert.deepEqual(outcomes.formAnswers.map((answer) => answer.formIds), [["10"], ["12", "13"]]);
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
