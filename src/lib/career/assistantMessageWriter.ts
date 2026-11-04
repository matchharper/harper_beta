import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { withIsMobile } from "@/lib/requestDevice";

/** One public text message per execution, updated in place across tool steps. */
export async function createCareerAssistantMessageWriter(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId: string;
  replyId: string;
  startedAt: string;
  isMobile?: boolean | null;
  check?: () => Promise<unknown>;
}) {
  const table = () => args.admin.from("talent_messages");
  const { data: previous, error } = await table()
    .select("*")
    .eq("user_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .eq("role", "assistant")
    .eq("payload->>careerTextReplyId", args.replyId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  let row = previous as TalentMessageRow | null;
  const previousPayload = row?.payload as Record<string, unknown> | null;
  let committed =
    row?.content.slice(
      0,
      typeof previousPayload?.workCommittedLength === "number"
        ? previousPayload.workCommittedLength
        : undefined
    ) ?? "";
  let segment = "";
  let lastWriteAt = 0;
  let writes = Promise.resolve<TalentMessageRow | null>(row);
  const join = (text: string) => [committed, text].filter(Boolean).join("\n\n");
  const save = (
    content: string,
    logs: string[],
    completed: boolean,
    payload: Record<string, unknown> = {}
  ) => {
    const committedLength = committed.length;
    writes = writes.then(async () => {
      if (!content.trim()) return row;
      if ((await args.check?.()) === false) return null;
      const values = {
        content,
        thinking_logs: logs,
        payload: {
          ...((row?.payload as Record<string, unknown>) ?? {}),
          ...payload,
          careerTextReplyId: args.replyId,
          workStartedAt: args.startedAt,
          workCompletedAt: completed ? new Date().toISOString() : null,
          workPending: !completed,
          workCommittedLength: committedLength,
        } as TalentMessageRow["payload"],
      };
      let query = row
        ? table()
            .update(values)
            .eq("id", row.id)
            .eq("user_id", args.userId)
            .eq("conversation_id", args.conversationId)
        : table().insert(
            withIsMobile(
              {
                ...values,
                conversation_id: args.conversationId,
                user_id: args.userId,
                role: "assistant",
                message_type: "chat",
              },
              args.isMobile
            )
          );
      const expectedStart = (
        row?.payload as Record<string, unknown> | undefined
      )?.workStartedAt;
      if (row && typeof expectedStart === "string")
        query = query.eq("payload->>workStartedAt", expectedStart);
      const result = await query.select("*").single();
      if (result.error || !result.data)
        throw result.error ?? new Error("Could not save Career reply");
      row = result.data as TalentMessageRow;
      lastWriteAt = Date.now();
      return row;
    });
    return writes;
  };
  return {
    // Coalesce provider tokens to the existing one-second status reconciliation
    // cadence. Tool boundaries and finalization always flush immediately.
    async delta(text: string, logs: string[]) {
      segment += text;
      if (Date.now() - lastWriteAt >= 1000)
        return save(join(segment), logs, false);
      return null;
    },
    async progress(text: string, logs: string[]) {
      committed = join(text);
      segment = "";
      return save(committed, logs, false);
    },
    async finish(
      text: string,
      logs: string[],
      payload?: Record<string, unknown>
    ) {
      segment = "";
      return save(join(text), logs, true, payload);
    },
    async interrupt() {
      // Stop the display on already delivered text even when cancellation now
      // forbids producing more text. Do not insert or extend a reply here.
      await writes.catch(() => undefined);
      if (!row) return null;
      const payload = row.payload as Record<string, unknown>;
      if (!payload.workPending) return row;
      const { data, error } = await table()
        .update({
          payload: {
            ...payload,
            workPending: false,
            workCompletedAt: new Date().toISOString(),
          } as TalentMessageRow["payload"],
        })
        .eq("id", row.id)
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .eq("payload->>workStartedAt", args.startedAt)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as TalentMessageRow | null;
    },
    async logs(logs: string[]) {
      if (row) return save(join(segment), logs, false);
      return null;
    },
  };
}
