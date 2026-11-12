import assert from "node:assert/strict";
import test from "node:test";
import { receiveCareerReply } from "./careerReplyStream";

test("admission resolves before text, split UTF-8 frames preserve text, and final delivery settles once", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "content-type": "text/event-stream" } });
  const encoder = new TextEncoder();
  const messages: Array<[unknown, boolean]> = [];
  let settled = 0;
  const admission = receiveCareerReply(response, { onMessage: (message, live) => messages.push([message, live]), onSettled: () => { settled++; } });
  controller.enqueue(encoder.encode('event: admitted\ndata: {"userMessage":{"id":1}}\n\n'));
  assert.deepEqual(await admission, { userMessage: { id: 1 } });
  assert.equal(settled, 0);
  const bytes = encoder.encode('event: activity\ndata: {"message":{"id":"live:reply","content":"안녕 hello "}}\n\nevent: message\ndata: {"message":{"id":2,"content":"안녕 hello!"}}\n\n');
  for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  controller.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages, [[{ id: "live:reply", content: "안녕 hello " }, true], [{ id: 2, content: "안녕 hello!" }, false]]);
  assert.equal(settled, 1);
});

test("a lost stream after admission is not a failed input or a request to retry", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "content-type": "text/event-stream" } });
  let settled = 0;
  const admission = receiveCareerReply(response, { onMessage: () => {}, onSettled: () => { settled++; } });
  controller.enqueue(new TextEncoder().encode('event: admitted\ndata: {"userMessage":{"id":1}}\n\n'));
  await admission;
  controller.error(new Error("connection lost"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, 1);
  assert.deepEqual(await admission, { userMessage: { id: 1 } });
});
