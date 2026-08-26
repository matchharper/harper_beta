import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

import {
  createChatCompletionWithFallback,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { CLAUDE_MODEL, GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { generateMeetingInvitationEmail } from "@/lib/meetings/invitationCopy";
import {
  formatPreparedMeetingScheduleConfirmation,
  type PreparedMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraft";
import { serializeOrgAgentToolResult } from "@/lib/org/agent/promptFormat";
import { getSlackOrgAgentModel } from "@/lib/org/agent/modelConfig";
import { buildOrgAgentSystemPrompt } from "@/lib/org/agent/prompts";

type CompanyCase = {
  history: string;
  id: string;
  latestMessage: string;
  toolName:
    | "decide_candidate_connection"
    | "manage_interview_availability"
    | "prepare_candidate_connection";
  toolResult: Record<string, unknown>;
};

type InvitationCase = Parameters<typeof generateMeetingInvitationEmail>[0] & {
  id: string;
};

function assistantText(response: any) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => String(item?.text ?? item?.content ?? ""))
    .join("")
    .trim();
}

function availability(overrides: Partial<PreparedMeetingScheduleDraft> = {}) {
  const organizer = {
    companyUserId: "company-user-daniel",
    email: "daniel@wonderful.com",
    name: "Daniel",
  };
  return {
    additionalMessage: null,
    availability: {
      dateOverrides: {
        "2026-08-28": [],
        "2026-09-02": [{ end: "12:00", start: "08:00" }],
      },
      timezone: "Asia/Seoul",
      updatedAt: "2026-08-26T00:00:00.000Z",
      version: 3,
      weeklyRules: {
        "1": [{ end: "19:00", start: "08:00" }],
        "2": [{ end: "19:00", start: "08:00" }],
        "3": [{ end: "19:00", start: "08:00" }],
        "4": [{ end: "19:00", start: "08:00" }],
        "5": [{ end: "19:00", start: "08:00" }],
        "6": [],
        "7": [],
      },
    },
    config: {
      companyAttendees: [organizer],
      conferenceProvider: "google_meet" as const,
      durationMinutes: 60,
      offerWindowDays: 14,
      organizer,
      title: "Wonderful <> 김호진 Intro",
    },
    draftBlocker: null,
    ...overrides,
  } satisfies PreparedMeetingScheduleDraft;
}

const availabilityLink =
  "<https://matchharper.com/org/settings?dialog=interview-availability|스케줄 열기>";

const readyConfirmation = formatPreparedMeetingScheduleConfirmation({
  candidateName: "김호진",
  draft: availability(),
});
const missingConfirmation = formatPreparedMeetingScheduleConfirmation({
  availabilityActionLink: availabilityLink,
  candidateName: "김호진",
  draft: availability({
    availability: null,
    draftBlocker: "availability_missing",
  }),
});
const internalNoteConfirmation = formatPreparedMeetingScheduleConfirmation({
  candidateName: "김호진",
  draft: availability({
    additionalMessage: {
      sourceText: "최대한 빠른 시간으로 잡아주기를 요청함",
      visibility: "internal",
    },
  }),
});

const companyCases: CompanyCase[] = [
  {
    history: "처음으로 이 후보자의 일정 조율을 요청하는 상황",
    id: "company_missing_availability_first_turn",
    latestMessage: "Wonderful FDE 역할의 김호진님과 바로 미팅 잡아줘.",
    toolName: "prepare_candidate_connection",
    toolResult: {
      candidateName: "김호진",
      connectionMethod: "schedule_interview",
      decision: "accept",
      meetingDraft: { draftBlocker: "availability_missing" },
      meetingScheduleConfirmation: missingConfirmation,
      meetingAvailabilityUrl:
        "https://matchharper.com/org/settings?dialog=interview-availability",
      status: "meeting_setup_required",
    },
  },
  {
    history:
      "Harper: 김호진님과의 미팅을 조율하려면 가능한 시간을 먼저 알려주세요.\n회사 사용자 김호진: 매일 오전 7시부터 오후 8시까지 가능해.",
    id: "company_availability_saved_same_names",
    latestMessage: "매일 오전 7시부터 오후 8시까지 가능해.",
    toolName: "manage_interview_availability",
    toolResult: {
      availabilityVersion: 4,
      meetingAvailabilityUrl:
        "https://matchharper.com/org/settings?dialog=interview-availability",
      nextProcess:
        "The visible conversation identifies candidate 김호진 in the Wonderful FDE role. Ask whether to prepare that meeting now.",
      responseGuidance:
        "Acknowledge the hours as the times Harper will use. Do not require a magic retry phrase. Only say that candidate 김호진 has not been contacted yet.",
      status: "updated",
      summary: "매일 07:00–20:00 · Asia/Seoul",
      timezone: "Asia/Seoul",
    },
  },
  {
    history: "Daniel님이 평일 가능 시간을 미리 설정해둔 상황",
    id: "company_ready_standard",
    latestMessage: "김호진님 미팅 잡아줘.",
    toolName: "prepare_candidate_connection",
    toolResult: {
      candidateName: "김호진",
      connectionMethod: "schedule_interview",
      decision: "accept",
      meetingDraft: availability(),
      meetingScheduleConfirmation: readyConfirmation,
      meetingAvailabilityUrl:
        "https://matchharper.com/org/settings?dialog=interview-availability",
      status: "decision_context_ready",
    },
  },
  {
    history: "Daniel님이 후보자에게는 긴급함을 알리지 말아달라고 한 상황",
    id: "company_ready_internal_urgency",
    latestMessage:
      "김호진님 미팅 잡아줘. 최대한 빠른 시간으로 고르되 이 말은 후보자에게 보내지 마.",
    toolName: "prepare_candidate_connection",
    toolResult: {
      candidateName: "김호진",
      connectionMethod: "schedule_interview",
      decision: "accept",
      meetingDraft: availability({
        additionalMessage: {
          sourceText: "최대한 빠른 시간으로 잡아주기를 요청함",
          visibility: "internal",
        },
      }),
      meetingScheduleConfirmation: internalNoteConfirmation,
      status: "decision_context_ready",
    },
  },
  {
    history:
      "Harper가 60분, Daniel 참석, 향후 2주, Google Meet으로 준비할지 물었고 Daniel님이 그대로 진행하라고 승인함",
    id: "company_after_prepare_success",
    latestMessage: "응, 그렇게 진행해줘.",
    toolName: "decide_candidate_connection",
    toolResult: {
      candidateName: "김호진",
      changeSummary:
        "김호진님과 연결했고, 60분 미팅 정보를 준비해두었어요. 아직 김호진님께 일정 선택 메일은 보내지 않았어요.",
      connectionMethod: "schedule_interview",
      decision: "accept",
      meetingDraft: availability(),
      meetingScheduleUrl:
        "https://matchharper.com/org/inbox?dialog=interview-schedule&scheduleId=schedule-1",
      nextProcess:
        "일정 화면에서 후보자에게 보낼 이메일을 확인하고 보내면, 후보자가 가능한 시간을 고를 수 있어요.",
      responseGuidance:
        "Say naturally that the candidate is connected and meeting details are ready. Include the schedule link and ask the user to review the candidate email before sending it.",
      roleName: "FDE",
      stage: "connected",
      status: "updated",
    },
  },
  {
    history:
      "Daniel님이 이미 미팅안을 확인했고, 참석자로 Mina도 추가해 45분으로 바꾸어 달라고 요청함",
    id: "company_revised_proposal",
    latestMessage:
      "45분으로 하고 mina@wonderful.com도 참석자로 추가해줘. 후보자에게는 가능한 한 빠르게 부탁한다고 말해줘.",
    toolName: "prepare_candidate_connection",
    toolResult: {
      candidateName: "김호진",
      connectionMethod: "schedule_interview",
      decision: "accept",
      meetingDraft: availability({
        additionalMessage: {
          sourceText: "가능하면 가장 빠른 시간으로 부탁드린다고 합니다.",
          visibility: "candidate",
        },
        config: {
          ...availability().config,
          companyAttendees: [
            availability().config.organizer,
            {
              companyUserId: "company-user-mina",
              email: "mina@wonderful.com",
              name: "Mina",
            },
          ],
          durationMinutes: 45,
        },
      }),
      meetingScheduleConfirmation: formatPreparedMeetingScheduleConfirmation({
        candidateName: "김호진",
        draft: availability({
          additionalMessage: {
            sourceText: "가능하면 가장 빠른 시간으로 부탁드린다고 합니다.",
            visibility: "candidate",
          },
          config: {
            ...availability().config,
            companyAttendees: [
              availability().config.organizer,
              {
                companyUserId: "company-user-mina",
                email: "mina@wonderful.com",
                name: "Mina",
              },
            ],
            durationMinutes: 45,
          },
        }),
      }),
      status: "decision_context_ready",
    },
  },
];

const invitationCases: InvitationCase[] = [
  {
    candidateMessage: "가능하면 가장 빠른 시간으로 부탁드린다고 합니다.",
    candidateName: "김호진",
    companyName: "Wonderful",
    durationMinutes: 60,
    id: "invitation_ko_standard_urgent",
    locale: "ko-KR",
    organizerName: "Daniel",
    roleName: "FDE",
  },
  {
    candidateMessage: null,
    candidateName: "김호진",
    companyName: "Wonderful Japan",
    durationMinutes: 60,
    id: "invitation_ko_no_note",
    locale: "ko",
    organizerName: "Richard Fukuda",
    roleName: "Forward Deployed Engineer",
  },
  {
    candidateMessage: "최대한 빠른 시간으로 잡아주기를 요청함",
    candidateName: "김호진",
    companyName: "Harper",
    durationMinutes: 45,
    id: "invitation_ko_shorthand_note",
    locale: "ko-KR",
    organizerName: "Daniel",
    roleName: "Product Engineer",
  },
  {
    candidateMessage:
      "이번 주 목요일과 금요일 오후 4시 이후는 피해서 골라주시면 감사하겠습니다.",
    candidateName: "박민지",
    companyName: "Acme AI",
    durationMinutes: 30,
    id: "invitation_ko_date_constraint",
    locale: "ko",
    organizerName: "서준",
    roleName: "Founding Designer",
  },
  {
    candidateMessage:
      "If possible, we would appreciate the earliest available time.",
    candidateName: "Ito",
    companyName: "Wonderful Japan",
    durationMinutes: 60,
    id: "invitation_en_standard",
    locale: "en-US",
    organizerName: "Richard Fukuda",
    roleName: "FDE",
  },
  {
    candidateMessage: null,
    candidateName: "Alex",
    companyName: "Harper",
    durationMinutes: 45,
    id: "invitation_en_no_note",
    locale: "en",
    organizerName: "Daniel",
    roleName: "Product Engineer",
  },
];

async function runCompanyCase(item: CompanyCase) {
  const serialized = serializeOrgAgentToolResult(
    item.toolName,
    item.toolResult
  );
  const completion = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: null,
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: 1_200 }
        : { max_tokens: 1_200 }),
      messages: [
        {
          role: "system",
          content: buildOrgAgentSystemPrompt({ surface: "slack" }),
        },
        {
          role: "user",
          content: [
            "다음은 실제 회사 측 Slack 일정 조율 대화의 마지막 단계다.",
            `대화 맥락: ${item.history}`,
            `현재 사용자 메시지: ${item.latestMessage}`,
            "아래 authoritative tool result의 사실만 사용한다.",
            serialized,
            "Tool use is finished for this turn. 실제 사용자에게 보낼 최종 답변만 작성한다.",
          ].join("\n\n"),
        },
      ],
    }),
    debugLabel: `meetings:copy-eval:${item.id}`,
    fallbackModel: null,
    model: getSlackOrgAgentModel(),
    signal: AbortSignal.timeout(60_000),
  });
  return {
    id: item.id,
    model: completion.model,
    output: assistantText(completion.response),
    type: "company" as const,
  };
}

async function runInvitationCase(
  item: InvitationCase,
  model: string = GPT_56_LUNA_MODEL
) {
  const { id, ...args } = item;
  return {
    id,
    model,
    output: await generateMeetingInvitationEmail(
      {
        ...args,
        signal: AbortSignal.timeout(60_000),
      },
      { model }
    ),
    type: "invitation" as const,
  };
}

async function main() {
  const print = (
    output:
      | Awaited<ReturnType<typeof runCompanyCase>>
      | Awaited<ReturnType<typeof runInvitationCase>>
  ) => {
    console.log(
      `\n===== ${output.id} | ${output.type} | ${output.model} =====`
    );
    console.log(
      typeof output.output === "string"
        ? output.output
        : `SUBJECT: ${output.output.subject}\n\n${output.output.body}\n\nCANDIDATE_MESSAGE: ${output.output.candidateMessage ?? "-"}`
    );
  };
  if (process.argv.includes("--compare-invitation-models")) {
    for (const item of invitationCases.slice(0, 3)) {
      print(await runInvitationCase(item, GPT_56_LUNA_MODEL));
      print(await runInvitationCase(item, CLAUDE_MODEL));
    }
    return;
  }
  if (process.argv.includes("--final-smoke")) {
    print(await runCompanyCase(companyCases[1]));
    print(await runInvitationCase(invitationCases[0]));
    print(await runInvitationCase(invitationCases[2]));
    return;
  }
  for (const item of companyCases) print(await runCompanyCase(item));
  for (const item of invitationCases) print(await runInvitationCase(item));
}

void main();
