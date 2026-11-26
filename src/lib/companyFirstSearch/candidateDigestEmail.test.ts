import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateDigestEmail,
  candidateCallName,
  candidateDigestSubject,
  englishArticle,
  leadCandidateText,
  otherCandidateLine,
} from "./candidateDigestEmail";

const web = (id: string) =>
  `https://matchharper.com/org/role?orgId=w1&roleId=r1&tab=pipeline&talentId=${id}&detailRoleId=r1&detailWorkspaceId=w1&source=email`;
const candidate = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  webUrl: web(id),
  roleName: "ML Engineer",
  actionUrls: {
    request_intro: `https://matchharper.com/email-action/${id}-request`,
    pass: `https://matchharper.com/email-action/${id}-pass`,
    accept_connection: `https://matchharper.com/email-action/${id}-accept`,
    reject_connection: `https://matchharper.com/email-action/${id}-reject`,
  },
  ...extra,
});
const accepted = {
  kind: "accepted_connection" as const,
  parts: [
    { candidateId: null, text: "만나보겠다고 한 후보예요." },
    {
      candidateId: "c1",
      text: `✅ [이서연](${web("c1")}) — 결제 시스템을 만들었어요.`,
    },
  ],
};
// The Worker's mail text: line 1 names and links the person, then the full description.
const person = (id: string, name: string, line: string, rest: string) => ({
  candidateId: id,
  text: `[${name}](${web(id)}): ${line}\n\n${rest}`,
});
const companyFirst = {
  kind: "company_first" as const,
  parts: [
    { candidateId: null, text: "먼저 연락해 볼 수 있는 후보예요." },
    person("c2", "김민준", "추천 모델 서빙", "김민준님은 토스에서 **ML** 서빙 플랫폼을 직접 만든 분이에요. 다만 출근 가능 여부는 확인해 봐야 해요."),
    person("c3", "박지훈", "추천 시스템 경험", "박지훈님은 당근에서 추천 시스템을 만든 분이에요."),
    person("c4", "최유나", "검색 랭킹", "최유나님은 네이버에서 검색 랭킹을 맡은 분이에요."),
    person("c5", "정다은", "데이터 파이프라인", "정다은님은 데이터 파이프라인을 만든 분이에요."),
  ],
};
const ids = ["c1", "c2", "c3", "c4", "c5"];
const build = (
  overrides: Partial<Parameters<typeof buildCandidateDigestEmail>[0]> = {}
) =>
  buildCandidateDigestEmail({
    locale: "ko",
    recipientName: "김지수",
    roleNames: ["ML Engineer"],
    // The Worker's row order must not decide the mail order.
    sections: [companyFirst],
    candidates: ids.map((id) => candidate(id)),
    workspaceId: "w1",
    ...overrides,
  });

test("subjects name the role and the lead's facts, never an internal list name", () => {
  const lead = candidate("c2", { company: "토스", years: 6.4, title: "ML Engineer" });
  const subject = (args: Partial<Parameters<typeof candidateDigestSubject>[0]>) =>
    candidateDigestSubject({ locale: "ko", roleNames: ["ML Engineer"], acceptedCount: 0, companyFirstCount: 3, lead, ...args });
  // No 현: a missing end date does not establish current employment. 전 only with an end date.
  assert.equal(subject({}), "ML Engineer에 딱 맞는 분 한 분 찾았어요 (토스, 경력 6년)");
  assert.equal(subject({ lead: { ...lead, ended: true } }), "ML Engineer에 딱 맞는 분 한 분 찾았어요 (전 토스, 경력 6년)");
  assert.equal(subject({ companyFirstCount: 1 }), "ML Engineer에 딱 맞는 분을 찾았어요 (토스, 경력 6년)");
  assert.equal(subject({ lead: { ...lead, company: null, years: 0.5 } }), "ML Engineer에 딱 맞는 분 한 분 찾았어요");
  assert.equal(subject({ acceptedCount: 2 }), "ML Engineer: 만나보겠다고 한 분이 2명 있어요");
  // People who already said yes are named under their own Roles, not the new lead's.
  assert.equal(
    subject({ acceptedCount: 1, acceptedRoleNames: ["Backend Engineer"] }),
    "Backend Engineer: 만나보겠다고 한 분이 1명 있어요"
  );
  assert.equal(
    subject({ locale: "en", acceptedCount: 2, acceptedRoleNames: ["Backend Engineer", "Data Engineer"] }),
    "Backend Engineer and 1 more role: 2 people said yes to talking"
  );
  // English: "[Name], a [hook]. Worth a look?", with an article so the title stays on the lead.
  const en = (extra: Record<string, unknown>, recipientName = "Dana Park") =>
    subject({ locale: "en", recipientName, lead: { ...lead, company: "Company B", ...extra } });
  assert.equal(en({ title: "AI Engineer" }), "Dana, an AI Engineer at Company B. Worth a look?");
  assert.equal(en({ title: "Senior Engineer", ended: true }), "Dana, a former Senior Engineer at Company B. Worth a look?");
  assert.equal(en({ title: null }), "Dana, someone from Company B. Worth a look?");
  assert.equal(en({ title: null, company: null }), "Dana, someone new for your ML Engineer role. Worth a look?");
  assert.equal(en({ title: "Product Designer" }, ""), "A Product Designer at Company B. Worth a look?");
  // A romanized name that starts with a Korean surname stays whole: never "Kim, an AI Engineer…".
  assert.equal(en({ title: "AI Engineer" }, "Kim Minji"), "Kim Minji, an AI Engineer at Company B. Worth a look?");
  assert.equal(subject({ locale: "en", acceptedCount: 1 }), "ML Engineer: 1 person said yes to talking");
  for (const value of [subject({}), subject({ locale: "en" })])
    assert.doesNotMatch(value, /Ready to reach out|연결을 요청할 후보|new in/);
});

test("the greeting calls a Latin name by its first word and a Hangul name whole", () => {
  assert.match(build({ recipientName: "Dana Park" }).text, /^Dana님 안녕하세요, Harper입니다\./);
  assert.match(build({ recipientName: "김지수" }).text, /^김지수님 안녕하세요, Harper입니다\./);
  assert.match(build({ locale: "en", recipientName: "Dana Park" }).text, /^Hi Dana,/);
  assert.match(build({ locale: "en", recipientName: "Kim Minji" }).text, /^Hi Kim Minji,/);
  assert.match(build({ recipientName: "Kim Minji" }).text, /^Kim Minji님 안녕하세요/);
});

test("the mail greets by name, opens with one person in full, two in one line, then see all", () => {
  const email = build({ totals: { company_first: 30 } });
  assert.match(email.text, /^김지수님 안녕하세요, Harper입니다\./);
  assert.match(email.text, /ML Engineer에 새로 4분 찾았는데, 이 분부터 보시면 좋겠어요\./);
  // Lead = the Worker's first person when nobody is rated: description with the linked name.
  assert.match(email.html, /<a [^>]*href="[^"]*talentId=c2[^"]*"[^>]*>김민준<\/a>님은 토스에서/);
  assert.match(email.html, /<strong>ML<\/strong>/);
  assert.doesNotMatch(email.text, /추천 모델 서빙/);
  // Two more in one line, the fourth only behind "see all".
  assert.match(email.text, /다른 두 분도 있어요\./);
  assert.ok(email.text.includes("추천 시스템 경험") && email.text.includes("검색 랭킹"));
  assert.ok(!email.text.includes("정다은") && !email.text.includes("당근에서"));
  assert.match(email.html, />전체 30명 보기<\/a>/);
  // "See all" opens the Role's 연결을 요청할 후보 list, the list the total counts.
  const seeAll = new URL(email.html.match(/href="([^"]*)"[^>]*>전체 30명 보기/)![1]!.replace(/&(?:amp|#x26);/g, "&"));
  assert.equal(seeAll.pathname, "/org/role");
  assert.deepEqual(Object.fromEntries(seeAll.searchParams), {
    orgId: "w1", roleId: "r1", tab: "inbox", inboxStage: "company_intro", source: "email",
  });
  assert.match(email.text, /만나보고 싶은 분이 있으면 제가 먼저 관심을 확인하고 연결해 드릴게요\.\n\nHarper 드림$/);
  // The Worker's intro gives way to the fixed opening line.
  assert.doesNotMatch(email.text, /먼저 연락해 볼 수 있는 후보예요/);
});

test("only the lead carries the two links; the others link to their web card", () => {
  const email = build();
  assert.deepEqual(
    [...email.html.matchAll(/email-action\/(c\d-\w+)/g)].map((m) => m[1]),
    ["c2-request", "c2-pass"]
  );
  // Only the people with links are reported, so only their links are stored as shown.
  assert.deepEqual(email.actionCandidateIds, ["c2"]);
  assert.deepEqual(build({ sections: [companyFirst, accepted] }).actionCandidateIds, ["c1", "c2"]);
  assert.match(email.html, /href="[^"]*talentId=c3[^"]*"[^>]*>박지훈<\/a>/);
  assert.ok(!email.html.includes("HARPERDIGEST") && !email.text.includes("HARPERDIGEST"));
});

test("the mail reads like one a person wrote: plain paragraphs and text links, no box or button", () => {
  const email = build();
  // Under the lead's paragraph: ask by name, say a reply works, then the two links.
  assert.match(
    email.html,
    /<p[^>]*>김민준님을 만나보시겠어요\? 이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요: <a href="https:\/\/matchharper\.com\/email-action\/c2-request"[^>]*>연결 요청<\/a> \/ <a href="https:\/\/matchharper\.com\/email-action\/c2-pass"[^>]*>이번엔 넘길게요<\/a><\/p>/
  );
  assert.match(
    email.text,
    /다만 출근 가능 여부는 확인해 봐야 해요\.\n\n김민준님을 만나보시겠어요\? 이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요: 연결 요청 \(https:\/\/matchharper\.com\/email-action\/c2-request\) \/ 이번엔 넘길게요 \(https:\/\/matchharper\.com\/email-action\/c2-pass\)\n\n다른 두 분도 있어요\./
  );
  // No card, fill, rounded border, button or table: only the two shared body wrappers.
  assert.equal((email.html.match(/<div/g) ?? []).length, 2);
  assert.doesNotMatch(email.html, /<table|background|border-radius|────/);
  assert.doesNotMatch(email.text, /────/);
});

test("the ask calls the person the way the greeting calls people", () => {
  const url = web("c2");
  assert.equal(candidateCallName(`[Sam Lee](${url}): Built a ledger\n\nSam built it.`), "Sam");
  assert.equal(candidateCallName(`[김민준](${url}): 서빙`), "김민준");
  assert.equal(candidateCallName(`[Kim Minji](${url}): 서빙`), "Kim Minji");
  assert.equal(candidateCallName(`✅ [Mary\\-Jane O'Neil](${url}) — 결제 시스템을 만들었어요.`), "Mary-Jane");
  // The label is Markdown: emphasis, a ✅ inside it and a "님" the Worker added come off.
  assert.equal(candidateCallName(`[**Sam Lee**](${url}): Built a ledger`), "Sam");
  assert.equal(candidateCallName(`[**김민준**](${url}): 서빙`), "김민준");
  assert.equal(candidateCallName(`[김민준님](${url}): 서빙`), "김민준");
  assert.equal(candidateCallName(`[✅ 김민준](${url}) — 서빙`), "김민준");
  assert.equal(candidateCallName("김민준님은 토스에서 일했어요."), "");
  // Text that links no one: the ask goes without a name.
  const email = build({ sections: [{ kind: "company_first", parts: [{ candidateId: "c2", text: "김민준님은 토스에서 일했어요." }] }] });
  assert.match(email.text, /\n\n만나보시겠어요\? 이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요: 연결 요청 /);
});

test("the lead is the person with the strongest ratings, and ratings are not printed", () => {
  const email = build({
    candidates: ids.map((id) =>
      id === "c4"
        ? candidate(id, { criteria: [{ name: "ML 실무 3년", fitness: "excellent" }, { name: "서빙", fitness: "good" }] })
        : candidate(id, { criteria: [{ name: "ML 실무 3년", fitness: "good" }] })
    ),
  });
  assert.match(email.html, />최유나<\/a>님은 네이버에서/);
  assert.match(email.text, /추천 모델 서빙/);
  assert.deepEqual([...email.html.matchAll(/email-action\/(c\d)-/g)].map((m) => m[1]), ["c4", "c4"]);
  assert.doesNotMatch(email.html + email.text, /✓|ML 실무 3년|서빙 ·/);
});

test("people who already said yes keep their text, get their own two links and come first", () => {
  const email = build({ sections: [companyFirst, accepted] });
  assert.equal(email.subject, "ML Engineer: 만나보겠다고 한 분이 1명 있어요");
  const acceptedAt = email.text.indexOf("✅ 연결을 기다리는 후보 · 후보가 이미 만나보겠다고 했어요");
  assert.ok(acceptedAt > 0 && acceptedAt < email.text.indexOf("이 분부터 보시면"));
  assert.match(email.text, /만나보겠다고 한 후보예요\./);
  assert.match(
    email.text,
    /결제 시스템을 만들었어요\.\n\n이서연님과 연결해 드릴까요\? 이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요: 연결하기 \(https:\/\/matchharper\.com\/email-action\/c1-accept\) \/ 이번엔 넘길게요 \(.*c1-reject\)/
  );
  // The mail says once that a reply works; the lead after the ✅ list only asks.
  assert.equal((email.text.match(/답장만 주셔도/g) ?? []).length, 1);
  assert.match(email.text, /\n\n김민준님을 만나보시겠어요\? 연결 요청 \(.*c2-request\) \/ 이번엔 넘길게요 \(.*c2-pass\)\n\n/);
  assert.equal((email.html.match(/<div/g) ?? []).length, 2);
  assert.doesNotMatch(email.html, /background|border-radius/);
  assert.equal((email.text.match(/Harper 드림/g) ?? []).length, 1);
  // Only the ✅ list: no opening line, no "see all", no request closing.
  const onlyAccepted = build({ sections: [accepted], totals: { accepted_connection: 4 } });
  assert.match(onlyAccepted.text, /지금 모두 4명/);
  assert.doesNotMatch(onlyAccepted.text, /이 분부터|전체 .*명 보기|먼저 관심을 확인하고/);
});

test("a closing the Worker wrote (a first result's question) stays before Harper's closing", () => {
  const email = build({
    sections: [{ ...companyFirst, parts: [...companyFirst.parts, { candidateId: null, text: "보상 범위를 알려 주시면 다음 탐색에 반영할게요." }] }],
  });
  const asked = email.text.indexOf("보상 범위를 알려 주시면");
  assert.ok(asked > email.text.indexOf("전체 4명 보기") && asked < email.text.indexOf("만나보고 싶은 분이"));
});

test("English mail follows the same layout in English", () => {
  const email = build({
    locale: "en",
    recipientName: "Dana Park",
    sections: [{
      kind: "company_first",
      parts: [
        { candidateId: "c2", text: `[Sam Lee](${web("c2")}): Founder-turned-IC\n\nSam Lee, Lead Architect at Company C. Shipped multi-agent systems. I'd still check IC fit.` },
        { candidateId: "c3", text: `[Alex Kim](${web("c3")}): Conversational agents for credit` },
      ],
    }],
  });
  assert.match(email.text, /^Hi Dana,\n\n2 new people for your ML Engineer role\. The one I'd start with:/);
  assert.match(email.text, /One more in your list:/);
  assert.match(email.html, />See all 2<\/a>/);
  assert.match(
    email.text,
    /I'd still check IC fit\.\n\nWant to meet Sam\? Just reply to this email, or use these links: Request intro \(.*c2-request\) \/ Pass for now \(.*c2-pass\)\n\nOne more in your list:/
  );
  assert.match(email.text, /If you'd like to meet anyone, I'll make sure they're interested before connecting you\.\n\nHarper$/);
  assert.doesNotMatch(email.html + email.text, /[가-힣]/);
});

test("one new person: no 'start with' line and no 'others' line", () => {
  const email = build({ sections: [{ kind: "company_first", parts: [companyFirst.parts[1]!] }] });
  assert.match(email.text, /ML Engineer에 맞을 만한 분을 새로 찾았어요\./);
  assert.doesNotMatch(email.text, /다른 .* 있어요|이 분부터/);
  assert.match(email.html, />전체 1명 보기<\/a>/);
});

test("older Worker text without a description keeps the whole text for the lead", () => {
  const old = `☘️ [김민준](${web("c2")}) — AI Engineer\n\n• 서빙 플랫폼을 만들었어요.`;
  assert.equal(leadCandidateText(old), old);
  assert.equal(otherCandidateLine(old), `☘️ [김민준](${web("c2")}) — AI Engineer`);
  const single = `[김민준](${web("c2")}) — 한 줄`;
  assert.equal(leadCandidateText(single), single);
});

test("a one-line person shows the line that links them, even after a note", () => {
  const url = web("c3");
  assert.equal(
    otherCandidateLine(`최근에 Harper 가입: 2026-11-20\n[박지훈](${url}): 추천 시스템 경험\n\n박지훈님은 당근에서 일했어요.`),
    `[박지훈](${url}): 추천 시스템 경험`
  );
});

test("English titles take the article of their first sound", () => {
  const cases: Record<string, "a" | "an"> = {
    "AI Engineer": "an", "ML Engineer": "an", "MLOps Engineer": "an", "SRE": "an", "R&D Lead": "an",
    "UX Designer": "a", "CTO": "a", "SaaS Account Executive": "a", "Engineering Manager": "an",
    "iOS Engineer": "an", "User Researcher": "a", "Unity Developer": "a", "Undergraduate Researcher": "an",
    "European Sales Lead": "a", "Head of Growth": "a", "Honorary Fellow": "an", "Founding Engineer": "a",
  };
  for (const [title, article] of Object.entries(cases)) assert.equal(englishArticle(title), article, title);
});

test("the lead's link goes on the name as a whole word, never inside another word", () => {
  const url = web("c2");
  assert.equal(
    leadCandidateText(`[Lee](${url}): Ledger owner\n\nAt Leeds, Lee built the ledger.`),
    `At Leeds, [Lee](${url}) built the ledger.`
  );
  assert.equal(
    leadCandidateText(`[Lee](${url}): Ledger owner\n\nLeeds Bank hired Lee in 2020.`),
    `Leeds Bank hired [Lee](${url}) in 2020.`
  );
  // A Korean particle may follow the name directly.
  assert.equal(
    leadCandidateText(`[김민준](${url}): 서빙\n\n김민준님은 토스에서 일했어요.`),
    `[김민준](${url})님은 토스에서 일했어요.`
  );
  // Only inside a longer word: the whole text stays.
  const inside = `[Lee](${url}): Ledger owner\n\nAt Leeds, the ledger shipped.`;
  assert.equal(leadCandidateText(inside), inside);
});

test("missing action links or candidates are rejected instead of sending a partial mail", () => {
  assert.throws(
    () => build({ candidates: ["c3", "c4"].map((id) => candidate(id)) }),
    /action links are missing/
  );
  assert.throws(
    () =>
      build({
        sections: [
          { kind: "company_first", parts: [{ candidateId: null, text: "x" }] },
        ],
      }),
    /at least one candidate/
  );
  // Worker text that breaks the Markdown (an unclosed code fence) would swallow the links.
  assert.throws(
    () =>
      build({
        sections: [{
          kind: "company_first",
          parts: [{ candidateId: "c2", text: `[김민준](${web("c2")}): 서빙\n\n김민준님은 모델 서빙을 맡았어요.\n\n\`\`\`` }],
        }],
      }),
    /action links could not be placed/
  );
});

test("recipient names cannot inject Markdown", () => {
  const email = build({ recipientName: "[click](https://evil.example)" });
  assert.doesNotMatch(email.html, /evil\.example"/);
});

test("reply context keeps the prose and the asks but never the one-time links", () => {
  const email = build({ sections: [companyFirst, accepted] });
  assert.match(email.replyContext, /김민준/);
  // The person's web link stays, so a reply can name the exact candidate and Role.
  assert.match(email.replyContext, /\[김민준\]\([^)]*talentId=c2[^)]*roleId=r1|\[김민준\]\([^)]*roleId=r1[^)]*talentId=c2/);
  assert.match(email.replyContext, /이서연님과 연결해 드릴까요\? 이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요: 연결하기 \/ 이번엔 넘길게요/);
  assert.match(email.replyContext, /김민준님을 만나보시겠어요\? 연결 요청 \/ 이번엔 넘길게요/);
  assert.doesNotMatch(email.replyContext, /email-action/);
});

test("new people across several Roles: the opening says so and see all opens Home's Roles", () => {
  const other = (id: string) => ({
    ...candidate(id, { roleName: "Data Engineer" }),
    webUrl: web(id).replace("roleId=r1", "roleId=r2").replace("detailRoleId=r1", "detailRoleId=r2"),
  });
  const email = build({ candidates: ids.map((id) => (id === "c4" ? other(id) : candidate(id))) });
  assert.match(email.text, /ML Engineer 외 1개 역할에 새로 4분 찾았는데, 이 분부터 보시면 좋겠어요\./);
  const seeAll = new URL(email.html.match(/href="([^"]*)"[^>]*>전체 4명 보기/)![1]!.replace(/&(?:amp|#x26);/g, "&"));
  assert.equal(seeAll.pathname, "/org/home");
  // Home's 역할 tab (Home opens 소식 without it).
  assert.deepEqual(Object.fromEntries(seeAll.searchParams), { orgId: "w1", tab: "roles", source: "email" });
  const english = build({ locale: "en", recipientName: "Jisoo", candidates: ids.map((id) => (id === "c4" ? other(id) : candidate(id))) });
  assert.match(english.text, /4 new people for your ML Engineer role and 1 more role\. The one I'd start with:/);
  // A Role name that already ends in "Role" is not doubled.
  const named = build({
    locale: "en",
    recipientName: "Jisoo",
    candidates: ids.map((id) => (id === "c4" ? other(id) : candidate(id, { roleName: "Product Role" }))),
  });
  assert.match(named.text, /4 new people for your Product Role and 1 more role\./);
});
