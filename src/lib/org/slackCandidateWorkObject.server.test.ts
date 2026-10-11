import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as contract from "./slackCandidateWorkObject";
import * as companyPresentation from "./companyCriteriaEvaluations";
import * as slackApiRequest from "./slackApiRequest";
import * as billingTypes from "./billing/types";
import * as billingNotice from "./billing/notice";

// Execute the real server modules with isolated adapters: these tests must never
// access a production database, Slack token, or candidate-contact capability.
function loadServer(
  name: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {}
) {
  const source = readFileSync(new URL(name, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module: loaded,
    exports: loaded.exports,
    URL,
    URLSearchParams,
    process: { env: {} },
    console: { warn() {}, error() {} },
    require(name: string) {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return loaded.exports;
}

const candidateId = "00000000-0000-4000-8000-000000000001";
const row = {
  id: candidateId,
  company_workspace_id: "workspace",
  role_id: "role",
  talent_id: "talent",
  status: "ready",
  candidate_sent_at: null,
};
const detail = {
  companyIntro: {
    id: candidateId,
    status: "ready",
    selectionReason: "Internal selection reason",
    harperNote: "Candidate wants architecture ownership",
    introduction: "Role-based candidate introduction",
    candidateSentAt: null,
  },
  talent: { name: "Candidate", headline: "Engineer" },
  role: { name: "Engineer" },
  capabilities: { requestIntro: true, pass: true },
  members: [],
  profile: {
    bio: "Public bio",
    location: "Seoul",
    email: "PRIVATE_EMAIL",
    documents: ["PRIVATE_RESUME"],
    experiences: [
      {
        role: "Engineer",
        companyName: "Company",
        description: "Shipped systems",
        memo: "PRIVATE_MEMO",
      },
    ],
    educations: [
      {
        school: "University",
        degree: "BS",
        field: "CS",
        memo: "PRIVATE_EDUCATION_MEMO",
      },
    ],
    extras: [
      {
        title: "Open source",
        description: "Maintainer",
        memo: "PRIVATE_EXTRA_MEMO",
      },
    ],
  },
  profileMarkdown: "PRIVATE_MARKDOWN",
  matchingContext: "PRIVATE_MATCH_CONTEXT",
};

function query(read: () => unknown) {
  const builder: any = {};
  for (const method of ["select", "eq", "in", "limit", "order"])
    builder[method] = () => builder;
  builder.contains = (_field: string, value: unknown) => {
    builder.filter = value;
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve(read());
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve(read()).then(resolve, reject);
  return builder;
}

function harness(
  overrides: {
    row?: any;
    allowed?: boolean;
    optOut?: boolean;
    detail?: any;
    send?: any;
    channels?: any[];
    messages?: any[];
    scopes?: string[];
    experiences?: any[];
  } = {}
) {
  const calls: any[] = [];
  const messages = overrides.messages ?? [];
  const admin = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: "actor" } },
          error: null,
        }),
      },
    },
    from(table: string) {
      let builder: any;
      builder = query(() => ({
        error: null,
        data:
          table === "company_intro_candidates"
            ? (overrides.row ?? row)
            : table === "company_role_notification_channels"
              ? overrides.optOut
                ? [{ channel_id: "disabled" }]
                : []
              : table === "company_slack_channels"
                ? (overrides.channels ?? [
                    { id: "one", slack_channel_id: "C1" },
                  ])
                : table === "company_messages"
                  ? messages
                      .filter((message) =>
                        Object.entries(
                          builder.filter.slackCandidateDelivery
                        ).every(
                          ([key, value]) => message.delivery[key] === value
                        )
                      )
                      .map((message) => ({
                        ...message,
                        metadata: { slackCandidateDelivery: message.delivery },
                      }))
                  : table === "talent_experiences"
                    ? (overrides.experiences ?? [])
                    : null,
      }));
      if (table === "talent_experiences")
        builder.order = (field: string, options: unknown) => {
          calls.push({ experienceOrder: { field, options } });
          return builder;
        };
      return builder;
    },
  };
  const dependencies = {
    "server-only": {},
    "./slackCandidateWorkObject": contract,
    "./companyCriteriaEvaluations": companyPresentation,
    "@/lib/server/candidateAccess": { getSupabaseAdmin: () => admin },
    "@/lib/org/server": {
      fetchOrgTalentDetail: async (args: unknown) => {
        calls.push({ detail: args });
        return overrides.detail ?? detail;
      },
    },
    "@/lib/org/workspaceLocale.server": {
      getOrgWorkspaceLocale: async () => "ko",
    },
    "@/lib/org/slackMessages": {
      getOrgPublicSiteUrl: () => "https://matchharper.com",
      escapeSlackText: (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;"),
    },
    "@/lib/org/slackMemberAccess": {
      resolveHarperSlackWorkspaceAccess: async () => ({
        allowed: overrides.allowed !== false,
        member: {
          companyUserId: "actor",
          email: "actor@example.com",
          locale: "ko",
          canManageCandidates: true,
        },
      }),
    },
    "@/lib/org/slackHarper": {
      getHarperSlackGrantedScopes: async () =>
        overrides.scopes ?? [
          "links:read",
          "links:write",
          "users:read",
          "users:read.email",
        ],
      resolveHarperSlackInteractionContext: async (args: any) => {
        if (args.slackTeamId !== "team") throw new Error("Wrong workspace");
        return {
          token: "test-token",
          workspaceId: "workspace",
          channelId: args.channelId,
        };
      },
      slackApi: async (_token: string, method: string, args: unknown) => {
        calls.push({ method, args });
      },
      sendHarperWorkspaceSlackMessage: overrides.send ?? (async () => true),
    },
  };
  return {
    server: loadServer("./slackCandidateWorkObject.server.ts", dependencies),
    calls,
    messages,
  };
}

test("card loading uses the latest dated experience and retains requested candidate order", async () => {
  const { server, calls } = harness({
    row: [
      { ...row, presentation: { name: "First" }, role: { name: "Engineer" } },
      {
        ...row,
        id: "second",
        talent_id: "second-talent",
        presentation: { name: "Second" },
        role: { name: "Engineer" },
      },
    ],
    experiences: [
      {
        talent_id: "talent",
        role: "Recent role",
        company_name: "Recent company",
      },
      {
        talent_id: "talent",
        role: "Old role",
        company_name: "Old company",
      },
    ],
  });
  const cards = await server.loadSlackCandidateCards({
    workspaceId: "workspace",
    candidateIds: ["second", candidateId],
  });
  assert.equal(cards[0].id, "second");
  assert.equal(cards[0].latestExperience, null);
  assert.equal(cards[1].latestExperience.role, "Recent role");
  assert.equal(cards[1].latestExperience.companyName, "Recent company");
  assert.equal(calls[0].experienceOrder.field, "start_date");
  assert.equal(calls[0].experienceOrder.options.ascending, false);
  assert.equal(calls[0].experienceOrder.options.nullsFirst, false);
});

test("the profile panel reads the exact intro through the canonical detail reader and excludes private fields", async () => {
  const { server, calls } = harness();
  await server.presentSlackCandidate({
    candidateId,
    slackTeamId: "team",
    slackUserId: "user",
    channelId: "C1",
    triggerId: "trigger",
  });
  assert.equal(
    calls[0].detail.recommendationId,
    `company-intro:${candidateId}`
  );
  const metadata = JSON.parse(
    calls.find((call) => call.method === "entity.presentDetails").args.metadata
  );
  const rendered = JSON.stringify(metadata);
  assert.ok(!rendered.includes("Shipped systems"));
  assert.ok(rendered.includes("University"));
  assert.ok(rendered.includes("Candidate wants architecture ownership"));
  assert.ok(rendered.includes("Role-based candidate introduction"));
  assert.ok(!rendered.includes("Public bio"));
  assert.equal(
    metadata.entity_payload.custom_fields.find(
      (field: any) => field.key === "reason"
    ).label,
    "Harper Note"
  );
  assert.equal(
    metadata.entity_payload.custom_fields.find(
      (field: any) => field.key === "introduction"
    ).label,
    "TL;DR"
  );
  assert.ok(!rendered.includes("PRIVATE_"));
  assert.equal(metadata.entity_payload.actions.primary_actions.length, 2);
});

test("profile previews group six recent experiences with Markdown roles and dates, without duplicate detail rows", async () => {
  const experiences = Array.from({ length: 8 }, (_, index) => ({
    role: `Engineer ${index}`,
    companyName: `Company ${index}`,
    companyLogo:
      index === 0
        ? " https://example.com/logo.png "
        : index === 1
          ? "javascript:alert(1)"
          : null,
    startDate: `202${9 - index}-01-01`,
    endDate: index ? `202${9 - index}-12-31` : null,
    description:
      index === 0 ? "🚀".repeat(400) : "Built APIs\nMaintained systems",
    memo: "PRIVATE_MEMO",
  }));
  const profile = { ...detail.profile, experiences, bio: "A".repeat(800) };
  const input = {
    ...detail,
    companyIntro: { ...detail.companyIntro, introduction: "I".repeat(800) },
    profile,
  };
  const original = JSON.stringify(input);
  const { server } = harness();
  for (const locale of ["ko", "en"] as const) {
    const fields = server.slackCandidateProfileFields(input, locale);
    const metadata = contract.buildSlackCandidateEntity({
      candidate: {
        id: candidateId,
        name: "Candidate",
        profileUrl: "https://matchharper.com/org/role",
        roleName: "Engineer",
        status: "ready",
      },
      locale,
      surface: "details",
      details: fields,
    }).entity_payload;
    const company = metadata.custom_fields.find(
      (field) => field.key === "experience_0"
    )!;
    assert.equal(
      company.value,
      `Company 0\n**Engineer 0**\n_2029-01 – ${locale === "ko" ? "현재" : "Present"}_`
    );
    assert.equal((company as any).icon, undefined);
    assert.equal((company as any).format, "markdown");
    for (const index of [1, 2])
      assert.equal(
        (
          metadata.custom_fields.find(
            (field) => field.key === `experience_${index}`
          ) as any
        ).icon,
        undefined
      );
    assert.equal((company as any).long, true);
    assert.equal(company.label, locale === "ko" ? "경력" : "Experience");
    assert.equal(
      metadata.custom_fields.filter((field) =>
        /^experience_\d+$/.test(field.key)
      ).length,
      6
    );
    assert.ok(
      !metadata.custom_fields.some((field) => field.key.endsWith("_details"))
    );
    assert.ok(!company.value.includes("🚀"));
    const rendered = JSON.stringify(metadata);
    assert.ok(!rendered.includes("Built APIs\\nMaintained systems"));
    assert.ok(rendered.includes("Engineer 5"));
    assert.ok(!rendered.includes("Engineer 6"));
    assert.ok(!rendered.includes("PRIVATE_"));
    assert.ok(
      metadata.custom_fields
        .find((field) => field.key === "experience_more")!
        .value.includes(locale === "ko" ? "외 2개 경력" : "2 more experiences")
    );
    assert.equal(
      metadata.custom_fields.find((field) => field.key === "introduction")!
        .value,
      "I".repeat(800)
    );
  }
  assert.equal(JSON.stringify(input), original);
});

test("Documents keeps private resources hidden and routes public files through authenticated resume access", async () => {
  const input = {
    ...detail,
    capabilities: { ...detail.capabilities, viewResume: true },
    profile: {
      ...detail.profile,
      registeredLinks: [
        "linkedin.com/in/candidate",
        "https://linkedin.com/in/candidate",
        "https://example.com/resume.pdf?revision=2",
        "https://portfolio.example.com/work",
        "https://linkedin.com.attacker.example/resume.pdf",
        "javascript:alert(1)",
        "data:text/html,private",
        "https://user:password@example.com/cv",
        "https://",
      ],
      documents: [{ id: "document-id", fileName: "Candidate CV.pdf" }],
    },
    resume: { hasStorageFile: true, fileName: "CV.pdf", links: [] },
  };
  const { server, calls } = harness({ detail: input });
  const profileUrl = server.slackCandidateProfileUrl(row);
  const publicLinks = server.slackCandidateDocumentLinks(
    input,
    profileUrl,
    "en"
  );
  assert.equal(publicLinks.length, 6);
  assert.equal(
    publicLinks.filter((link: any) => link.label === "LinkedIn").length,
    1
  );
  assert.equal(publicLinks[0].url, "https://linkedin.com/in/candidate");
  assert.equal(publicLinks[1].label, "Resume");
  for (const [index, kind] of [
    [4, "storage"],
    [5, "document"],
  ] as const) {
    const url = new URL(publicLinks[index].url);
    assert.equal(url.origin, new URL(profileUrl).origin);
    assert.equal(url.pathname, "/org/resume");
    assert.equal(url.searchParams.get("kind"), kind);
    assert.equal(url.searchParams.get("talentId"), row.talent_id);
    assert.equal(url.searchParams.get("workspaceId"), row.company_workspace_id);
    assert.equal(
      url.searchParams.get("documentId"),
      kind === "document" ? "document-id" : null
    );
  }
  assert.equal(
    server.slackCandidateDocumentLinks(
      { ...input, capabilities: { viewResume: false } },
      profileUrl,
      "en"
    ).length,
    0
  );
  assert.equal(
    server.slackCandidateDocumentLinks(
      { ...input, capabilities: {} },
      profileUrl,
      "en"
    ).length,
    0
  );
  await server.presentSlackCandidate({
    candidateId,
    slackTeamId: "team",
    slackUserId: "user",
    channelId: "C1",
    triggerId: "trigger",
  });
  const metadata = JSON.parse(
    calls.find((call) => call.method === "entity.presentDetails").args.metadata
  );
  assert.equal(metadata.entity_payload.display_order[0], "documents");
  const rendered = metadata.entity_payload.custom_fields[0].value;
  assert.ok(rendered.includes("[LinkedIn](https://linkedin.com/in/candidate)"));
  assert.ok(rendered.endsWith(`[자세히 보기](${profileUrl})`));
  assert.ok(
    !rendered.includes("javascript:") &&
      !rendered.includes("password") &&
      !rendered.includes("data:")
  );
});

test("missing role-based introductions do not fall back to the talent bio or Harper Note", () => {
  const { server } = harness();
  for (const introduction of [null, undefined, " "]) {
    const fields = server.slackCandidateProfileFields(
      {
        ...detail,
        companyIntro: { ...detail.companyIntro, introduction },
      },
      "en"
    );
    assert.ok(!fields.some((field: any) => field.key === "introduction"));
    assert.ok(!JSON.stringify(fields).includes("Public bio"));
    assert.equal(
      fields.find((field: any) => field.key === "reason").value,
      "Candidate wants architecture ownership"
    );
  }
});

test("experience totals exclude overlaps and gaps, include hidden history and cap ongoing work at today", () => {
  const { server } = harness();
  const asOf = new Date("2025-01-01T00:00:00Z");
  const cases = [
    {
      name: "overlapping employment counts once",
      periods: [
        ["2020-01-01", "2022-01-01"],
        ["2021-01-01", "2023-01-01"],
      ],
      years: "3.0",
    },
    {
      name: "a year between jobs is excluded",
      periods: [
        ["2020-01-01", "2021-01-01"],
        ["2022-01-01", "2023-01-01"],
      ],
      years: "2.0",
    },
    {
      name: "adjacent periods have no extra day",
      periods: [
        ["2020-01-01", "2021-01-01"],
        ["2021-01-01", "2022-01-01"],
      ],
      years: "2.0",
    },
    {
      name: "a nested period does not shorten the outer period",
      periods: [
        ["2020-01-01", "2024-01-01"],
        ["2021-01-01", "2022-01-01"],
        ["2023-01-01", "2024-01-01"],
      ],
      years: "4.0",
    },
    {
      name: "ongoing and future end dates stop at today",
      periods: [
        ["2020-01-01", null],
        ["2024-01-01", "2026-01-01"],
        ["2026-01-01", null],
      ],
      years: "5.0",
    },
    {
      name: "the omitted seventh experience affects the full total",
      periods: [
        ...Array.from({ length: 6 }, () => ["2024-01-01", "2025-01-01"]),
        ["2020-01-01", null],
      ],
      years: "5.0",
    },
    {
      name: "missing dates do not fabricate a full duration",
      periods: [[null, "2023-01-01"]],
      years: null,
    },
    {
      name: "invalid calendar dates are rejected",
      periods: [["2023-02-29", "2024-01-01"]],
      years: null,
    },
    {
      name: "reversed dates cannot claim negative experience",
      periods: [["2024-01-01", "2023-01-01"]],
      years: null,
    },
  ];
  for (const scenario of cases) {
    const periods = [...scenario.periods];
    while (periods.length < 7) periods.push(periods[0]);
    const input = {
      ...detail,
      profile: {
        ...detail.profile,
        experiences: periods.map(([startDate, endDate]) => ({
          ...detail.profile.experiences[0],
          startDate,
          endDate,
        })),
      },
    };
    for (const locale of ["ko", "en"] as const) {
      const summary = server
        .slackCandidateProfileFields(input, locale, asOf)
        .find((field: any) => field.key === "experience_more");
      const total =
        scenario.years === null
          ? locale === "ko"
            ? "총 경력 기간 미확인"
            : "total duration unavailable"
          : locale === "ko"
            ? `총 ${scenario.years}년`
            : `total ${scenario.years} years`;
      assert.equal(
        summary.value,
        locale === "ko"
          ? `외 1개 경력, ${total}`
          : `1 more experience, ${total}`,
        `${scenario.name} (${locale})`
      );
    }
  }
});

test("a non-member receives a restricted panel without a profile read", async () => {
  const { server, calls } = harness({ allowed: false });
  await server.presentSlackCandidate({
    candidateId,
    slackTeamId: "team",
    slackUserId: "guest",
    triggerId: "trigger",
  });
  assert.ok(!calls.some((call) => call.detail));
  assert.equal(calls[0].args.metadata, undefined);
  assert.equal(JSON.parse(calls[0].args.error).status, "restricted");
});

test("an expired intro cannot expose another current recommendation's profile", async () => {
  const { server, calls } = harness({
    detail: {
      ...detail,
      companyIntro: { ...detail.companyIntro, id: "different" },
    },
  });
  await server.presentSlackCandidate({
    candidateId,
    slackTeamId: "team",
    slackUserId: "user",
    triggerId: "trigger",
  });
  const response = calls.find(
    (call) => call.method === "entity.presentDetails"
  );
  assert.equal(response.args.metadata, undefined);
  assert.equal(JSON.parse(response.args.error).status, "restricted");
});

test("refreshing a passed candidate removes decision actions without reading a profile", async () => {
  const { server, calls } = harness({ row: { ...row, status: "passed" } });
  await server.refreshSlackCandidateUnfurls({
    team_id: "team",
    event: {
      channel: "C1",
      message_ts: "123.456",
      user: "user",
      links: [{ url: server.slackCandidateProfileUrl(row) }],
    },
  });
  assert.ok(!calls.some((call) => call.detail));
  const response = calls.find((call) => call.method === "chat.unfurl");
  const entity = JSON.parse(response.args.metadata).entities[0];
  assert.equal(entity.entity_payload.actions, undefined);
  assert.equal(entity.entity_payload.custom_fields.length, 0);
});

test("Slack workspace mismatch and role channel opt-out fail before profile access", async () => {
  for (const args of [
    { slackTeamId: "different", optOut: false },
    { slackTeamId: "team", optOut: true },
  ]) {
    const { server, calls } = harness({ optOut: args.optOut });
    await assert.rejects(
      server.readSlackCandidate({
        candidateId,
        slackTeamId: args.slackTeamId,
        slackUserId: "user",
        channelId: "C1",
      })
    );
    assert.ok(!calls.some((call) => call.detail));
  }
});

test("partial delivery resumes each channel independently using durable message receipts", async () => {
  const messages: any[] = [];
  const posted: string[] = [];
  let fail = true;
  const { server } = harness({
    messages,
    channels: [
      { id: "one", slack_channel_id: "C1" },
      { id: "two", slack_channel_id: "C2" },
    ],
    send: async (args: any) => {
      const key = `${args.idempotencyKey}:${args.channelId}`;
      if (args.channelId === "C2" && fail) {
        fail = false;
        throw new Error("Temporary Slack outage");
      }
      posted.push(key);
      const slackMessageTs = String(posted.length);
      messages.push({
        delivery: args.messageMetadata.slackCandidateDelivery,
        slack_message_ts: slackMessageTs,
      });
      args.onPosted({ channelId: args.channelId, slackMessageTs });
      return true;
    },
  });
  const candidate = {
    id: candidateId,
    name: "Candidate",
    profileUrl: "https://matchharper.com/org/role?candidate=1",
    roleName: "Engineer",
    status: "ready",
  };
  const args = {
    text: `<${candidate.profileUrl}|Candidate> description.`,
    candidates: [candidate],
    workspaceId: "workspace",
    locale: "ko",
    idempotencyKey: "outbox",
    recordConversationMessage: true,
    onReceipt: async () => {},
  };
  await assert.rejects(
    server.sendSlackCandidateResult({ ...args, receipts: {} })
  );
  assert.equal(posted.length, 1);
  assert.equal(
    await server.sendSlackCandidateResult({ ...args, receipts: {} }),
    true
  );
  assert.equal(posted.length, 2);
  assert.equal(new Set(posted).size, 2);
});

test("structured messages stay separate when installations lack any card permission", async () => {
  const required = [
    "links:read",
    "links:write",
    "users:read",
    "users:read.email",
  ];
  for (const missing of required) {
    const posted: any[] = [];
    const { server } = harness({
      scopes: required.filter((scope) => scope !== missing),
      send: async (args: any) => {
        posted.push(args);
        args.onPosted({ channelId: args.channelId, slackMessageTs: "1" });
        return true;
      },
    });
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: "Original result" } },
    ];
    const text =
      "Original description and <https://matchharper.com/org/role|profile link>.";
    const receipts: Record<string, any> = {};
    const args = {
      text,
      blocks,
      candidates: [
        {
          id: candidateId,
          name: "Candidate",
          profileUrl: "https://matchharper.com/org/role",
          roleName: "Engineer",
          status: "ready",
        },
      ],
      parts: [
        { candidateId, text: "Candidate explanation" },
        { candidateId: null, text: "Closing question" },
      ],
      workspaceId: "workspace",
      locale: "ko",
      idempotencyKey: "legacy",
      recordConversationMessage: false,
      receipts,
      onReceipt: async () => {},
    };
    assert.equal(await server.sendSlackCandidateResult(args), true);
    assert.equal(await server.sendSlackCandidateResult(args), true);
    assert.equal(posted.length, 2);
    assert.equal(posted[0].text, "Candidate explanation");
    assert.equal(posted[1].text, "Closing question");
    assert.ok(posted.every((post) => post.blocks === undefined));
    assert.ok(posted.every((post) => post.entityMetadata === undefined));
    assert.ok(posted.every((post) => post.threadTs === undefined));
    assert.equal(Object.keys(receipts).length, 2);
  }
});

test("a partial card delivery keeps its boundaries after permissions are revoked", async () => {
  const first = {
    id: candidateId,
    name: "First",
    profileUrl: "https://matchharper.com/first",
    roleName: "Engineer",
    status: "ready",
  };
  const second = {
    ...first,
    id: "00000000-0000-4000-8000-000000000002",
    name: "Second",
  };
  const messages: any[] = [];
  const posted: any[] = [];
  let fail = true;
  const send = async (args: any) => {
    if (
      args.entityMetadata?.entities[0].external_ref.id === second.id &&
      fail
    ) {
      fail = false;
      throw new Error("Transport failure");
    }
    posted.push(args);
    const slackMessageTs = String(posted.length);
    messages.push({
      delivery: args.messageMetadata.slackCandidateDelivery,
      slack_message_ts: slackMessageTs,
    });
    args.onPosted({ channelId: args.channelId, slackMessageTs });
    return true;
  };
  const args = {
    text: "First explanation\n\nSecond explanation",
    candidates: [first, second],
    parts: [
      { candidateId: first.id, text: "First explanation" },
      { candidateId: second.id, text: "Second explanation" },
    ],
    workspaceId: "workspace",
    locale: "ko",
    idempotencyKey: "partial",
    onReceipt: async () => {},
  };
  await assert.rejects(
    harness({ messages, send }).server.sendSlackCandidateResult({
      ...args,
      receipts: {},
    })
  );
  const { server } = harness({ messages, send, scopes: ["chat:write"] });
  assert.equal(
    await server.sendSlackCandidateResult({ ...args, receipts: {} }),
    true
  );
  assert.equal(posted.length, 2);
  assert.equal(posted[0].text, "First explanation");
  assert.equal(posted[1].text, "Second explanation");
  assert.equal(posted[1].entityMetadata, undefined);
});

test("a completed text fallback is not resent as cards after a reinstall", async () => {
  const messages = [
    {
      delivery: { deliveryKey: "legacy", postKey: "text", channelId: "C1" },
      slack_message_ts: "1",
    },
  ];
  const { server } = harness({
    messages,
    send: async () => {
      throw new Error("Duplicate post");
    },
  });
  assert.equal(
    await server.sendSlackCandidateResult({
      text: "Original result",
      candidates: [
        {
          id: candidateId,
          name: "Candidate",
          profileUrl: "https://matchharper.com/org/role",
          roleName: "Engineer",
          status: "ready",
        },
      ],
      workspaceId: "workspace",
      locale: "ko",
      idempotencyKey: "legacy",
      receipts: {},
      onReceipt: async () => {},
    }),
    true
  );
});

function slackDeliveryHarness(
  responses: Array<{ error?: string; ok?: boolean; scopes?: string } | Error>
) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const encryptionKey = "isolated-test-key";
  const iv = Buffer.alloc(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    crypto.createHash("sha256").update(encryptionKey).digest(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update("test-token", "utf8"),
    cipher.final(),
  ]);
  const encrypted = `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
  const server = loadServer(
    "./slackHarper.ts",
    {
      "server-only": {},
      "node:crypto": crypto,
      "@/lib/internalAccess": {},
      "@/lib/org/agent/store": {},
      "@/lib/org/permissions": {},
      "@/lib/org/slackWorkspaceRouting": {},
      "@/lib/org/slackFiles": {},
      "@/lib/org/slackWelcome": {},
      "@/lib/org/workspaceLocale.server": {},
      "@/lib/org/slackMessageText": {},
      "@/lib/server/candidateAccess": {
        getSupabaseAdmin: () => ({
          from: () =>
            query(() => ({
              data: { bot_token_ciphertext: encrypted, scopes: ["chat:write"] },
              error: null,
            })),
        }),
      },
      "./slackApiRequest": slackApiRequest,
      "./slackChannelCreation": { SLACK_CHANNEL_CREATION_SCOPES: [] },
    },
    {
      Buffer,
      AbortSignal,
      process: {
        env: { SLACK_HARPER_APP_TOKEN_ENCRYPTION_KEY: encryptionKey },
      },
      fetch: async (url: string, request: { body: URLSearchParams }) => {
        calls.push({ url, body: request.body });
        const response = responses.shift();
        if (!response) throw new Error("Unexpected Slack request");
        if (response instanceof Error) throw response;
        return {
          ok: true,
          json: async () => ({
            ok: response.ok ?? !response.error,
            error: response.error,
            ts: "posted",
          }),
          headers: {
            get: (name: string) =>
              name === "x-oauth-scopes" ? (response.scopes ?? null) : null,
          },
        };
      },
    }
  );
  return { server, calls };
}

test("scope checks use the token's current grant instead of the stale installation snapshot", async () => {
  const { server, calls } = slackDeliveryHarness([
    {
      scopes: "chat:write, links:read,links:write,users:read,users:read.email",
    },
  ]);
  const scopes = await server.getHarperSlackGrantedScopes("workspace");
  assert.ok(scopes.includes("links:write"));
  assert.ok(scopes.includes("users:read.email"));
  assert.equal(calls[0].url, "https://slack.com/api/auth.test");
});

test("an unavailable or unreadable scope check disables only the optional cards", async () => {
  for (const response of [
    new Error("Network unavailable"),
    { error: "invalid_auth" },
    {},
  ]) {
    const { server } = slackDeliveryHarness([response]);
    assert.equal(
      (await server.getHarperSlackGrantedScopes("workspace")).length,
      0
    );
  }
});

test("explicit card rejections retry the same message without metadata and retain idempotency", async () => {
  for (const error of [
    "missing_scope",
    "no_permission",
    "not_allowed_token_type",
    "invalid_metadata_format",
    "invalid_metadata_schema",
    "metadata_must_be_sent_from_app",
    "metadata_too_large",
  ]) {
    const { server, calls } = slackDeliveryHarness([{ error }, {}]);
    const result = await server.postHarperSlackMessage({
      token: "test-token",
      channelId: "C1",
      clientMessageId: "same-id",
      text: "Exact original prose and profile link",
      entityMetadata: { entities: [{ entity_type: "slack#/entities/item" }] },
    });
    assert.equal(result.ts, "posted");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].body.has("metadata"));
    assert.ok(!calls[1].body.has("metadata"));
    assert.equal(calls[1].body.get("text"), calls[0].body.get("text"));
    assert.equal(calls[1].body.get("client_msg_id"), "same-id");
    assert.equal(calls[1].body.get("unfurl_links"), "false");
  }
});

test("transport, revoked-token, and normal text failures do not trigger a second post", async () => {
  for (const response of [
    new Error("Lost response after posting"),
    { error: "invalid_auth" },
    { error: "ratelimited" },
    { error: "channel_not_found" },
  ]) {
    const { server, calls } = slackDeliveryHarness([response]);
    await assert.rejects(
      server.postHarperSlackMessage({
        token: "test-token",
        channelId: "C1",
        text: "Original",
        entityMetadata: { entities: [] },
      })
    );
    assert.equal(calls.length, 1);
  }
  const { server, calls } = slackDeliveryHarness([{ error: "missing_scope" }]);
  await assert.rejects(
    server.postHarperSlackMessage({
      token: "test-token",
      channelId: "C1",
      text: "Original",
    })
  );
  assert.equal(calls.length, 1);
});

test("a rejected text fallback remains a real delivery failure", async () => {
  const { server, calls } = slackDeliveryHarness([
    { error: "missing_scope" },
    { error: "channel_not_found" },
  ]);
  await assert.rejects(
    server.postHarperSlackMessage({
      token: "test-token",
      channelId: "C1",
      text: "Original",
      entityMetadata: { entities: [] },
    }),
    (error: any) => error.code === "channel_not_found"
  );
  assert.equal(calls.length, 2);
});

test("only Harper intro URLs and correctly typed UUID references resolve to a candidate", () => {
  const { server } = harness();
  const url = server.slackCandidateProfileUrl(row);
  assert.equal(
    server.candidateIdFromSlackEntity({ entity_url: url }),
    candidateId
  );
  assert.equal(
    server.candidateIdFromSlackEntity({
      entity_url: url.replace("matchharper.com", "example.com"),
    }),
    null
  );
  assert.equal(
    server.candidateIdFromSlackEntity({
      external_ref: { type: "unrelated", id: candidateId },
    }),
    null
  );
});

test("successful decisions are not reoffered when the detail panel refresh fails", async () => {
  const background: Array<() => Promise<void>> = [];
  const views: any[] = [];
  let commands = 0;
  const actor = {
    context: { token: "test-token", workspaceId: "workspace" },
    row,
    member: { canManageCandidates: true, email: "actor@example.com" },
    user: { id: "actor" },
  };
  const loaded = loadServer("./slackCandidateInteractivity.ts", {
    "server-only": {},
    "@/lib/org/billing/types": billingTypes,
    "@/lib/org/billing/notice": billingNotice,
    "next/server": { after: (fn: () => Promise<void>) => background.push(fn) },
    "@/lib/org/agent/webActionTurn": {
      enqueueOrgAgentWebActionTurn: async () => {},
    },
    "@/lib/org/server": {
      passOrgCompanyIntro: async () => {
        commands++;
        return { status: "already_passed" };
      },
    },
    "@/lib/org/slackHarper": {
      updateHarperSlackModal: async (args: any) => views.push(args.view),
    },
    "@/lib/org/workspaceLocale.server": {
      getOrgWorkspaceLocale: async () => "ko",
    },
    "./slackCandidateWorkObject": contract,
    "./slackCandidateWorkObject.server": {
      resolveSlackCandidate: async () => ({
        ...actor,
        row: { ...row, status: commands ? "passed" : "ready" },
      }),
      authorizeSlackCandidate: async () => actor,
      readSlackCandidate: async () => ({
        ...actor,
        candidate: { id: candidateId, name: "Candidate", roleName: "Engineer" },
        detail,
      }),
      presentSlackCandidate: async () => {
        throw new Error("Expired display trigger");
      },
    },
  });
  const response = await loaded.handleSlackCandidateInteraction({
    type: "view_submission",
    team: { id: "team" },
    user: { id: "user" },
    trigger_id: "trigger",
    view: {
      id: "view",
      callback_id: contract.SLACK_CANDIDATE_DECISION_CALLBACK,
      private_metadata: JSON.stringify({
        candidateId,
        decision: "pass",
        locale: "ko",
      }),
      state: {},
    },
  });
  assert.equal(response.response_action, "update");
  await background[0]();
  assert.equal(commands, 1);
  assert.equal(views.length, 1);
  assert.equal(views[0].blocks[0].text.text, "Pass");
  assert.equal(views[0].submit, undefined);
});

test("insufficient intro credits show the billing notice and keep input without waking the agent", async () => {
  const background: Array<() => Promise<void>> = [];
  const views: any[] = [];
  let commands = 0;
  let agentWakes = 0;
  const actor = {
    context: { token: "test-token", workspaceId: "workspace" },
    row,
    member: { canManageCandidates: true, email: "actor@example.com" },
    user: { id: "actor" },
  };
  const loaded = loadServer("./slackCandidateInteractivity.ts", {
    "server-only": {},
    "@/lib/org/billing/types": billingTypes,
    "@/lib/org/billing/notice": billingNotice,
    "next/server": { after: (fn: () => Promise<void>) => background.push(fn) },
    "@/lib/org/agent/webActionTurn": {
      enqueueOrgAgentWebActionTurn: async () => {
        agentWakes++;
      },
    },
    "@/lib/org/server": {
      requestOrgCompanyIntro: async () => {
        commands++;
        throw new billingTypes.WorkspaceBillingError("credits_exhausted");
      },
    },
    "@/lib/org/slackHarper": {
      updateHarperSlackModal: async (args: any) => views.push(args.view),
    },
    "@/lib/org/workspaceLocale.server": {
      getOrgWorkspaceLocale: async () => "ko",
    },
    "./slackCandidateWorkObject": contract,
    "./slackCandidateWorkObject.server": {
      resolveSlackCandidate: async () => actor,
      authorizeSlackCandidate: async () => actor,
      readSlackCandidate: async () => ({
        ...actor,
        candidate: { id: candidateId, name: "Candidate", roleName: "Engineer" },
        detail: {
          ...detail,
          members: [{ name: "Actor", email: "actor@example.com" }],
        },
      }),
    },
  });
  const response = await loaded.handleSlackCandidateInteraction({
    type: "view_submission",
    team: { id: "team" },
    user: { id: "user" },
    view: {
      id: "view",
      callback_id: contract.SLACK_CANDIDATE_DECISION_CALLBACK,
      private_metadata: JSON.stringify({
        candidateId,
        decision: "request_intro",
        locale: "ko",
      }),
      state: {
        values: {
          candidate_appeal: { appeal: { value: "My message" } },
          candidate_recipients: {
            recipients: { selected_options: [{ value: "actor@example.com" }] },
          },
        },
      },
    },
  });
  assert.equal(response.response_action, "update");
  await background[0]();
  assert.equal(commands, 1);
  assert.equal(agentWakes, 0);
  const view = views[0];
  assert.equal(
    view.blocks.filter((block: any) =>
      block.text?.text.includes(billingTypes.billingErrorCopy("credits_exhausted", "ko"))
    ).length,
    1
  );
  assert.ok(JSON.stringify(view).includes(billingTypes.BILLING_SUPPORT_HREF));
  assert.equal(
    view.blocks.find((block: any) => block.block_id === "candidate_appeal")
      .element.initial_value,
    "My message"
  );
  assert.equal(
    view.blocks.find((block: any) => block.block_id === "candidate_recipients")
      .element.initial_options[0].value,
    "actor@example.com"
  );
});

test('accepted cards appear in the channel and partial retries preserve delivered messages', async () => {
  const messages: any[] = [], posted: any[] = [];
  let fail = true;
  const send = async (args: any) => {
    if (args.text === 'Already accepted: owns API architecture.' && fail) {
      fail = false; throw new Error('Transient failure');
    }
    posted.push(args);
    const slackMessageTs = `ts-${posted.length}`;
    messages.push({ delivery: args.messageMetadata.slackCandidateDelivery, slack_message_ts: slackMessageTs });
    args.onPosted({ channelId: args.channelId, slackMessageTs });
    return true;
  };
  const args = {
    text: 'Already accepted candidates',
    candidates: [{ id: candidateId, name: 'Candidate', profileUrl: 'https://matchharper.com/org/role',
      roleName: 'Engineer', status: 'pending_connection', acceptedConnection: true }],
    parts: [{ candidateId: null, text: 'These candidates accepted the role.' },
      { candidateId, text: 'Already accepted: owns API architecture.' },
      { candidateId: null, text: 'Accept to connect directly.' }],
    workspaceId: 'workspace', locale: 'en', idempotencyKey: 'accepted:run:C1',
    onReceipt: async () => {},
  };
  await assert.rejects(harness({ messages, send }).server.sendSlackCandidateResult({ ...args, receipts: {} }));
  await harness({ messages, send }).server.sendSlackCandidateResult({ ...args, receipts: {} });
  assert.equal(posted.length, 3);
  assert.equal(posted[0].threadTs, undefined);
  assert.equal(posted[1].threadTs, undefined);
  assert.equal(posted[2].threadTs, undefined);
  assert.equal(posted[1].entityMetadata.entities[0].entity_payload.attributes.product_icon.url,
    'https://matchharper.com/images/squareface_orange.png');
});

test('accepted profile reads the ordinary authorized pipeline and the complete company-safe report', async () => {
  const safeReport = { tldr: 'Owns API architecture.', harperNote: 'Prefers end-to-end ownership. '.repeat(25),
    finalFit: 'excellent', criteriaEvaluations: [{ name: 'Architecture', fitness: 'excellent', content: 'Owned service design.' }] };
  const { server } = harness({ row: { ...row, status: 'closed', close_reason: 'route_replaced', presentation: { deliveryKind: 'accepted_connection' } },
    detail: { ...detail, companyIntro: null, companyPresentation: safeReport,
      recommendation: { stage: 'pending_connection' } } });
  const result = await server.readSlackCandidate({ candidateId, slackTeamId: 'team', slackUserId: 'user', channelId: 'C1' });
  assert.equal(result.candidate.status, 'pending_connection');
  assert.equal(result.candidate.acceptedConnection, true);
  const fields = server.slackCandidateProfileFields(result.detail, 'en');
  assert.equal(fields.find((field: any) => field.key === 'reason').value, safeReport.harperNote);
  assert.equal(fields.find((field: any) => field.key === 'final_fit').value, 'Excellent fit');
  assert.equal(server.slackCandidateProfileFields(result.detail, 'ko').find((field: any) => field.key === 'final_fit').value, '매우 잘 맞음');
  assert.ok(fields.find((field: any) => field.key === 'criterion_0').value.includes('Owned service design.'));
  assert.ok(!JSON.stringify(fields).includes('PRIVATE_'));
});

test('opening an accepted card renders the report instead of a closed suggestion', async () => {
  const { server, calls } = harness({
    row: { ...row, status: 'closed', close_reason: 'route_replaced', presentation: { deliveryKind: 'accepted_connection' } },
    detail: { ...detail, companyIntro: null,
      companyPresentation: { tldr: 'Owned service architecture.', harperNote: 'Prefers product ownership.', finalFit: 'good',
        criteriaEvaluations: [{ name: 'Architecture', fitness: 'good', content: 'Designed production services.' }] },
      recommendation: { stage: 'pending_connection' } },
  });
  await server.presentSlackCandidate({ candidateId, slackTeamId: 'team', slackUserId: 'user', channelId: 'C1', triggerId: 'trigger' });
  const metadata = JSON.parse(calls.find(call => call.method === 'entity.presentDetails').args.metadata);
  assert.equal(metadata.entity_payload.attributes.title.text, 'Candidate');
  assert.equal(metadata.entity_payload.attributes.display_id, '🟠 수락시 바로 연결');
  assert.ok(metadata.entity_payload.custom_fields.some((field: any) => field.value === 'Owned service architecture.'));
  assert.ok(metadata.entity_payload.custom_fields.some((field: any) => field.value === 'Prefers product ownership.'));
  assert.ok(metadata.entity_payload.custom_fields.some((field: any) => field.value.includes('Designed production services.')));
  assert.equal(metadata.entity_payload.actions, undefined);
  assert.ok(!JSON.stringify(metadata).includes('PRIVATE_'));
});

test('accepted card refresh reads the current pipeline status and retains its identity', async () => {
  for (const stage of ['pending_connection', 'connected']) {
    const { server, calls } = harness({
      row: { ...row, status: 'closed', close_reason: 'route_replaced', presentation: { deliveryKind: 'accepted_connection' } },
      detail: { ...detail, companyIntro: null, recommendation: { stage } },
    });
    await server.refreshSlackCandidateUnfurls({ team_id: 'team', event: {
      channel: 'C1', message_ts: 'ts', user: 'user',
      links: [{ url: server.slackCandidateProfileUrl(row) }],
    } });
    const metadata = JSON.parse(calls.find(call => call.method === 'chat.unfurl').args.metadata);
    const attributes = metadata.entities[0].entity_payload.attributes;
    assert.equal(attributes.title.text, 'Candidate');
    assert.equal(attributes.product_icon.url, 'https://matchharper.com/images/squareface_orange.png');
    assert.equal(attributes.display_id, stage === 'pending_connection' ? '🟠 수락시 바로 연결' : undefined);
  }
});

test('accepted card opening still returns restricted after pipeline authorization fails', async () => {
  const { server, calls } = harness({ allowed: false,
    row: { ...row, status: 'closed', close_reason: 'route_replaced', presentation: { deliveryKind: 'accepted_connection' } },
  });
  await server.presentSlackCandidate({ candidateId, slackTeamId: 'team', slackUserId: 'user', channelId: 'C1', triggerId: 'trigger' });
  const response = calls.find(call => call.method === 'entity.presentDetails').args;
  assert.equal(JSON.parse(response.error).status, 'restricted');
  assert.equal(response.metadata, undefined);
});
