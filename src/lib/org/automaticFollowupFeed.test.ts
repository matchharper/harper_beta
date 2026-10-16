import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { automaticFollowupFeed } from "./automaticFollowupFeed";
import { getHarperProgressText } from "@/components/org/harperProgressPresentation";

const rows = [3, 9, 18].map((days) => ({
  id: `followup-${days}`,
  source_kind: "intro",
  source_id: "intro-1",
  role_id: "role-1",
  created_at: "2026-10-15T09:57:37Z",
  idempotency_key: `initial:intro:intro-1:${days}`,
}));

test("one Intro guide comes from schedules even without progress events", () => {
  const feed = automaticFollowupFeed(rows);
  assert.equal(feed.introGuides.length, 1);
  assert.equal(feed.introGuides[0].id, "intro-followup-guide:intro-1");
  for (const row of rows) {
    for (const eventType of ["scheduled", "date_anchored"]) {
      assert.equal(
        feed.showProgress({
          kind: "company_followup",
          metadata: { eventType, followupId: row.id },
        }),
        false
      );
    }
  }
  for (const eventType of [
    "cancelled",
    "rescheduled",
    "email_sent",
    "email_failed",
    "chat_delivered",
  ]) {
    assert.equal(
      feed.showProgress({
        kind: "company_followup",
        metadata: { eventType, followupId: rows[0].id },
      }),
      true
    );
  }
  assert.equal(
    feed.showProgress({
      kind: "company_followup",
      metadata: { eventType: "scheduled", followupId: "manual" },
    }),
    true
  );
  assert.equal(feed.showProgress({ kind: "org_note", metadata: {} }), true);
});

test("separate Intro requests have separate guides; company requests do not become Intro guides", () => {
  const feed = automaticFollowupFeed([
    ...rows,
    { ...rows[0], source_id: "intro-2", role_id: "role-2" },
    { ...rows[0], source_kind: "contact", source_id: "contact-1" },
  ]);
  assert.equal(feed.introGuides.length, 2);
  assert.equal(
    getHarperProgressText("company_intro_followup_policy", null, (ko) => ko),
    "회사의 Intro 요청에 대해서 응답하지 않을 때 Harper가 적절한 시점에 팔로업을 보냅니다."
  );
  assert.equal(
    getHarperProgressText(
      "company_intro_followup_policy",
      null,
      (_ko, en) => en
    ),
    "If the candidate does not respond to your Intro request, Harper follows up at an appropriate time."
  );
});

test("recording omits automatic setup while preserving explicit scheduling and delivery events", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table company_talent_followups(id uuid primary key,talent_id uuid,role_id uuid,recommendation_id uuid,updated_by uuid,created_by uuid,source_kind text,source_id uuid,due_at timestamptz,revision bigint,idempotency_key text,delay_days int);
      create table talent_progress(talent_id uuid,role_id uuid,recommendation_id uuid,company_user_id uuid,user_id text,kind text,text text,metadata jsonb);
      insert into company_talent_followups(id,source_kind,source_id,idempotency_key,delay_days)
      values('00000000-0000-4000-8000-000000000001','intro','00000000-0000-4000-8000-000000000002','initial:intro:00000000-0000-4000-8000-000000000002:3',3);`);
    await db.exec(
      readFileSync(
        new URL(
          "../../../supabase/migrations/20261016033233_omit_automatic_followup_progress.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    const record = (event: string) =>
      db.query(
        "select record_company_followup_event_v1('00000000-0000-4000-8000-000000000001',$1)",
        [event]
      );
    await record("scheduled");
    await record("date_anchored");
    assert.equal(
      (await db.query("select * from talent_progress")).rows.length,
      0
    );
    await db.exec(
      "update company_talent_followups set idempotency_key='explicit-request',delay_days=null"
    );
    for (const event of [
      "scheduled",
      "rescheduled",
      "cancelled",
      "chat_delivered",
      "email_sent",
      "email_failed",
    ])
      await record(event);
    assert.deepEqual(
      (
        await db.query(
          "select metadata->>'eventType' event from talent_progress"
        )
      ).rows.map((row) => row.event),
      [
        "scheduled",
        "rescheduled",
        "cancelled",
        "chat_delivered",
        "email_sent",
        "email_failed",
      ]
    );
    assert.equal(
      (await db.query("select * from company_talent_followups")).rows.length,
      1
    );
  } finally {
    await db.close();
  }
});
