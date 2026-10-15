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
  companyMessage: null;
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
    companyMessage: null,
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
              'Return JSON only: {"chosenSlotId":"..."}.',
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
    if (
      !args.options.some((option) => option.slotId === chosenSlotId)
    ) {
      throw new Error("Meeting selection output is invalid");
    }
    return {
      chosenSlotId,
      companyMessage: null,
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
