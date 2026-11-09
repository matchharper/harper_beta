import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { execFileSync } from "node:child_process";

async function main() {
  const task = "docs/evaluation/interview-coordination";
  const hash = (v: string | Buffer) =>
    createHash("sha256").update(v).digest("hex");
  const frozen = JSON.parse(readFileSync(`${task}/manifest-v1.json`, "utf8"));
  for (const [file, expected] of Object.entries(frozen.files))
    if (hash(readFileSync(`${task}/${file}`)) !== expected)
      throw Error(`Frozen input changed: ${file}`);
  const data = JSON.parse(readFileSync(`${task}/cases-v1.json`, "utf8"));
  config({ path: ".env.local", quiet: true });
  const dir = `${task}/runs/${new Date().toISOString().replaceAll(":", "-")}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (file: string, value: unknown) =>
    writeFileSync(`${dir}/${file}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(
      typeof input === "string" ? input : (input.url ?? String(input))
    );
    if (
      !["openrouter.ai", "api.openai.com", "api.anthropic.com"].includes(
        url.hostname
      )
    )
      throw Error(`Evaluation network blocked: ${url.hostname}`);
    return realFetch(input, init);
  }) as typeof fetch;
  const { runOrgAgentToolLoop, runOrgAgentCompletion } =
    await import("../src/lib/org/agent/chat");
  const { resolveOrgAgentModel } =
    await import("../src/lib/org/agent/modelConfig");
  const { withCompanyAgentScope, companyAgentServiceTools } =
    await import("../src/lib/agentContacts/companyScope");
  const { companyAgentEventPrompt } =
    await import("../src/lib/agentContacts/contracts");
  const { createEvaluationReadAdmin } =
    await import("./lib/companyAgentEvaluationContract");
  const { formatCoordinatedMeeting } =
    await import("../src/lib/meetings/coordination");
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const model = resolveOrgAgentModel(undefined).model;
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "src/lib/org/agent",
      "src/lib/meetings",
      "src/lib/agentContacts",
      "scripts/evalInterviewCoordination.ts",
    ],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n");
  save("manifest", {
    model,
    clock: data.clock,
    frozen,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sources: Object.fromEntries(paths.map((p) => [p, hash(readFileSync(p))])),
  });
  for (const c of data.cases) {
    const trace: any[] = [],
      completions: any[] = [];
    let prepared = c.prepared;
    const meeting: any = {
      id: id(6),
      role_id: id(2),
      talent_id: id(4),
      version: 1,
      title: "플랫폼 역할 인터뷰",
      status: "preparing",
      duration_minutes: 60,
      timezone: "Asia/Seoul",
      company_attendees: [{ companyUserId: id(3), name: "팀원 A" }],
      meeting_config_snapshot: { meetingPurpose: "플랫폼 역할 인터뷰" },
    };
    const evidence = () =>
      [
        prepared
          ? formatCoordinatedMeeting(meeting)
          : "No saved meetings for this candidate and Role.",
        "Recurring availability: not saved. The company requested 2026-11-10 through 2026-11-12, 14:00–17:00 Asia/Seoul; one hour. The requester delegated choosing any candidate-agreed time inside this window and sending invitations.",
        `Personal Calendar: ${c.personalCalendar ? "active; freshly synced; no busy events in the requested window" : "not connected; personal conflicts unverified"}. Harper shared Calendar configured. Personal Calendar takes priority.`,
      ].join("\n");
    let admin: any = createEvaluationReadAdmin({
      company_user_workspace: [
        {
          company_user_id: id(3),
          company_workspace_id: id(1),
          authority: "owner",
          access_scope: "organization",
          team_id: null,
        },
      ],
      company_roles: [
        {
          role_id: id(2),
          company_workspace_id: id(1),
          source_type: "internal",
          company_internal_roles: { team_id: null },
          information: {
            testOnly: true,
            testFixture: "interview-coordination-v1",
          },
        },
      ],
    });
    if (c.origin === "candidate_event")
      admin = withCompanyAgentScope(admin, {
        kind: "company_event",
        workspaceId: id(1),
        roleId: id(2),
        jobId: id(10),
        leaseOwner: "fixture",
        assertCurrent: async () => {},
      });
    try {
      const result = await runOrgAgentToolLoop(
        {
          actorId: id(3),
          actorLabel: "팀원 A",
          admin,
          conversation: {
            id: id(8),
            company_workspace_id: id(1),
            role_id: id(2),
          },
          currentUserMessageId: 1,
          context: {
            workspace: { workspaceId: id(1), companyName: "합성 회사" },
            roles: [
              { roleId: id(2), name: "플랫폼 엔지니어", status: "active" },
            ],
            companyText: "합성 회사",
            rolesText: `Role ${id(2)} 플랫폼 엔지니어`,
            conversationText: "-",
            conversationMessages: [],
            summariesText: "-",
            recentContactsText: `김지민: 연결됨. Introduction ${id(9)}`,
            recentRecommendationsText: `김지민 talentId ${id(4)}, recommendationId ${id(5)}, Role ${id(2)}, stage connected.`,
            contextNotesText: "-",
            completeRoleRequestIds: [],
            defaultLongTextObservations: [],
            inProgressRoleCreationsText: "-",
            pendingUpdateText: "-",
            recentToolContextText: "-",
          },
          mentions: [],
          model,
          readAudience: "company_safe",
          scopeKey: c.id,
          source: "chat",
          responseLocale: "ko",
          slackThreadId: null,
          user: { id: c.origin === "candidate_event" ? id(10) : id(3) },
          userMessage:
            c.origin === "candidate_event"
              ? companyAgentEventPrompt(c.message)
              : c.message,
          serviceAnswerExamplesText: null,
          signal: AbortSignal.timeout(180000),
          ...(c.origin === "candidate_event"
            ? {
                initialCapabilities: ["agent_correspondence"],
                allowedToolNames: companyAgentServiceTools(),
                harperInitiated: true,
                allowSilentCompletion: true,
              }
            : {}),
        } as any,
        {
          requestTime: new Date(data.clock),
          complete: async (args) => {
            const input = { ...args, candidateEmailWorkspaceId: undefined };
            const { signal, ...request } = input;
            const entry: any = { request };
            completions.push(entry);
            const r = await runOrgAgentCompletion(input);
            entry.result = r;
            save(`${c.id}-completions`, completions);
            return r;
          },
          executeTool: async (args) => {
            const x: any = args.input;
            trace.push({ tool: args.name, input: x });
            let result: any;
            if (args.name === "manage_meeting") {
              if (x.action === "prepare") {
                prepared = true;
                result = {
                  scheduleId: id(6),
                  version: 1,
                  modelOutput: `Request saved; nothing sent.\n${evidence()}`,
                };
              } else if (x.action === "read")
                result = { modelOutput: evidence() };
              else if (x.action === "confirm") {
                if (
                  !prepared ||
                  x.scheduleId !== id(6) ||
                  x.expectedVersion !== 1
                )
                  throw Error(
                    "Exact saved meeting and current version required"
                  );
                Object.assign(meeting, {
                  status: "confirmed",
                  version: 2,
                  confirmed_start_at: x.startsAt,
                  confirmed_end_at: x.endsAt,
                });
                result = {
                  modelOutput: `${formatCoordinatedMeeting(meeting)}\nCalendar delivery created using ${c.personalCalendar ? "personal" : "Harper shared"} Calendar. Invitations submitted to candidate and company attendees. Meet: https://meet.google.com/abc-defg-hij. Attendee RSVP unknown.`,
                };
              } else
                throw Error(`Unsupported fixture meeting action ${x.action}`);
            } else if (
              [
                "read_talent",
                "get_talents",
                "read_role",
                "read_agent_messages",
                "read_conversation_history",
                "list_contacts",
              ].includes(args.name)
            )
              result = {
                modelOutput: `김지민 talent ${id(4)}, Role ${id(2)}, recommendation ${id(5)}; connected, consent active; introduction ${id(9)}. ${c.origin === "candidate_event" ? c.message : "No prior meeting correspondence."}`,
              };
            else if (args.name === "contact_talent") {
              if (x.action !== "send_to_agent")
                throw Error("Existing agent relationship: use correspondence");
              result = {
                modelOutput:
                  "Candidate-agent message saved and receiver queued; human reply not yet received.",
              };
            } else if (
              ["contact_user", "send_company_message"].includes(args.name)
            )
              result = {
                modelOutput:
                  "Company message submitted to the authorized audience; human readership unknown.",
              };
            else throw Error(`Unexpected fixture tool: ${args.name}`);
            trace.at(-1).result = result;
            save(`${c.id}-trace`, trace);
            return result;
          },
        }
      );
      save(`${c.id}-result`, result);
      console.log(
        c.id,
        JSON.stringify({
          reply: result.reply,
          calls: trace.map((t) => [t.tool, t.input.action]),
        })
      );
    } catch (error) {
      save(`${c.id}-error`, { message: String(error), trace });
      throw error;
    }
  }
  console.log(`Artifacts: ${dir}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
