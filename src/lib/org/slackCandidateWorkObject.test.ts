import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackCandidateDecisionView,
  buildSlackCandidateEntity,
  buildSlackCandidateResultPosts,
  candidateStatusLabel,
  parseCandidateDecisionInputs,
  parseCandidateDecisionMetadata,
  slackCandidatePartsFromBlocks,
  type SlackCandidateCard,
} from "./slackCandidateWorkObject";
import {
  backgroundResultResponseFormat,
  parseBackgroundResultParts,
} from "./agent/backgroundResultParts";
import {
  applyHarperSlackApiMessagePolicy,
  createSlackApiRequest,
} from "./slackApiRequest";

const first: SlackCandidateCard = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "First candidate",
  profileUrl:
    "https://matchharper.com/org/role?recommendationId=company-intro%3Afirst",
  roleName: "Engineer",
  status: "ready",
};
const second: SlackCandidateCard = {
  ...first,
  id: "00000000-0000-4000-8000-000000000002",
  name: "Second candidate",
  profileUrl:
    "https://matchharper.com/org/role?recommendationId=company-intro%3Asecond",
};

test("compact cards show the latest role and company without detail fields, falling back when either is missing", () => {
  const card = buildSlackCandidateEntity({
    candidate: {
      ...first,
      headline: "Hidden outside",
      latestExperience: {
        role: " Engineer ",
        companyName: " Company ",
      },
    },
    locale: "en",
  }).entity_payload;
  assert.equal(card.attributes.display_type, "Engineer");
  assert.equal(card.attributes.product_name, "Company");
  assert.deepEqual(card.custom_fields, []);
  assert.deepEqual(card.display_order, []);
  assert.equal(card.actions, undefined);
  assert.deepEqual(card.attributes.product_icon, {
    url: "https://matchharper.com/images/squareface.png",
    alt_text: "Harper",
  });
  for (const latestExperience of [
    null,
    { role: null, companyName: "Company" },
    { role: "Engineer", companyName: " " },
  ]) {
    const fallback = buildSlackCandidateEntity({
      candidate: { ...first, latestExperience },
      locale: "ko",
    }).entity_payload;
    assert.equal(fallback.attributes.display_type, "Candidates");
    assert.equal(fallback.attributes.product_name, "Harper");
    assert.deepEqual(
      fallback.attributes.product_icon,
      card.attributes.product_icon
    );
  }
  const details = buildSlackCandidateEntity({
    candidate: { ...first, headline: "Engineer" },
    locale: "en",
    surface: "details",
  }).entity_payload;
  assert.deepEqual(details.display_order, ["documents", "headline"]);
  assert.equal(
    buildSlackCandidateEntity({
      candidate: {
        ...first,
        latestExperience: {
          role: "Engineer",
          companyName: "Company",
        },
      },
      locale: "en",
      surface: "details",
    }).entity_payload.attributes.product_icon,
    undefined
  );
});

test("Documents is first, preserves the exact org profile destination, and is absent from compact cards", () => {
  for (const locale of ["ko", "en"] as const) {
    const args = {
      candidate: { ...first, headline: "Engineer" },
      locale,
      documents: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/candidate" },
        { label: "Resume [2026]", url: "https://example.com/resume(2026).pdf" },
        { label: "Invalid", url: "javascript:alert(1)" },
        {
          label: "Credentials",
          url: "https://user:password@example.com/resume",
        },
      ],
      details: [{ key: "location", label: "Location", value: "Seoul" }],
    };
    const payload = buildSlackCandidateEntity({
      ...args,
      surface: "details",
    }).entity_payload;
    assert.deepEqual(payload.display_order, [
      "documents",
      "headline",
      "location",
    ]);
    assert.equal(payload.custom_fields[0].label, "Documents");
    assert.equal((payload.custom_fields[0] as any).format, "markdown");
    assert.equal(
      payload.custom_fields[0].value,
      `[LinkedIn](https://www.linkedin.com/in/candidate) · [Resume \\[2026\\]](https://example.com/resume%282026%29.pdf) · [자세히 보기](${first.profileUrl})`
    );
    assert.deepEqual(
      buildSlackCandidateEntity(args).entity_payload.custom_fields,
      []
    );
    for (const status of [
      "ready",
      "awaiting_talent",
      "passed",
      "closed",
      "connected",
    ]) {
      const minimal = buildSlackCandidateEntity({
        candidate: { ...first, status },
        locale,
        surface: "details",
      }).entity_payload;
      assert.equal(
        minimal.custom_fields[0].value,
        `[자세히 보기](${first.profileUrl})`
      );
    }
  }
});

test("structured results put the final candidate card before the closing question regardless of prose layout", () => {
  const parts = [
    { candidateId: null, text: "Search complete." },
    {
      candidateId: second.id,
      text: "Second candidate: first paragraph.\n\nMore evidence.",
    },
    {
      candidateId: first.id,
      text: "First candidate: compact explanation without a link.",
    },
    { candidateId: null, text: "What is your compensation range?" },
  ];
  const posts = buildSlackCandidateResultPosts(
    "unused legacy text",
    [first, second],
    parts
  );
  assert.deepEqual(
    posts.map((post) => post.candidates[0]?.id ?? null),
    [null, second.id, first.id, null]
  );
  assert.deepEqual(
    posts.map((post) => post.text),
    parts.map((part) => part.text)
  );
  assert.equal(posts[3].candidates.length, 0);
});

test("rendering contract verifies complete candidate coverage without judging or changing their descriptions", () => {
  const valid = [
    { candidateId: first.id, text: "Any description the writer chooses." },
  ];
  assert.deepEqual(
    parseBackgroundResultParts({ parts: valid }, [first.id]),
    valid
  );
  for (const parts of [
    [],
    [...valid, ...valid],
    [{ ...valid[0], candidateId: second.id }],
    [{ ...valid[0], text: "" }],
  ]) {
    assert.throws(() => parseBackgroundResultParts({ parts }, [first.id]));
  }
  const schema = backgroundResultResponseFormat([first.id]).json_schema.schema;
  assert.deepEqual(schema.properties.parts.items.properties.candidateId.enum, [
    null,
    first.id,
  ]);
});

test("worker sealed blocks preserve candidate IDs and keep closing remarks after cards", () => {
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: "Intro" } },
    {
      type: "section",
      block_id: `company_intro_${first.id}`,
      text: { type: "mrkdwn", text: "Candidate description\n\nMore evidence" },
    },
    { type: "section", text: { type: "mrkdwn", text: "Closing question" } },
  ];
  const parts = slackCandidatePartsFromBlocks(blocks, [first])!;
  assert.deepEqual(
    parts.map((part) => part.candidateId),
    [null, first.id, null]
  );
  assert.equal(parts[1].text, blocks[1].text.text);
  assert.throws(() => slackCandidatePartsFromBlocks(blocks, [second]));
  assert.equal(slackCandidatePartsFromBlocks([], [first]), undefined);
});

test("each candidate description is immediately followed by its own entity, preserving the exact answer", () => {
  const text = `Search complete.\n\n<${first.profileUrl}|First> built a payments system.\nTrade-off: relocation.\n\n<${second.profileUrl}|Second> led platform work.\n\nWhich candidate would you like to meet?`;
  const posts = buildSlackCandidateResultPosts(text, [second, first]);
  assert.equal(posts.length, 2);
  assert.deepEqual(
    posts.map((post) => post.candidates[0].id),
    [first.id, second.id]
  );
  assert.equal(posts.map((post) => post.text).join(""), text);
  assert.ok(posts[0].text.includes("Trade-off: relocation."));
  assert.ok(!posts[0].text.includes("Second>"));
});

test("verified legacy profile links also anchor candidate cards", () => {
  const legacy = "https://matchharper.com/org/role?talentId=legacy";
  const text = `<${legacy}|First> explanation.\n\n<${second.profileUrl}|Second> explanation.`;
  const posts = buildSlackCandidateResultPosts(text, [
    { ...first, linkedUrls: [legacy] },
    second,
  ]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].candidates[0].id, first.id);
  assert.equal(posts.map((post) => post.text).join(""), text);
});

test("an unanchored or shared paragraph layout keeps prose intact and still provides individual cards", () => {
  for (const text of [
    "An answer without profile links.",
    `<${first.profileUrl}|First> and <${second.profileUrl}|Second> are candidates.`,
  ]) {
    const posts = buildSlackCandidateResultPosts(text, [first, second]);
    assert.equal(posts[0].text, text);
    assert.equal(posts[0].candidates.length, 0);
    assert.deepEqual(
      posts.slice(1).map((post) => post.candidates[0].id),
      [first.id, second.id]
    );
  }
});

test("Work Object actions appear only in details for ready candidates and permitted reviewers", () => {
  const entity = buildSlackCandidateEntity({
    candidate: first,
    locale: "ko",
    surface: "details",
  });
  assert.equal(entity.entity_type, "slack#/entities/item");
  assert.deepEqual(entity.external_ref, {
    id: first.id,
    type: "company_intro",
  });
  assert.ok(entity.external_ref.type.length <= 20);
  assert.equal(entity.entity_payload.actions?.primary_actions.length, 2);
  const passOnly = buildSlackCandidateEntity({
    candidate: first,
    locale: "ko",
    surface: "details",
    canRequestIntro: false,
    canPass: true,
  });
  assert.deepEqual(
    passOnly.entity_payload.actions?.primary_actions.map(
      (action) => action.text
    ),
    ["Pass"]
  );
  assert.equal(
    typeof entity.entity_payload.actions?.primary_actions[0].text,
    "string"
  );
  assert.equal(
    buildSlackCandidateEntity({
      candidate: first,
      locale: "ko",
      surface: "details",
      canDecide: false,
    }).entity_payload.actions,
    undefined
  );
  for (const status of [
    "awaiting_talent",
    "connecting",
    "connected",
    "passed",
    "closed",
  ]) {
    assert.equal(
      buildSlackCandidateEntity({
        candidate: { ...first, status },
        locale: "en",
        surface: "details",
      }).entity_payload.actions,
      undefined
    );
  }
  assert.equal(
    buildSlackCandidateEntity({
      candidate: first,
      locale: "en",
      surface: "card",
      canDecide: true,
      canRequestIntro: true,
      canPass: true,
    }).entity_payload.actions,
    undefined
  );
});

test("Slack form encoding retains entity metadata while automatic link previews stay disabled", () => {
  const metadata = JSON.stringify({
    entities: [buildSlackCandidateEntity({ candidate: first, locale: "en" })],
  });
  const policy = applyHarperSlackApiMessagePolicy("chat.postMessage", {
    text: "Candidate",
    metadata,
  });
  const request = createSlackApiRequest("test-token", policy);
  assert.equal(request.body.get("metadata"), metadata);
  assert.equal(request.body.get("unfurl_links"), "false");
  assert.equal(request.body.get("unfurl_media"), "false");
});

test("private metadata admits only valid machine identifiers and decision commands", () => {
  const metadata = { candidateId: first.id, decision: "pass", locale: "ko" };
  assert.deepEqual(
    parseCandidateDecisionMetadata(JSON.stringify(metadata)),
    metadata
  );
  for (const value of [
    "invalid",
    JSON.stringify({ ...metadata, candidateId: "other-workspace" }),
    JSON.stringify({ ...metadata, decision: "connect" }),
  ]) {
    assert.equal(parseCandidateDecisionMetadata(value), null);
  }
});

test("Intro requires an appeal and selected teammates; Pass needs no candidate contact", () => {
  const metadata = {
    candidateId: first.id,
    decision: "request_intro" as const,
    locale: "ko" as const,
  };
  assert.deepEqual(
    Object.keys(parseCandidateDecisionInputs(metadata, {}).errors),
    ["candidate_appeal", "candidate_recipients"]
  );
  const parsed = parseCandidateDecisionInputs(metadata, {
    values: {
      candidate_appeal: { appeal: { value: "  We want to meet you.  " } },
      candidate_recipients: {
        recipients: { selected_options: [{ value: "reviewer@example.com" }] },
      },
    },
  });
  assert.equal(parsed.appeal, "We want to meet you.");
  assert.deepEqual(parsed.recipientEmails, ["reviewer@example.com"]);
  assert.deepEqual(parsed.errors, {});
  assert.deepEqual(
    parseCandidateDecisionInputs({ ...metadata, decision: "pass" }, {}).errors,
    {}
  );
  const pass = buildSlackCandidateDecisionView({
    metadata: { ...metadata, decision: "pass" },
    candidate: first,
    members: [],
    actorEmail: "reviewer@example.com",
  });
  assert.ok(!pass.blocks.some((block) => block.type === "input"));
});

test("the actor remains a valid default recipient in a workspace with more than 100 teammates", () => {
  const actorEmail = "actor@example.com";
  const members = [
    ...Array.from({ length: 101 }, (_, index) => ({
      email: `member${index}@example.com`,
      name: `Member ${index}`,
    })),
    { email: actorEmail, name: "Actor" },
  ];
  const view = buildSlackCandidateDecisionView({
    metadata: {
      candidateId: first.id,
      decision: "request_intro",
      locale: "en",
    },
    candidate: first,
    members,
    actorEmail,
  });
  const element = (
    view.blocks.find(
      (block) =>
        "block_id" in block && block.block_id === "candidate_recipients"
    ) as any
  ).element;
  assert.equal(element.options.length, 100);
  assert.equal(element.initial_options[0].value, actorEmail);
  assert.ok(element.options.some((option: any) => option.value === actorEmail));
});

test("status labels distinguish preparation, delivery, and candidate acceptance", () => {
  assert.equal(
    candidateStatusLabel({ status: "awaiting_talent" }, "en"),
    "Preparing intro request"
  );
  assert.equal(
    candidateStatusLabel(
      { status: "awaiting_talent", candidateSentAt: "2026-10-08" },
      "en"
    ),
    "Awaiting candidate reply"
  );
  assert.equal(
    candidateStatusLabel({ status: "connecting" }, "en"),
    "Candidate accepted · connecting"
  );
});

test('accepted connection cards show the orange identity and current-action badge', () => {
  const candidate = { ...first, acceptedConnection: true, status: 'pending_connection',
    latestExperience: { role: 'Senior Engineer', companyName: 'Previous Co' } };
  for (const locale of ['ko','en'] as const) {
    const attributes = buildSlackCandidateEntity({ candidate, locale }).entity_payload.attributes;
    assert.equal(attributes.product_name, 'Harper');
    assert.equal(attributes.display_type, 'Senior Engineer');
    assert.equal(attributes.product_icon?.url, 'https://matchharper.com/images/squareface_orange.png');
    assert.equal(attributes.display_id, locale === 'ko' ? '🟠 수락시 바로 연결' : '🟠 Accept to connect');
  }
  const connected = buildSlackCandidateEntity({ candidate: { ...candidate, status: 'connected' }, locale: 'ko' });
  assert.equal(connected.entity_payload.attributes.display_id, undefined);
});
