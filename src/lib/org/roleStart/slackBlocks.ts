import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import type { RoleStartQuestion, RoleStartSession } from "./session";

/** Slack blocks and action values for role start questions (no network or database). */

export const ROLE_START_SLACK_BLOCK_PREFIX = "harper_role_start:";
export const ROLE_START_SLACK_CHIP_ACTION = "harper_role_start_chip:";
export const ROLE_START_SLACK_SKIP_ACTION = "harper_role_start_skip";
export const ROLE_START_SLACK_LINK_ACTION = "harper_role_start_link";

export type RoleStartSlackActionValue = {
  roleId: string;
  questionId: string;
  chipId: string | null;
};

export function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function encodeRoleStartSlackValue(value: RoleStartSlackActionValue) {
  return JSON.stringify(value);
}

export function decodeRoleStartSlackValue(value: unknown): RoleStartSlackActionValue | null {
  try {
    const parsed = JSON.parse(String(value ?? "")) as Record<string, unknown>;
    const roleId = String(parsed.roleId ?? "");
    const questionId = String(parsed.questionId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(roleId) || !questionId) return null;
    return { roleId, questionId, chipId: parsed.chipId ? String(parsed.chipId) : null };
  } catch {
    return null;
  }
}

export function buildRoleStartQuestionBlocks(session: RoleStartSession): HarperSlackBlock[] {
  const question = session.pendingQuestion;
  if (!question) return [];
  const value = (chipId: string | null) =>
    encodeRoleStartSlackValue({ roleId: session.roleId, questionId: question.id, chipId });
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: question.why.trim()
          ? `*${escape(question.question)}*\n_${escape(question.why)}_`
          : `*${escape(question.question)}*`,
      },
    },
    {
      type: "actions",
      block_id: `${ROLE_START_SLACK_BLOCK_PREFIX}${question.id}`,
      elements: [
        ...question.chips.slice(0, 5).map((chip, index) => ({
          type: "button",
          action_id: `${ROLE_START_SLACK_CHIP_ACTION}${index}`,
          text: { type: "plain_text", text: chip.label.slice(0, 75), emoji: true },
          value: value(chip.id),
        })),
        {
          type: "button",
          action_id: ROLE_START_SLACK_SKIP_ACTION,
          text: { type: "plain_text", text: "건너뛰기", emoji: true },
          value: value(null),
        },
      ],
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "버튼을 누르거나 이 스레드에 직접 답을 적어 주세요." }],
    },
  ];
}

/** The question card once answered: the question stays, the buttons give way to the answer. */
export function answeredQuestionBlocks(question: Pick<RoleStartQuestion, "question" | "why">, answer: string): HarperSlackBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: `*${escape(question.question)}*\n_${escape(question.why)}_` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `✓ *${escape(answer.slice(0, 200))}*` }] },
  ];
}
