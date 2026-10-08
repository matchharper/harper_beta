import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import type { OrgLocale } from "@/i18n/org/locale";
import type { PublicMeetingSlot } from "@/lib/meetings/invitation";

export type MeetingAutoSelection = {
  chosenSlotId: string;
  companyMessage: string;
  method: "fallback_earliest" | "llm" | "single_option";
  model: string | null;
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

function clean(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function formatOptionList(
  slots: PublicMeetingSlot[],
  timezone: string,
  locale: OrgLocale
) {
  const formatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "ko-KR",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }
  );
  return slots
    .map(
      (slot) =>
        `${slot.slotId}: ${formatter.format(new Date(slot.startAt))} – ${formatter.format(new Date(slot.endAt))}`
    )
    .join("\n");
}

function deterministicCompanyMessage(args: {
  candidateName: string;
  chosen: PublicMeetingSlot;
  locale?: OrgLocale;
  options: PublicMeetingSlot[];
  timezone: string;
}) {
  const dateFormatter = new Intl.DateTimeFormat(
    args.locale === "en" ? "en-US" : "ko-KR",
    {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: args.timezone,
    }
  );
  if (args.locale === "en")
    return `${args.candidateName} shared ${args.options.length} available ${args.options.length === 1 ? "time" : "times"}. Harper selected ${dateFormatter.format(new Date(args.chosen.startAt))}. Ask Harper if you'd like to change it.`;
  return `${args.candidateName}님이 ${args.options.length}개의 가능 시간을 알려주셨고, ${dateFormatter.format(new Date(args.chosen.startAt))}가 가장 적절해 해당 시간으로 미팅을 잡아두었어요. 변경을 원하시면 말씀해 주세요.`;
}

export function selectMeetingOptionDeterministically(args: {
  candidateName: string;
  locale?: OrgLocale;
  reportedOptions?: PublicMeetingSlot[];
  timezone: string;
  validOptions: PublicMeetingSlot[];
}): MeetingAutoSelection {
  if (args.validOptions.length === 0) {
    throw new Error("At least one valid meeting option is required");
  }
  const reportedOptions = args.reportedOptions ?? args.validOptions;
  const chosen = [...args.validOptions].sort((left, right) =>
    left.startAt.localeCompare(right.startAt)
  )[0];
  return {
    chosenSlotId: chosen.slotId,
    companyMessage: deterministicCompanyMessage({
      candidateName: args.candidateName,
      chosen,
      locale: args.locale,
      options: reportedOptions,
      timezone: args.timezone,
    }),
    method:
      reportedOptions.length === 1 ? "single_option" : "fallback_earliest",
    model: null,
  };
}

export async function selectMeetingOption(args: {
  additionalMessage: string | null;
  candidateName: string;
  locale?: OrgLocale;
  options: PublicMeetingSlot[];
  timezone: string;
}) {
  if (args.options.length === 0) {
    throw new Error("At least one meeting option is required");
  }
  const fallback = selectMeetingOptionDeterministically({
    candidateName: args.candidateName,
    locale: args.locale,
    timezone: args.timezone,
    validOptions: args.options,
  });
  if (args.options.length === 1) return fallback;

  try {
    const { model, response } = await createChatCompletionWithFallback({
      buildRequest: (activeModel) => ({
        ...(usesMaxCompletionTokensForModel(activeModel)
          ? { max_completion_tokens: 700 }
          : { max_tokens: 700 }),
        messages: [
          {
            role: "system",
            content: [
              "Choose exactly one interview time from the candidate's valid options.",
              "Use the approved scheduling note as a preference, not permission to invent constraints.",
              "When no preference distinguishes the options, choose the earliest one.",
              'Return JSON only: {"chosenSlotId":"...","companyMessage":"..."}.',
              `The companyMessage must be one short natural ${args.locale === "en" ? "English" : "Korean"} message saying which options the candidate gave, which time was selected, and that the company can ask to change it.`,
              "Do not claim that a Calendar event, Google Meet link, or email has been sent.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Candidate: ${clean(args.candidateName, 80)}`,
              `Timezone: ${args.timezone}`,
              `Approved scheduling note: ${clean(args.additionalMessage, 2_000) || "-"}`,
              `Valid candidate options:\n${formatOptionList(args.options, args.timezone, args.locale ?? "ko")}`,
            ].join("\n\n"),
          },
        ],
        response_format: { type: "json_object" },
      }),
      debugLabel: "meetings:auto-selection",
      model: GPT_6_LUNA_MODEL,
      openAIResponses: { reasoningEffort: "low" },
    });
    const parsed = JSON.parse(
      assistantText(response)
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
    ) as Record<string, unknown>;
    const chosenSlotId = clean(parsed.chosenSlotId, 200);
    const companyMessage = clean(parsed.companyMessage, 800);
    if (
      !args.options.some((option) => option.slotId === chosenSlotId) ||
      !companyMessage
    ) {
      throw new Error("Meeting selection output is invalid");
    }
    return {
      chosenSlotId,
      companyMessage,
      method: "llm",
      model,
    } satisfies MeetingAutoSelection;
  } catch (error) {
    console.warn("[meetings:auto-selection:fallback]", {
      error: getLlmErrorMessage(error),
    });
    return fallback;
  }
}
