import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { RecallMeetClient, recallBotBody, googleMeetUrl, calendarInvitation } from "../src/lib/career/meet/providers";

test("meeting URL validation cannot send a bot to a substituted host", () => {
  assert.equal(googleMeetUrl("https://meet.google.com/abc-defg-hij?authuser=1"), "https://meet.google.com/abc-defg-hij");
  for (const url of ["https://meet.google.com.evil.test/abc-defg-hij", "http://meet.google.com/abc-defg-hij", "https://meet.google.com/lookup/test"]) assert.throws(() => googleMeetUrl(url));
});

test("bot receives only an expiring transport URL, with no model or profile credentials", () => {
  const body = recallBotBody("https://meet.google.com/abc-defg-hij", "https://pilot.example/#token=opaque", "group-1");
  assert.equal(body.output_media.camera.config.url, "https://pilot.example/#token=opaque");
  assert.equal(body.recording_config, null);
  assert.deepEqual(body.google_meet, { google_login_group_id: "group-1" });
  assert.equal(body.bot_name, "Harper");
});

test("uncertain bot creation is not retried and credential values are not in errors", async () => {
  let count = 0;
  const request = async () => { count++; return new Response("secret-provider-diagnostic", { status: 503 }); };
  const client = new RecallMeetClient("secret-key", "ap-northeast-1", request as typeof fetch);
  await assert.rejects(client.create(recallBotBody("https://meet.google.com/abc-defg-hij", "https://pilot.example")), error => {
    assert.equal(String(error).includes("secret"), false); return true;
  });
  assert.equal(count, 1);
});

test("Calendar retries retain event identity and invite only the intended recipient", () => {
  const args = { runId: "one-run", email: "fixture@example.com", startAt: new Date("2026-10-26T12:00:00Z"), durationMinutes: 10, timeZone: "Asia/Seoul" };
  const event = calendarInvitation(args);
  assert.equal(event.id, calendarInvitation(args).id);
  assert.notEqual(event.id, calendarInvitation({ ...args, runId: "another-run" }).id);
  assert.deepEqual(event.attendees, [{ email: args.email }]);
  assert.equal(event.end.dateTime, "2026-10-26T12:10:00.000Z");
  assert.equal(event.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
});

test("cleanup accepts a verified auto-exit but preserves a failure for an active bot", async () => {
  for (const status of ["done", "in_call_not_recording"]) {
    const request = async (_url: unknown, init?: RequestInit) => init?.method === "POST"
      ? new Response("", { status: 400 })
      : Response.json({ status_changes: [{ code: status }] });
    const client = new RecallMeetClient("test", "ap-northeast-1", request as typeof fetch);
    if (status === "done") await client.leave("bot-1");
    else await assert.rejects(client.leave("bot-1"));
  }
});

test("capture worklet batches continuous mono little-endian PCM without echo output", () => {
  let Processor: any;
  const frames: ArrayBuffer[] = [];
  class AudioWorkletProcessor { port = { postMessage: (data: ArrayBuffer) => frames.push(data) }; }
  vm.runInNewContext(readFileSync("scripts/meet-pilot/capture.worklet.js", "utf8"), {
    AudioWorkletProcessor, registerProcessor: (_name: string, value: any) => { Processor = value; }, Int16Array, ArrayBuffer, DataView, Math,
  });
  const processor = new Processor();
  for (let i = 0; i < 15; i++) processor.process([[new Float32Array(128).fill(0.5), new Float32Array(128).fill(-0.5)]]);
  assert.equal(frames.length, 4);
  assert.equal(frames.every(frame => frame.byteLength === 960), true);
  assert.equal(frames.every(frame => new Uint8Array(frame).every(value => value === 0)), true);
  for (let i = 0; i < 4; i++) processor.process([[new Float32Array(128).fill(-1)]]);
  assert.equal(new DataView(frames[4]).getInt16(0, true), -32768);
});
