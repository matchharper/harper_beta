import assert from "node:assert/strict";
import test from "node:test";
import { CAREER_BROWSER_SERVICE_TIER_HEADER } from "./browserServiceTier";
import { readCareerBrowserServiceTier, resolveCareerRequestBrowserServiceTier } from "./browserServiceTier.server";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

test("Priority is default; only authorized dev controls can select Standard", () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    const request = (value?: string) => new Request("http://localhost/api/talent/chat", {
      headers: value ? { [CAREER_BROWSER_SERVICE_TIER_HEADER]: value } : {},
    });
    const dev = { email: "dev@matchharper.com" };
    assert.equal(resolveCareerRequestBrowserServiceTier(request(), dev), "priority");
    assert.equal(resolveCareerRequestBrowserServiceTier(request("default"), dev), "default");
    assert.equal(resolveCareerRequestBrowserServiceTier(request("priority"), dev), "priority");
    assert.equal(resolveCareerRequestBrowserServiceTier(request("invalid"), dev), "priority");
    assert.equal(resolveCareerRequestBrowserServiceTier(request("default"), { email: "user@example.com" }), "priority");
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});

test("continuations use the owned conversation selection at their source turn, not a newer turn", async () => {
  const rows = [
    { id: 10, user_id: "owner", conversation_id: "chat", role: "user", payload: { careerBrowserServiceTier: "default" } },
    { id: 11, user_id: "owner", conversation_id: "chat", role: "user", payload: { formId: 1 } },
    { id: 12, user_id: "owner", conversation_id: "chat", role: "user", payload: { careerBrowserServiceTier: "priority" } },
    { id: 13, user_id: "other", conversation_id: "chat", role: "user", payload: { careerBrowserServiceTier: "default" } },
    { id: 14, user_id: "owner", conversation_id: "other-chat", role: "user", payload: { careerBrowserServiceTier: "default" } },
  ];
  const admin = { from(table: string) {
    assert.equal(table, "talent_messages");
    let selected = [...rows];
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { selected = selected.filter(row => row[key as "user_id"] === value); return query; },
      not: () => { selected = selected.filter(row => row.payload.careerBrowserServiceTier != null); return query; },
      lte: (_key: string, id: number) => { selected = selected.filter(row => row.id <= id); return query; },
      order: () => { selected.sort((a, b) => b.id - a.id); return query; },
      limit: () => query,
      maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
    };
    return query;
  } } as unknown as TalentAdminClient;
  const scope = { admin, userId: "owner", conversationId: "chat" };
  assert.equal(await readCareerBrowserServiceTier({ ...scope, userMessageId: 10 }), "default");
  assert.equal(await readCareerBrowserServiceTier({ ...scope, userMessageId: 11 }), "default");
  assert.equal(await readCareerBrowserServiceTier(scope), "priority");
  assert.equal(await readCareerBrowserServiceTier({ ...scope, userMessageId: 9 }), "priority");
});
