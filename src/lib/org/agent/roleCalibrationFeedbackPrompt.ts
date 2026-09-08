import { COMPANY_ROLE_CALIBRATION_PROFILE_IDS } from "@/lib/org/roleCalibration";

export type RoleCalibrationFeedbackDraft = {
  finishCalibration: boolean;
  hiringBrief: string | null;
  reviews: Array<{
    profileId: (typeof COMPANY_ROLE_CALIBRATION_PROFILE_IDS)[number];
    reason: string | null;
    status: "good" | "bad";
  }>;
  summary: string;
  userReply: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildRoleCalibrationFeedbackSystemPrompt() {
  return `ROLE
You apply a company's natural-language reaction to a small set of profile examples prepared for one Role.

GOAL
Record only the profile judgments the user actually made and, when the user supplied a portable job-related reason, make the smallest corresponding change to the complete Hiring Brief.

SUCCESS CRITERIA
- Resolve profile labels and displayed names only from the supplied calibration set and conversation.
- Return one latest Good or Bad review for every profile the current user evaluated. A single message may evaluate several profiles.
- Preserve the user's reason in a concise faithful form. Do not invent a reason from the profile.
- A reasonless Good or Bad changes only the profile status and never changes the Hiring Brief.
- When a reason supports a future-candidate rule, return the complete updated Hiring Brief while preserving all unrelated requirements and wording.
- Generalize a reason into the smallest reusable matching rule. Do not save the display name, Profile A-E label, source identity, or calibration provenance in the Hiring Brief.
- Feedback never changes the source candidate, recommendation, fit, contact, or pipeline state.

EVIDENCE
The user's current statement is authoritative. Earlier profile facts explain what the statement refers to, but they do not create preferences on their own. Good and Bad are judgments on these examples, not connection acceptance or rejection decisions.

OUTPUT
Use the user's latest language. reviews may be empty only when the target or judgment is genuinely ambiguous; in that case userReply asks one focused question. Set hiringBrief to null when no supported Hiring Brief change is needed. Set finishCalibration=true only when the user explicitly says this review is finished; all profiles being reviewed is handled by the application. summary is a short factual record. userReply states exactly which profiles were recorded and whether the Hiring Brief changed, without reproducing the full Hiring Brief.

Return only the required JSON object.`;
}

export function buildRoleCalibrationFeedbackUserPrompt(input: {
  calibration: unknown;
  companyContext: string;
  companySideContext: string;
  currentHiringBrief: string | null;
  roleDescription: string | null;
  roleName: string;
  userMessage: string;
}) {
  return [
    "<authoritative_role>",
    JSON.stringify(
      {
        companyContext: text(input.companyContext).slice(0, 12_000),
        currentHiringBrief:
          text(input.currentHiringBrief).slice(0, 12_000) || null,
        roleDescription: text(input.roleDescription).slice(0, 12_000) || null,
        roleName: text(input.roleName).slice(0, 240),
      },
      null,
      2
    ),
    "</authoritative_role>",
    "<calibration_profiles>",
    JSON.stringify(input.calibration, null, 2).slice(0, 36_000),
    "</calibration_profiles>",
    "<conversation_context>",
    text(input.companySideContext).slice(0, 32_000),
    "</conversation_context>",
    "<current_user_feedback>",
    text(input.userMessage).slice(0, 8_000),
    "</current_user_feedback>",
  ].join("\n");
}

export function parseRoleCalibrationFeedbackDraft(
  value: unknown
): RoleCalibrationFeedbackDraft {
  const source =
    typeof value === "string" ? object(JSON.parse(value)) : object(value);
  const reviews = (Array.isArray(source.reviews) ? source.reviews : []).map(
    (value) => {
      const review = object(value);
      const profileId = text(review.profileId);
      if (
        !COMPANY_ROLE_CALIBRATION_PROFILE_IDS.includes(
          profileId as (typeof COMPANY_ROLE_CALIBRATION_PROFILE_IDS)[number]
        )
      ) {
        throw new Error("Calibration feedback returned an invalid profile ID");
      }
      if (review.status !== "good" && review.status !== "bad") {
        throw new Error("Calibration feedback returned an invalid status");
      }
      const reason = text(review.reason) || null;
      if (reason && reason.length > 1_000) {
        throw new Error("Calibration feedback reason is too long");
      }
      return {
        profileId:
          profileId as (typeof COMPANY_ROLE_CALIBRATION_PROFILE_IDS)[number],
        reason,
        status: review.status as "good" | "bad",
      };
    }
  );
  if (
    new Set(reviews.map((review) => review.profileId)).size !== reviews.length
  ) {
    throw new Error("Calibration feedback returned duplicate profile IDs");
  }
  const hiringBrief = text(source.hiringBrief) || null;
  const summary = text(source.summary);
  const userReply = text(source.userReply);
  if (!summary || summary.length > 600) {
    throw new Error("Calibration feedback returned an invalid summary");
  }
  if (!userReply || userReply.length > 1_500) {
    throw new Error("Calibration feedback returned an invalid user reply");
  }
  if (hiringBrief && hiringBrief.length > 12_000) {
    throw new Error("Calibration feedback Hiring Brief is too long");
  }
  if (hiringBrief && !reviews.some((review) => review.reason)) {
    throw new Error("Reasonless calibration feedback changed the Hiring Brief");
  }
  return {
    finishCalibration: source.finishCalibration === true,
    hiringBrief,
    reviews,
    summary,
    userReply,
  };
}

export const ROLE_CALIBRATION_FEEDBACK_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    finishCalibration: { type: "boolean" },
    hiringBrief: { maxLength: 12_000, type: ["string", "null"] },
    reviews: {
      items: {
        additionalProperties: false,
        properties: {
          profileId: {
            enum: COMPANY_ROLE_CALIBRATION_PROFILE_IDS,
            type: "string",
          },
          reason: { maxLength: 1_000, type: ["string", "null"] },
          status: { enum: ["good", "bad"], type: "string" },
        },
        required: ["profileId", "status", "reason"],
        type: "object",
      },
      maxItems: 5,
      type: "array",
    },
    summary: { maxLength: 600, minLength: 1, type: "string" },
    userReply: { maxLength: 1_500, minLength: 1, type: "string" },
  },
  required: [
    "reviews",
    "hiringBrief",
    "finishCalibration",
    "summary",
    "userReply",
  ],
  type: "object",
} as const;
