import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { continuedSourcesOf, formatPreviousConclusions } from "./conclusions";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const owner = id(1), other = id(2), schedule = id(10), otherSchedule = id(11);

test("a reservation's next run reads what its latest earlier run concluded", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table opportunity_discovery_run(id uuid primary key, talent_id uuid, trigger_payload jsonb, coverage jsonb,
      created_at timestamptz default now());
  `);
  await db.exec(await readFile("supabase/migrations/20261119220000_career_run_conclusions.sql", "utf8"));
  const events = (scheduleId: string) => JSON.stringify({ sourceEvents: [{ sourceKind: "schedule", sourceId: scheduleId, revision: 1 }] });
  for (const [run, talent, scheduleId] of [[id(20), owner, schedule], [id(21), owner, schedule], [id(22), owner, otherSchedule],
    [id(23), other, schedule], [id(24), owner, schedule]] as const)
    await db.query("insert into opportunity_discovery_run(id, talent_id, trigger_payload, coverage) values ($1, $2, $3, '{\"sourceEventsFinishedAt\":\"x\"}')",
      [run, talent, events(scheduleId)]);
  const record = (run: string, talent: string, text: string) =>
    db.query("select public.record_career_run_conclusion_v1($1, $2, $3)", [talent, run, text]);
  await record(id(20), owner, "첫 확인: 새 공고 없음, 알리지 않음");
  await record(id(21), owner, "두 번째 확인: A사 공고 1건, 메일로 알림");
  await record(id(22), owner, "다른 예약의 결론");
  await record(id(23), other, "다른 사용자의 결론");
  await record(id(21), other, "남의 실행에는 쓰이지 않는다");
  await record(id(24), owner, "   ");
  const coverage = (await db.query<{ coverage: any }>("select coverage from opportunity_discovery_run where id = $1", [id(21)])).rows[0].coverage;
  assert.equal(coverage.sourceEventsFinishedAt, "x");
  assert.equal(coverage.conclusion.text, "두 번째 확인: A사 공고 1건, 메일로 알림");
  const sources = (...ids: string[]) => JSON.stringify(ids.map(sourceId => ({ sourceKind: "schedule", sourceId })));
  const rows = (await db.query<any>("select * from public.read_career_source_conclusions_v1($1, $2, $3)",
    [owner, id(24), sources(schedule, otherSchedule)])).rows;
  assert.deepEqual(rows.map(row => [row.source_id, row.conclusion]).sort(), [
    [otherSchedule, "다른 예약의 결론"],
    [schedule, "두 번째 확인: A사 공고 1건, 메일로 알림"],
  ].sort());
  // The run being prepared never reads its own conclusion.
  const own = (await db.query<any>("select * from public.read_career_source_conclusions_v1($1, $2, $3)",
    [owner, id(21), sources(schedule)])).rows;
  assert.equal(own[0].conclusion, "첫 확인: 새 공고 없음, 알리지 않음");
  const text = formatPreviousConclusions(rows.filter(row => row.source_id === schedule));
  assert.match(text, /^Previous run for reservation .+, concluded \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(Asia\/Seoul\)/);
  assert.match(text, /A사 공고 1건/);
});

test("reservations and followed companies are the sources a run continues", () => {
  assert.deepEqual(continuedSourcesOf([{ sourceKind: "schedule", sourceId: schedule }, { sourceKind: "company_follow", sourceId: id(30) },
    { sourceKind: "schedule", sourceId: schedule }, { sourceKind: "agent_contact", sourceId: id(31) }]),
    [{ sourceKind: "schedule", sourceId: schedule }, { sourceKind: "company_follow", sourceId: id(30) }]);
  assert.deepEqual(continuedSourcesOf(undefined), []);
});
