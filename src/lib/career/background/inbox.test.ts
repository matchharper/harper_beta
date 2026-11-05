import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareCareerInboxContext,
  CAREER_INTERVIEW_EMAIL_QUERY,
} from "./inbox";
import { normalizeGmailSearchResponse } from "@/lib/integrations/gmail";

test("default discovery preserves requested query and paging; linked threads bypass subject/sent filters", async () => {
  const calls: any[] = [];
  const appointment: any = {
    id: "meeting-1",
    version: 2,
    status: "cancelled",
    title: "Interview",
    role_id: null,
    scheduling_source: "external",
    timezone: "Asia/Seoul",
    source_refs: { gmailThreadIds: ["thread-1"] },
  };
  const result = await prepareCareerInboxContext(
    {
      admin: {} as any,
      userId: "owner",
      run: {
        trigger_payload: {
          sourceEvents: [{ targetRefs: { meetingScheduleIds: ["meeting-1"] } }],
        },
      } as any,
    },
    {
      search: async (args) => {
        calls.push(args);
        return {
          status: "ok",
          emails: args.threadId
            ? [
                {
                  messageId: "reply",
                  threadId: "thread-1",
                  subject: "Re: Tuesday",
                  from: "me@example.test",
                  to: null,
                  cc: null,
                  receivedAt: "2026-11-02T00:00Z",
                  snippet: "Cancelled",
                  content: "Let us cancel Tuesday.",
                },
              ]
            : [],
          truncated: !args.threadId,
          nextPageToken: args.threadId ? null : "next-page",
          assistantInstruction: "Only returned messages were read.",
        };
      },
      readSchedules: async (args) => ({
        schedules: args.scheduleId ? [appointment] : [],
        nextOffset: null,
      }),
    }
  );
  assert.equal(calls[0].query, CAREER_INTERVIEW_EMAIL_QUERY);
  assert.equal(calls[0].includeContent, false);
  assert.equal(calls[1].threadId, "thread-1");
  assert.equal(calls[1].query, "");
  assert.match(result.text, /Older matching email remains/);
  assert.match(result.text, /cancel Tuesday/);
  assert.match(result.text, /cancelled/);
  assert.deepEqual(result.meetingScheduleVersions, { "meeting-1": 2 });
});

test("failed mailbox preparation remains unknown rather than empty evidence", async () => {
  const result = await prepareCareerInboxContext(
    { admin: {} as any, userId: "owner", run: { trigger_payload: {} } } as any,
    {
      search: async () => {
        throw new Error("unavailable");
      },
      readSchedules: async () => ({ schedules: [], nextOffset: null }),
    }
  );
  assert.match(result.text, /retrieval failed/);
  assert.doesNotMatch(result.text, /No matching messages/);
});

test("exact thread MIME bodies preserve source links and separate sent replies", () => {
  const result = normalizeGmailSearchResponse({
    includeContent: true,
    maxResults: 500,
    response: {
      data: {
        messages: [
          {
            id: "invite",
            threadId: "thread",
            body: {},
            payload: {
              mimeType: "text/html",
              body: {
                data: Buffer.from(
                  '<p>Meet <a href="https://meet.example.test/join">here</a></p>'
                ).toString("base64url"),
              },
              headers: [{ name: "Subject", value: "Interview invitation" }],
            },
          },
          {
            id: "reply",
            threadId: "thread",
            labelIds: ["SENT"],
            payload: {
              mimeType: "multipart/alternative",
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: Buffer.from("Tuesday works.").toString("base64url"),
                  },
                },
                {
                  mimeType: "text/html",
                  body: {
                    data: Buffer.from("<b>Tuesday works.</b>").toString(
                      "base64url"
                    ),
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  assert.equal(result.emails.length, 2);
  assert.match(result.emails[0].content!, /https:\/\/meet.example.test\/join/);
  assert.equal(result.emails[1].content, "Tuesday works.");
});

test("unreferenced upcoming appointments are rendered, not only stored in the version fence", async () => {
  const result = await prepareCareerInboxContext({admin:{} as any,userId:"owner",run:{trigger_payload:{}}} as any, {
    search: async () => { throw Error("no integration"); },
    readSchedules: async () => ({schedules:[{id:"today",version:3,title:"Today's interview",status:"confirmed",timezone:"Asia/Seoul",confirmed_start_at:"2030-01-10T06:00:00Z"}] as any,nextOffset:null}),
  });
  assert.ok(result.text.includes("Today's interview"));
  assert.ok(result.text.includes("2030-01-10 15:00"));
  assert.deepEqual(result.meetingScheduleVersions,{today:3});
});
