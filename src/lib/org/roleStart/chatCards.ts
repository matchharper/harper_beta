import "server-only";

import { insertOrgAgentMessage } from "@/lib/org/agent/store";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import { buildOrgHref } from "@/lib/org/routes";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { RoleStartChip, RoleStartQuestion } from "./session";

/**
 * Role chat cards for the role start questions. The chat and the role start screens read
 * the same question state; a card is a view of the open question, and a chip
 * answer is written back as the team's own message.
 */

async function roleConversation(roleId: string, workspaceId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.from("company_conversations" as any) as any)
    .select("id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at")
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();
  if (error) throw error;
  return data ? { admin, conversation: data as OrgAgentConversationRow } : null;
}

async function findCard(roleId: string, workspaceId: string, questionId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.from("company_messages" as any) as any)
    .select("id, metadata")
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .eq("message_type", "chat")
    .contains("metadata", { roleStartQuestion: { questionId } })
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] as { id: number; metadata: Record<string, unknown> } | undefined;
}

export async function postRoleStartQuestionCard(args: {
  roleId: string;
  workspaceId: string;
  question: RoleStartQuestion;
}) {
  const target = await roleConversation(args.roleId, args.workspaceId);
  if (!target) return null;
  if (await findCard(args.roleId, args.workspaceId, args.question.id)) return null;
  return insertOrgAgentMessage({
    admin: target.admin,
    content: `${args.question.question}\n\n${args.question.why}`,
    conversation: target.conversation,
    metadata: {
      roleStartQuestion: {
        questionId: args.question.id,
        chips: args.question.chips.map((chip) => ({ id: chip.id, label: chip.label })),
        status: "pending",
      },
    },
    role: "assistant",
    roleId: args.roleId,
  });
}

/**
 * Closes the card and, for a chip or skip, records the team's choice as their
 * own message. A free-text answer is already the team's chat message.
 */
export async function recordRoleStartAnswerInChat(args: {
  roleId: string;
  workspaceId: string;
  question: RoleStartQuestion;
  chip: RoleStartChip | null;
  skipped: boolean;
  /** The answer text when it was typed outside the chat (the role start screens or Slack). */
  text: string | null;
  /** True when the answer came from the team's own chat message. */
  fromChat: boolean;
  userId: string;
}) {
  const target = await roleConversation(args.roleId, args.workspaceId);
  if (!target) return;
  const card = await findCard(args.roleId, args.workspaceId, args.question.id);
  if (card) {
    const metadata = card.metadata ?? {};
    const current = (metadata.roleStartQuestion ?? {}) as Record<string, unknown>;
    const { error } = await (target.admin.from("company_messages" as any) as any)
      .update({
        metadata: {
          ...metadata,
          roleStartQuestion: {
            ...current,
            status: args.skipped ? "skipped" : "answered",
            answeredChipId: args.chip?.id ?? null,
          },
        },
      })
      .eq("id", card.id);
    if (error) throw error;
  }
  if (args.fromChat) return;
  await insertOrgAgentMessage({
    admin: target.admin,
    content: args.chip?.label ?? args.text ?? "건너뛰기",
    conversation: target.conversation,
    role: "user",
    roleId: args.roleId,
    userId: args.userId,
  });
}

/** One Harper line in the role chat when registration is done: who went to the inbox. No Slack. */
export async function postRoleStartRegisteredMessage(args: { roleId: string; workspaceId: string; kept: number; picked: number }) {
  const target = await roleConversation(args.roleId, args.workspaceId);
  if (!target) return null;
  const admin = getSupabaseAdmin();
  const { data } = await (admin.from("company_messages" as any) as any)
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .not("metadata->roleStartRegistered", "is", null)
    .limit(1);
  if ((data ?? []).length) return null;
  const parts = [
    ...(args.kept ? [`첫 3명 중 ${args.kept}명`] : []),
    ...(args.picked ? [`평가를 반영한 추천 ${args.picked}명`] : []),
  ];
  return insertOrgAgentMessage({
    admin: target.admin,
    content: parts.length
      ? `온보딩을 마쳤어요. ${parts.join("과 ")}을 인박스에 넣었어요.`
      : "온보딩을 마쳤어요. 지금 인박스에 넣은 후보는 없고, 정기 추천에서 이어서 찾아볼게요.",
    conversation: target.conversation,
    metadata: { roleStartRegistered: { kept: args.kept, picked: args.picked } },
    role: "assistant",
    roleId: args.roleId,
  });
}

export async function postRoleStartBriefReadyCard(args: { roleId: string; workspaceId: string }) {
  const target = await roleConversation(args.roleId, args.workspaceId);
  if (!target) return null;
  const admin = getSupabaseAdmin();
  const { data } = await (admin.from("company_messages" as any) as any)
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .not("metadata->roleStartBriefReady", "is", null)
    .limit(1);
  if ((data ?? []).length) return null;
  return insertOrgAgentMessage({
    admin: target.admin,
    // Exact navigation card; the chat agent explains further on its next turn.
    content: "질문을 마쳤어요. Brief를 확인하고 확정하면 첫 후보를 보여 드려요.",
    conversation: target.conversation,
    metadata: {
      roleStartBriefReady: {
        href: buildOrgHref({ orgId: args.workspaceId, page: "role", roleId: args.roleId, tab: "start" }),
      },
    },
    role: "assistant",
    roleId: args.roleId,
  });
}

export async function closeRoleStartQuestionCard(args: { roleId: string; workspaceId: string; questionId: string }) {
  const card = await findCard(args.roleId, args.workspaceId, args.questionId);
  if (!card) return;
  const metadata = card.metadata ?? {};
  const current = (metadata.roleStartQuestion ?? {}) as Record<string, unknown>;
  if (current.status !== "pending") return;
  const { error } = await (getSupabaseAdmin().from("company_messages" as any) as any)
    .update({ metadata: { ...metadata, roleStartQuestion: { ...current, status: "closed" } } })
    .eq("id", card.id);
  if (error) throw error;
}
