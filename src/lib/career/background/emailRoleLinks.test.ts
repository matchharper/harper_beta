import assert from "node:assert/strict";
import test from "node:test";
import { unlinkUnavailableCareerRoles } from "./emailRoleLinks";
import { renderReplyEmail } from "@/lib/email/runtime/format";

const owned = "10000000-0000-4000-8000-000000000001";
const foreign = "10000000-0000-4000-8000-000000000002";
const missing = "10000000-0000-4000-8000-000000000003";
function database(failure?: "throw" | "error") {
  const queries: any[] = [];
  return { queries, admin: { from(table: string) {
    if (failure === "throw") throw new Error("lookup unavailable");
    const q: any = { select: () => q, eq: (key: string, value: string) => { queries.push([table, key, value]); return q; },
      in: async () => ({ error: failure === "error" ? { message: "lookup unavailable" } : null,
        data: (table === "company_roles" ? [owned, foreign] : [owned, missing]).map(role_id => ({ role_id })) }) };
    return q;
  } } as any };
}
test("only actual roles saved for this candidate remain linked; labels and other links survive", async () => {
  const { admin, queries } = database();
  const markdown = `안녕하세요.\n\n[**공고 A**](${owned}) · [공고 B](${foreign}) · [공고 C](https://matchharper.com/career/history?historyTab=new&id=${missing})\n\n[지원서](/career?formId=1) [원문](https://jobs.example/job)\n\n감사합니다.`;
  const body = await unlinkUnavailableCareerRoles({ markdown, admin, userId: "owner" });
  assert.equal(body, markdown.replace(`[공고 B](${foreign})`, "공고 B").replace(`[공고 C](https://matchharper.com/career/history?historyTab=new&id=${missing})`, "공고 C"));
  const rendered = renderReplyEmail(body);
  assert.match(rendered.html, new RegExp(`href="https://matchharper.com/career/history\\?historyTab=new&#x26;id=${owned}"`));
  assert.doesNotMatch(rendered.html + rendered.text, new RegExp(`${foreign}|${missing}`));
  assert.ok(queries.some(q => q[0] === "talent_opportunity_recommendation" && q[1] === "talent_id" && q[2] === "owner"));
});
test("reference links, autolinks and malformed role destinations cannot recreate broken hyperlinks", async () => {
  const href = `https://matchharper.com/career/history?id=${foreign}`;
  const markdown = `[공고][ref]\n\n[ref]: ${href}\n\n<${href}>\n\n${href}\n\n[${href}](${foreign})\n\n[잘못된 공고](/career/history?id=not-an-id)`;
  const body = await unlinkUnavailableCareerRoles({ markdown, admin: database().admin, userId: "owner" });
  const rendered = renderReplyEmail(body);
  assert.doesNotMatch(rendered.html, /<a\b/);
  assert.ok(rendered.text.includes("공고"));
  assert.ok(rendered.text.includes(href));
  assert.ok(rendered.text.includes("잘못된 공고"));
});
test("escaped autolinks without source positions are unlinked and public posting URLs remain intact", async () => {
  const markdown = `https&#58;//matchharper&#46;com/career/history?id=${foreign}\n\n[공개 공고](https://matchharper.com/jobs/real-public-slug)`;
  const body = await unlinkUnavailableCareerRoles({ markdown, admin: database().admin, userId: "owner" });
  const rendered = renderReplyEmail(body);
  assert.doesNotMatch(rendered.html, /<a[^>]+career\/history/);
  assert.match(rendered.html, /href="https:\/\/matchharper.com\/jobs\/real-public-slug"/);
  assert.ok(rendered.text.includes(`https://matchharper.com/career/history?id=${foreign}`));
});
for (const failure of ["throw", "error"] as const) test(`lookup ${failure} unlinks roles without rejecting or rewriting the message`, async () => {
  const body = await unlinkUnavailableCareerRoles({ markdown: `추천입니다. [공고](${owned})\n\n감사합니다.`, admin: database(failure).admin, userId: "owner" });
  assert.equal(body, "추천입니다. 공고\n\n감사합니다.");
  assert.doesNotMatch(renderReplyEmail(body).html, /<a\b/);
});
