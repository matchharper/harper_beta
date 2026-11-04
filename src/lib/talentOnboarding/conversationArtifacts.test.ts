import test from "node:test";
import assert from "node:assert/strict";
import { fetchRecentMessagesWithSummary } from "./conversationSummary";
import { formatTalentMessageContentForLlmPrompt, formatTalentConversationReferencesForLlm } from "@/lib/career/opportunityFeedbackNote";

// Cards persist their content in payload, while chat prose uses content.
// Both history readers must preserve what the candidate actually saw.
for (const withSummary of [false, true]) {
  test(`conversation retains empty-prose artifacts ${withSummary ? "after compaction" : "without a summary"}`, async () => {
    const rows = [
      { id: 11, role: "assistant", message_type: "career_form", content: "", payload: {
        formId: 11, revision: 1, kind: "form", title: "Review", items: [],
        positive: { id: "continue", label: "Continue", message: "Use my reviewed changes." },
      } },
      { id: 12, role: "assistant", message_type: "browser_session", content: "", payload: { session_id: "owned-session" } },
      { id: 13, role: "assistant", message_type: "chat", content: "Ready to review.", payload: null },
      { id: 14, role: "assistant", message_type: "career_form", content: "", payload: { hidden: true } },
    ];
    const admin: any = { from(table: string) {
      let data: Record<string, unknown>[] = table === "talent_conversation_summaries"
        ? (withSummary ? [{ to_message_id: 10, segment_summary: "Earlier work", summary_text: "Earlier work", created_at: "2026-10-30T00:00:00Z" }] : [])
        : [...rows];
      const query: any = {
        select: () => query, eq: () => query, gt: () => query, or: () => query,
        neq: (key: string, value: unknown) => { data = data.filter((row: any) => row[key] !== value); return query; },
        order: (key: string, options: { ascending: boolean }) => {
          if (key === "id") data.sort((a: any, b: any) => options.ascending ? a.id - b.id : b.id - a.id);
          return query;
        },
        limit: () => query,
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    } };
    const messages = await fetchRecentMessagesWithSummary({ admin, userId: "user", conversationId: "conversation" });
    assert.deepEqual(messages.filter(row => row.id > 10).map(row => row.id), [11, 12, 13]);
    const rendered = messages.map(row => formatTalentMessageContentForLlmPrompt(row)).join("\n");
    assert.match(rendered, /Ready to review/);
    assert.doesNotMatch(rendered, /Form 11|Saved form|Use my reviewed changes|owned-session/);
    const references = formatTalentConversationReferencesForLlm(messages);
    assert.match(references, /Form 11, revision 1/);
    assert.match(references, /Use my reviewed changes/);
    assert.match(references, /Browser session: owned-session/);
  });
}
