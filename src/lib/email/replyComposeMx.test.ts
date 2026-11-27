import assert from "node:assert/strict";
import { test } from "node:test";
import { careerEmailChoiceHref } from "./choiceLinks";
import { clearReplyComposeMxCacheForTest, opensReplyComposeFor } from "./replyComposeMx";

process.env.EMAIL_REPLY_TOKEN_SECRET ||= "choice-link-test-secret";

const MX: Record<string, string[]> = {
  // Google Workspace, the shape measured 11/27 for school and company addresses whose options opened the web.
  "school.example": ["aspmx.l.google.com", "alt1.aspmx.l.google.com", "alt2.aspmx.l.google.com"],
  "company.example": ["smtp.google.com"],
  "naver.com": ["mx1.mail.naver.com", "mx4.mail.naver.com"],
  // A security gateway in front hides the mailbox behind it.
  "gateway.example": ["mxa-009b9c01.gslb.pphosted.com"],
  "mixed.example": ["aspmx.l.google.com", "mx.other-host.example"],
};

test("a school or company address hosted by Google opens a prefilled reply; others keep the web link", async () => {
  clearReplyComposeMxCacheForTest();
  const looked: string[] = [];
  const lookup = async (domain: string) => {
    looked.push(domain);
    const hosts = MX[domain];
    if (!hosts) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    return hosts;
  };
  assert.equal(await opensReplyComposeFor("a@gmail.com", { lookup }), true);
  assert.deepEqual(looked, [], "a known mailbox needs no lookup");
  assert.equal(await opensReplyComposeFor("Student <s@School.example>", { lookup }), true);
  assert.equal(await opensReplyComposeFor("a@company.example", { lookup }), true);
  assert.equal(await opensReplyComposeFor("a@naver.com", { lookup }), false);
  assert.equal(await opensReplyComposeFor("a@gateway.example", { lookup }), false);
  assert.equal(await opensReplyComposeFor("a@mixed.example", { lookup }), false);
  assert.equal(await opensReplyComposeFor("a@missing.example", { lookup }), false);
  assert.equal(await opensReplyComposeFor("", { lookup }), false);
  // Each domain is looked up once.
  assert.equal(await opensReplyComposeFor("other@school.example", { lookup }), true);
  assert.equal(looked.filter((domain) => domain === "school.example").length, 1);
});

test("a slow lookup keeps the web link", async () => {
  clearReplyComposeMxCacheForTest();
  const never = () => new Promise<string[]>(() => {});
  const started = Date.now();
  assert.equal(await opensReplyComposeFor("a@slow.example", { lookup: never }), false);
  assert.ok(Date.now() - started < 3000);
});

test("the looked-up answer decides where an option leads", () => {
  const choice = { label: "추천해 주세요", value: "추천해 주세요" };
  const args = { talentId: "11111111-1111-4111-8111-111111111111", recipient: "s@school.example", replyTo: "reply+abc@reply.matchharper.com", subject: "공고" };
  assert.match(careerEmailChoiceHref({ ...args, opensCompose: true })(choice), /^mailto:reply%2Babc@reply\.matchharper\.com\?/);
  assert.match(careerEmailChoiceHref({ ...args, opensCompose: false })(choice), /\/career\/chat\?/);
  // Without a looked-up answer it reads the address alone, as before.
  assert.match(careerEmailChoiceHref(args)(choice), /\/career\/chat\?/);
});
