import "server-only";

import type { RoleCreationState } from "@/lib/org/agent/roleCreationState";
import { buildOrgHref } from "@/lib/org/routes";
import {
  postHarperSlackMessage,
  resolveHarperSlackInteractionContext,
  slackApi,
} from "@/lib/org/slackHarper";
import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { isRequired, levelLabel, levelOf, ROLE_START_GRADE_LABELS } from "./brief";
import { parseThinConditions, thinNoticeText } from "./widen";
import { roleStartSql } from "./db";
import { enqueueCompanyUpdate } from "@/lib/org/agent/companyUpdate.server";
import type { RoleStartQuestion, RoleStartSession } from "./session";
import {
  answeredQuestionBlocks,
  buildRoleStartQuestionBlocks,
  escape,
  ROLE_START_SLACK_BLOCK_PREFIX,
  ROLE_START_SLACK_LINK_ACTION,
} from "./slackBlocks";

export {
  answeredQuestionBlocks,
  buildRoleStartQuestionBlocks,
  decodeRoleStartSlackValue,
  encodeRoleStartSlackValue,
  ROLE_START_SLACK_BLOCK_PREFIX,
  ROLE_START_SLACK_CHIP_ACTION,
  ROLE_START_SLACK_LINK_ACTION,
  ROLE_START_SLACK_SKIP_ACTION,
  type RoleStartSlackActionValue,
} from "./slackBlocks";


function siteOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "https://matchharper.com";
  try {
    return new URL(/^https?:\/\//.test(configured) ? configured : `https://${configured}`).origin;
  } catch {
    return "https://matchharper.com";
  }
}

export function roleStartWebUrl(workspaceId: string, roleId: string) {
  return new URL(
    buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "start" }),
    `${siteOrigin()}/`
  ).toString();
}


async function threadTarget(state: RoleCreationState) {
  const link = state.metadata.slackRoleCreationThread;
  if (!link?.slackThreadId) return null;
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.from("company_slack_threads" as any) as any)
    .select("slack_thread_ts, channel:company_slack_channels!inner(slack_channel_id, slack_team_id, company_workspace_id, is_enabled)")
    .eq("id", link.slackThreadId)
    .maybeSingle();
  if (error) throw error;
  const channel = Array.isArray(data?.channel) ? data.channel[0] : data?.channel;
  if (!data || !channel || channel.is_enabled !== true || channel.company_workspace_id !== state.workspace.workspaceId) {
    return null;
  }
  const context = await resolveHarperSlackInteractionContext({
    channelId: channel.slack_channel_id,
    slackTeamId: channel.slack_team_id,
  });
  return { channelId: String(channel.slack_channel_id), threadTs: String(data.slack_thread_ts), token: context.token };
}



async function markQuestionPosted(roleId: string, questionId: string, slack: { channelId: string; ts: string }) {
  const sql = roleStartSql();
  await sql`
    update public.company_role_start_sessions
    set pending_question = jsonb_set(pending_question, '{slack}', ${sql.json(slack)})
    where role_id = ${roleId} and pending_question->>'id' = ${questionId}
  `;
}

export async function notifyRoleStartSlack(args: {
  kind: "question" | "brief_ready" | "first_three";
  session: RoleStartSession;
  state: RoleCreationState;
}) {
  const target = await threadTarget(args.state);
  if (!target) return false;
  const webUrl = roleStartWebUrl(args.session.workspaceId, args.session.roleId);
  const linkButton = (label: string): HarperSlackBlock => ({
    type: "actions",
    block_id: `${ROLE_START_SLACK_BLOCK_PREFIX}link`,
    elements: [
      {
        type: "button",
        action_id: ROLE_START_SLACK_LINK_ACTION,
        text: { type: "plain_text", text: label, emoji: true },
        url: webUrl,
      },
    ],
  });
  if (args.kind === "question") {
    const question = args.session.pendingQuestion;
    if (!question) return false;
    const posted = await postHarperSlackMessage({
      blocks: buildRoleStartQuestionBlocks(args.session),
      channelId: target.channelId,
      text: question.question,
      threadTs: target.threadTs,
      token: target.token,
    });
    if (posted.ts) await markQuestionPosted(args.session.roleId, question.id, { channelId: target.channelId, ts: posted.ts });
    return true;
  }
  // Results are told by the company-side LLM through the common company
  // update path; code only supplies verified facts, the exact list and the link.
  const linkBlock = linkButton(args.kind === "brief_ready" ? "웹에서 확인하기" : "웹에서 평가하기");
  if (args.kind === "brief_ready") {
    const brief = args.session.brief;
    // The same two groups as the web: 필수 조건 (facts and required criteria), then 평가 기준.
    const required = [...brief.hardConditions.map((item) => item.label), ...brief.criteria.filter(isRequired).map((item) => item.name)];
    const list = [
      required.length ? `*필수 조건*\n${required.map((label) => `• ${escape(label)}`).join("\n")}` : "",
      brief.criteria.some((item) => !isRequired(item))
        ? `*평가 기준*\n${brief.criteria
            .filter((item) => !isRequired(item))
            .map((item) => `• ${escape(item.name)} (${levelLabel(levelOf(item))})`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    await enqueueCompanyUpdate({
      workspaceId: args.session.workspaceId,
      roleId: args.session.roleId,
      eventKey: `role-start:${args.session.roleId}:brief-ready:${args.session.questions.history.length}`,
      purpose:
        "The role start questions are finished and the Brief draft is ready. Tell the team briefly; they review, edit and confirm it on the web, and confirming shows the first three candidates.",
      // Only what the team may read; no counts or internal values for the model to repeat.
      facts: {
        role: args.state.role.name,
        briefSummary: brief.summary,
        webLink: webUrl,
      },
      presentation: {
        text: list,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: list.slice(0, 2_900) } }, linkBlock],
      },
    });
    return true;
  }
  const candidates = args.session.firstCandidates;
  const list = candidates
    .map(
      (candidate) =>
        `• *${escape(candidate.name ?? "이름 비공개")}* ${escape(candidate.current ?? candidate.headline ?? "")}`
    )
    .join("\n")
    .concat(
      args.session.timings.thin === "true"
        ? `\n\n${escape(thinNoticeText(parseThinConditions(args.session.timings.thinConditions)))}`
        : ""
    );
  await enqueueCompanyUpdate({
    workspaceId: args.session.workspaceId,
    roleId: args.session.roleId,
    eventKey: `role-start:${args.session.roleId}:first-three:${String(args.session.timings.confirmedAt ?? "")}`,
    purpose:
      "The first candidates for the new role are ready. The team rates each one on the web and answers one open point; registering the role then applies the ratings and recommends one more person before the role starts.",
    facts: {
      role: args.state.role.name,
      overallReads: candidates.map((candidate) => ({
        name: candidate.name,
        harperRead: candidate.verdict?.finalFit
          ? ROLE_START_GRADE_LABELS[
              candidate.verdict.finalFit === "excellent"
                ? "excellent"
                : candidate.verdict.finalFit === "good"
                  ? "good"
                  : candidate.verdict.finalFit === "unfit"
                    ? "bad"
                    : "uncertain"
            ]
          : null,
      })),
      webLink: webUrl,
    },
    presentation: {
      text: list,
      blocks: [...(list ? [{ type: "section", text: { type: "mrkdwn", text: list.slice(0, 2_900) } }] : []), linkBlock],
    },
  });
  return true;
}

/** Replaces the answered question's buttons with who chose what. */

/** An answer given on the web or in chat closes the same question's Slack buttons. */
export async function closeRoleStartSlackQuestion(args: {
  state: RoleCreationState;
  question: RoleStartQuestion;
  answer: string;
}) {
  if (!args.question.slack) return;
  const target = await threadTarget(args.state);
  if (!target) return;
  await slackApi(target.token, "chat.update", {
    blocks: JSON.stringify(answeredQuestionBlocks(args.question, args.answer)),
    channel: args.question.slack.channelId,
    text: args.answer,
    ts: args.question.slack.ts,
  });
}

export async function markRoleStartSlackAnswered(args: {
  channelId: string;
  messageTs: string;
  token: string;
  originalBlocks: unknown;
  label: string;
  slackUserId: string;
}) {
  const blocks = (Array.isArray(args.originalBlocks) ? args.originalBlocks : []).filter(
    (block) =>
      !(
        block &&
        typeof block === "object" &&
        ((block as Record<string, unknown>).type === "actions" ||
          (block as Record<string, unknown>).type === "context")
      )
  ) as HarperSlackBlock[];
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `✓ <@${args.slackUserId}> → *${escape(args.label)}*` }],
  });
  await slackApi(args.token, "chat.update", {
    blocks: JSON.stringify(blocks),
    channel: args.channelId,
    text: args.label,
    ts: args.messageTs,
  });
}
