import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateDigestEmail,
  candidateDigestSubject,
} from "./candidateDigestEmail";

const web = (id: string) =>
  `https://matchharper.com/org/role?talentId=${id}&source=email`;
const candidate = (id: string) => ({
  id,
  webUrl: web(id),
  actionUrls: {
    request_intro: `https://matchharper.com/email-action/${id}-request`,
    pass: `https://matchharper.com/email-action/${id}-pass`,
    accept_connection: `https://matchharper.com/email-action/${id}-accept`,
    reject_connection: `https://matchharper.com/email-action/${id}-reject`,
  },
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
const companyFirst = {
  kind: "company_first" as const,
  parts: [
    { candidateId: null, text: "먼저 연락해 볼 수 있는 후보예요." },
    {
      candidateId: "c2",
      text: `☘️ [김민준](${web("c2")}) — **ML** 모델을 운영했어요.`,
    },
    {
      candidateId: "c3",
      text: `☘️ [박지훈](${web("c3")}) — 추천 시스템 경험.`,
    },
    {
      candidateId: null,
      text: "아래 버튼으로 정하거나 이 메일에 답장해 주세요.",
    },
  ],
};
const build = (
  overrides: Partial<Parameters<typeof buildCandidateDigestEmail>[0]> = {}
) =>
  buildCandidateDigestEmail({
    locale: "ko",
    recipientName: "김지수",
    roleNames: ["ML Engineer"],
    // The Worker's row order must not decide the mail order.
    sections: [companyFirst, accepted],
    candidates: ["c1", "c2", "c3"].map(candidate),
    workspaceId: "00000000-0000-4000-8000-000000000001",
    ...overrides,
  });

test("subjects use the fixed templates for each candidate mix and multiple roles", () => {
  const subject = (
    acceptedCount: number,
    companyFirstCount: number,
    roleNames = ["ML Engineer"],
    locale: "ko" | "en" = "ko"
  ) =>
    candidateDigestSubject({
      locale,
      roleNames,
      acceptedCount,
      companyFirstCount,
    });
  assert.equal(subject(1, 0), "ML Engineer: 연결 수락할 후보 1명");
  assert.equal(subject(0, 2), "ML Engineer: 연결 제안할 후보 2명");
  assert.equal(
    subject(1, 2),
    "ML Engineer: 연결 수락할 후보 1명 · 연결 제안할 후보 2명"
  );
  assert.equal(
    subject(1, 2, ["ML Engineer", "Data Engineer", "PM"]),
    "ML Engineer 외 2개 역할: 연결 수락할 후보 1명 · 연결 제안할 후보 2명"
  );
  assert.equal(
    subject(1, 2, ["ML Engineer"], "en"),
    "ML Engineer: Ready to connect (1) · Suggested candidates (2)"
  );
  assert.equal(
    subject(0, 1, ["ML Engineer", "PM"], "en"),
    "ML Engineer and 1 more role: Suggested candidates (1)"
  );
});

test("mail greets the recipient, puts Ready to connect first and keeps the Worker prose", () => {
  const email = build();
  assert.equal(
    email.subject,
    "ML Engineer: 연결 수락할 후보 1명 · 연결 제안할 후보 2명"
  );
  assert.match(email.text, /^김지수님, Harper가 찾은 후보예요\./);
  const acceptedAt = email.text.indexOf(
    "✅ 연결 수락할 후보 · 후보가 이미 만나보겠다고 했어요"
  );
  const companyFirstAt = email.text.indexOf("연결 제안할 후보\n");
  assert.ok(acceptedAt > 0 && companyFirstAt > acceptedAt);
  assert.ok(email.text.indexOf("이서연") < email.text.indexOf("김민준"));
  assert.match(email.html, /<strong>ML<\/strong>/);
  assert.match(
    email.html,
    /href="https:\/\/matchharper.com\/org\/role\?talentId=c2&#x26;source=email"|href="https:\/\/matchharper.com\/org\/role\?talentId=c2&amp;source=email"/
  );
});

test("each candidate gets the local action labels right under its description", () => {
  const email = build();
  assert.equal(
    (email.html.match(/href="https:\/\/matchharper.com\/email-action\//g) ?? [])
      .length,
    6
  );
  const acceptRow = email.html.indexOf("c1-accept");
  assert.ok(
    acceptRow > email.html.indexOf("이서연") &&
      acceptRow < email.html.indexOf("김민준")
  );
  assert.match(email.html, /background:#111827[^>]*>연결 수락<\/a>/);
  assert.match(email.html, /background:#ffffff[^>]*>연결 거절<\/a>/);
  assert.match(email.html, /background:#111827[^>]*>Send Intro<\/a>/);
  assert.match(email.html, /background:#ffffff[^>]*>Pass<\/a>/);
  assert.doesNotMatch(email.html, />웹에서 자세히 보기<\/a>/);
  assert.doesNotMatch(email.html + email.text, /HARPERDIGESTACTIONS/);
});

test("text part keeps the local two-action layout and profile links in the candidate text", () => {
  const email = build();
  assert.match(
    email.text,
    /연결 수락: https:\/\/matchharper.com\/email-action\/c1-accept\n연결 거절: https:\/\/matchharper.com\/email-action\/c1-reject/
  );
  assert.match(
    email.text,
    /Send Intro: https:\/\/matchharper.com\/email-action\/c3-request/
  );
  assert.doesNotMatch(email.text, /버튼은 7일 동안/);
  assert.ok(email.text.includes(web("c1")));
  assert.doesNotMatch(email.html, /버튼은 7일 동안/);
});

test("reply context keeps the prose but never the one-time button links", () => {
  const email = build();
  assert.match(email.replyContext, /김민준/);
  assert.doesNotMatch(email.replyContext, /email-action/);
});

test("a mail with one kind only has one heading and the matching buttons", () => {
  const email = build({ sections: [companyFirst] });
  assert.equal(email.subject, "ML Engineer: 연결 제안할 후보 2명");
  assert.doesNotMatch(email.text, /연결 수락할 후보|연결 수락/);
  assert.equal(
    (email.html.match(/href="https:\/\/matchharper.com\/email-action\//g) ?? [])
      .length,
    4
  );
});

test("English workspaces get the same structure with English copy", () => {
  const email = build({ locale: "en", recipientName: "Jisoo" });
  assert.equal(
    email.subject,
    "ML Engineer: Ready to connect (1) · Suggested candidates (2)"
  );
  assert.match(email.text, /^Jisoo, here are the candidates Harper found\./);
  assert.ok(
    email.text.indexOf("✅ Ready to connect") <
      email.text.indexOf("Suggested candidates")
  );
  assert.match(
    email.text,
    /Connect: https:\/\/matchharper.com\/email-action\/c1-accept\nReject: /
  );
  assert.match(email.text, /Send Intro: .*\nPass: .*/);
  assert.doesNotMatch(email.text, /The buttons work for 7 days/);
});

test("missing button links or candidates are rejected instead of sending a partial mail", () => {
  assert.throws(
    () => build({ candidates: ["c1", "c2"].map(candidate) }),
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
});

test("recipient names cannot inject Markdown", () => {
  const email = build({ recipientName: "[click](https://evil.example)" });
  assert.doesNotMatch(email.html, /evil\.example"/);
});

test("criterion ratings sit under the candidate as mark + name with accessible labels, evidence stays on the web", () => {
  const rated = {
    ...candidate("c2"),
    criteria: [
      { name: "ML 실무 3년", fitness: "excellent" as const },
      { name: "모델 서빙", fitness: "uncertain" as const },
      { name: "논문", fitness: "bad" as const },
    ],
  };
  const mail = build({ candidates: [candidate("c1"), rated, candidate("c3")] });
  // HTML: the ratings come right before c2's buttons, with the web icon colors and no images.
  const c2Buttons = mail.html.indexOf("c2-request");
  const ratings = mail.html.indexOf(">ML 실무 3년</td>");
  assert.ok(ratings > mail.html.indexOf("김민준") && ratings < c2Buttons);
  assert.ok(
    mail.html.includes('color:#009B35">✓✓</span>') &&
      mail.html.includes('color:#F59E0B">?</span>') &&
      mail.html.includes('color:#A92011">✗</span>')
  );
  assert.ok(
    mail.html.includes(">모델 서빙</td>") && mail.html.includes(">논문</td>")
  );
  assert.ok(
    mail.html.includes('aria-label="확인 필요"') &&
      mail.html.includes('aria-label="맞지 않음"')
  );
  assert.doesNotMatch(mail.html, / · (매우 잘 맞음|확인 필요|맞지 않음)/);
  assert.ok(!/<img/i.test(mail.html));
  // Text: mark lines before the button links, only for the rated candidate.
  assert.match(
    mail.text,
    /✓✓ ML 실무 3년 · 매우 잘 맞음\n\? 모델 서빙 · 확인 필요\n✗ 논문 · 맞지 않음\n\nSend Intro: https:\/\/matchharper.com\/email-action\/c2-request/
  );
  assert.equal((mail.text.match(/✓/g) ?? []).length, 2);
  // Harper's reply context has the ratings, still without button links.
  assert.ok(
    mail.replyContext.includes("? 모델 서빙 · 확인 필요") &&
      !mail.replyContext.includes("email-action")
  );
});

test("candidates without ratings get no rating lines and the mail is otherwise unchanged", () => {
  const plain = build();
  const empty = build({
    candidates: ["c1", "c2", "c3"].map((id) => ({
      ...candidate(id),
      criteria: [],
    })),
  });
  assert.equal(empty.html, plain.html);
  assert.equal(empty.text, plain.text);
  assert.equal(empty.replyContext, plain.replyContext);
});

test("English mails keep rating labels accessible and in the plain-text fallback", () => {
  const mail = build({
    locale: "en",
    candidates: [
      candidate("c1"),
      {
        ...candidate("c2"),
        criteria: [{ name: "Serving", fitness: "good" as const }],
      },
      candidate("c3"),
    ],
  });
  assert.ok(
    mail.html.includes(">Serving</td>") &&
      mail.html.includes('aria-label="Good fit"')
  );
  assert.ok(
    !mail.html.includes("Serving · Good fit") &&
      mail.text.includes("✓ Serving · Good fit")
  );
});

test("each candidate is one borderless card holding its text, ratings and buttons; headings stay outside", () => {
  const mail = build({
    candidates: [
      candidate("c1"),
      {
        ...candidate("c2"),
        criteria: [{ name: "ML 실무", fitness: "good" as const }],
      },
      candidate("c3"),
    ],
  });
  const opens = [
    ...mail.html.matchAll(/<div style="border-radius:10px;background:#f9fafb/g),
  ].map((m) => m.index!);
  assert.equal(opens.length, 3);
  // Every card closes right after its button row, so cards never nest or overlap.
  assert.equal((mail.html.match(/<\/table><\/div>/g) ?? []).length, 3);
  const [c1, c2, c3] = ["c1", "c2", "c3"].map((id) =>
    mail.html.indexOf(`${id}-`)
  );
  assert.ok(
    opens[0] < c1 &&
      c1 < opens[1] &&
      opens[1] < c2 &&
      c2 < opens[2] &&
      opens[2] < c3
  );
  const ratings = mail.html.indexOf(">ML 실무</td>");
  assert.ok(opens[1] < ratings && ratings < c2);
  // Group headings and intro lines sit outside the cards.
  const suggested = mail.html.indexOf("연결 제안할 후보");
  assert.ok(opens[0] < suggested && suggested < opens[1]);
  assert.ok(mail.html.indexOf("만나보겠다고 한 후보예요.") < opens[0]);
  assert.ok(!mail.html.includes("HARPERDIGEST"));
  // Text: one divider line before each candidate.
  assert.equal((mail.text.match(/^────────────────────$/gm) ?? []).length, 3);
  assert.ok(
    mail.text.indexOf("────────────────────") < mail.text.indexOf("이서연")
  );
  assert.ok(
    !mail.text.includes("HARPERDIGEST") &&
      !mail.replyContext.includes("HARPERDIGEST")
  );
});
