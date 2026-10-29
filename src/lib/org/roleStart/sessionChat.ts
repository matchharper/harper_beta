import "server-only";

import { buildOrgHref } from "@/lib/org/routes";
import type { roleStartSql } from "./db";
import type { RoleStartQuestion } from "./session";

export type SessionChatWrite = {
  workspaceId: string;
  questionId: string;
  status: "answered" | "skipped" | "closed";
  chipId?: string | null;
  /** null when the user's message was already saved by chat, or only closing a question. */
  answer: { userId: string; content: string } | null;
  nextQuestion: RoleStartQuestion | null;
  briefReady: boolean;
};

export function roleStartQuestionMessage(question: RoleStartQuestion) {
  return {
    content: `${question.question}\n\n${question.why}`,
    metadata: { roleStartQuestion: {
      questionId: question.id, chips: question.chips.map(({ id, label }) => ({ id, label })), status: "pending" as const,
    } },
  };
}

export function roleStartBriefReadyMessage(roleId: string, workspaceId: string) {
  return {
    content: "질문을 마쳤어요. Brief를 확인하고 확정하면 첫 후보를 보여 드려요.",
    metadata: { roleStartBriefReady: {
      href: buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "start" }),
    } },
  };
}

/** CTEs gated by saved_session: the answer, navigation card and session commit together. */
export function sessionChatWrite(sql: ReturnType<typeof roleStartSql>, roleId: string, chat: SessionChatWrite) {
  const next = chat.nextQuestion;
  const card = next ? roleStartQuestionMessage(next)
    : chat.briefReady ? roleStartBriefReadyMessage(roleId, chat.workspaceId) : null;
  return sql`, chat_target as (
    select c.id, c.company_workspace_id, s.role_id
    from public.company_conversations c join saved_session s on s.role_id = c.role_id
    where c.company_workspace_id = ${chat.workspaceId}
  ), closed_card as (
    update public.company_messages m set metadata = jsonb_set(coalesce(m.metadata, '{}'::jsonb),
      '{roleStartQuestion}', coalesce(m.metadata->'roleStartQuestion', '{}'::jsonb) ||
        ${sql.json({ status: chat.status, answeredChipId: chat.chipId ?? null })}::jsonb)
    from chat_target c
    where m.conversation_id = c.id and m.message_type = 'chat'
      and m.metadata @> ${sql.json({ roleStartQuestion: { questionId: chat.questionId } })}::jsonb
  ), new_messages as (
    insert into public.company_messages
      (conversation_id, company_workspace_id, role_id, company_user_id, role, content,
       message_type, status, metadata, mentions, thinking_logs, created_at)
    select c.id, c.company_workspace_id, c.role_id, v.user_id, v.role, v.content,
      'chat', 'completed', v.metadata, '[]'::jsonb, '[]'::jsonb, now()
    from chat_target c cross join (values
      (0, ${chat.answer?.userId ?? null}::uuid, 'user', ${chat.answer?.content ?? null}::text, '{}'::jsonb),
      (1, null::uuid, 'assistant', ${card?.content ?? null}::text, ${sql.json(card?.metadata ?? {})}::jsonb)
    ) v(position, user_id, role, content, metadata)
    where v.content is not null and (v.position = 0 or not exists (
      select 1 from public.company_messages m where m.conversation_id = c.id and m.message_type = 'chat'
        and ${next
          ? sql`m.metadata @> ${sql.json({ roleStartQuestion: { questionId: next.id } })}::jsonb`
          : sql`m.metadata->'roleStartBriefReady' is not null`}
    ))
    order by v.position
    returning id, conversation_id, created_at
  ), updated_conversation as (
    update public.company_conversations c set last_message_id = m.id,
      last_message_at = m.created_at, updated_at = now()
    from (select distinct on (conversation_id) * from new_messages order by conversation_id, id desc) m
    where c.id = m.conversation_id and (c.last_message_id is null or c.last_message_id < m.id)
  )`;
}
