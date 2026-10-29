import { normalizeInternalCallQuestionAnswers } from "@/lib/talentOnboarding/internalOpportunityCallProgress";
import type {
  InternalCallSubmission,
  InternalCallQuestionForm,
} from "./internalCallAnswers";
import { validateInternalCallAnswers } from "./internalCallAnswers";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";

type CallRow = { id: string; status: string; state: Record<string, unknown> };
export type CallAnswersQuery = <T>(
  query: string,
  parameters: unknown[]
) => Promise<T[]>;
export type CallAnswersTransaction = <T>(
  work: (query: CallAnswersQuery) => Promise<T>
) => Promise<T>;
const callQuery = `select id, status, state from public.talent_calls
  where id=$1 and user_id=$2 and kind='internal_opportunity_request'`;
const fail = (message: string, status: number): never => {
  throw Object.assign(new Error(message), { status });
};

function projectCall(
  row: CallRow,
  replyCompleted = false
): InternalCallQuestionForm {
  return {
    id: row.id,
    status: row.status,
    companyName: String(row.state.companyName ?? ""),
    roleTitle: String(row.state.roleTitle ?? ""),
    questions: Array.isArray(row.state.questions)
      ? row.state.questions.filter((q): q is string => typeof q === "string")
      : [],
    submitted: Boolean(row.state.writtenAnswers),
    replyCompleted,
    questionAnswers: normalizeInternalCallQuestionAnswers(
      row.state.questionAnswers,
      Array.isArray(row.state.questions) ? row.state.questions.length : 0
    ),
  };
}

async function readAnswerReply(
  query: CallAnswersQuery,
  message: Pick<TalentMessageRow, "id" | "user_id" | "conversation_id">
) {
  const [reply] = await query<TalentMessageRow>(
    `select * from public.talent_messages where user_id=$1 and conversation_id=$2
      and role='assistant' and payload->>'internalCallAnswerMessageId'=$3
      order by id limit 1`,
    [message.user_id, message.conversation_id, String(message.id)]
  );
  return reply ?? null;
}

export async function readInternalCallQuestions(
  query: CallAnswersQuery,
  callId: string,
  userId: string
) {
  const [row] = await query<CallRow>(callQuery, [callId, userId]);
  if (!row) return fail("Call request not found", 404);
  const written = row.state.writtenAnswers as
    | { messageId?: number; conversationId?: string }
    | undefined;
  const reply =
    written?.messageId && written.conversationId
      ? await readAnswerReply(query, {
          id: written.messageId,
          user_id: userId,
          conversation_id: written.conversationId,
        })
      : null;
  return projectCall(row, Boolean(reply));
}

export async function submitInternalCallAnswers(args: {
  transaction: CallAnswersTransaction;
  input: InternalCallSubmission;
  userId: string;
  isMobile: boolean;
  messagePayload?: Record<string, unknown>;
  renderMessage: (
    call: InternalCallQuestionForm,
    responses: InternalCallSubmission["responses"]
  ) => string;
}) {
  return args.transaction(async (query) => {
    const [conversation] = await query<{ id: string }>(
      "select id from public.talent_conversations where id=$1 and user_id=$2",
      [args.input.conversationId, args.userId]
    );
    if (!conversation) return fail("Conversation not found", 404);
    const [row] = await query<CallRow>(`${callQuery} for update`, [
      args.input.callId,
      args.userId,
    ]);
    if (!row) return fail("Call request not found", 404);
    const prior = row.state.writtenAnswers as
      | { messageId?: number; conversationId?: string }
      | undefined;
    if (prior?.messageId) {
      let [message] = await query<TalentMessageRow>(
        "select * from public.talent_messages where id=$1 and user_id=$2",
        [prior.messageId, args.userId]
      );
      if (!message) return fail("Saved answer message not found", 409);
      if (message.conversation_id !== args.input.conversationId)
        return fail(
          "Answers were already submitted in another conversation",
          409
        );
      const assistantMessage = await readAnswerReply(query, message);
      // Earlier saves may predate the normal chat capability payload. Preserve
      // existing leases and unrelated payload fields when resuming that message.
      if (args.messagePayload && !assistantMessage) {
        [message] = await query<TalentMessageRow>(
          `update public.talent_messages set payload=$3::text::jsonb || coalesce(payload, '{}'::jsonb)
            where id=$1 and user_id=$2 returning *`,
          [message.id, args.userId, JSON.stringify(args.messagePayload)]
        );
      }
      return {
        call: projectCall(row, Boolean(assistantMessage)),
        message,
        assistantMessage,
      };
    }
    if (!["pending", "active"].includes(row.status))
      return fail("Call request is already closed", 409);
    const call = projectCall(row);
    const responses = validateInternalCallAnswers(call.questions, args.input);
    const [message] = await query<TalentMessageRow>(
      `insert into public.talent_messages
      (conversation_id,user_id,role,content,message_type,is_mobile,payload)
      values ($1,$2,'user',$3,'chat',$4,$5::text::jsonb) returning *`,
      [
        args.input.conversationId,
        args.userId,
        args.renderMessage(call, responses),
        args.isMobile,
        JSON.stringify(args.messagePayload ?? {}),
      ]
    );
    const state = {
      ...row.state,
      questionAnswers: Object.fromEntries(
        responses.map((answer) => [
          String(answer.questionIndex + 1),
          answer.decision === "answer"
            ? answer.text
            : "The caller chose to skip this question.",
        ])
      ),
      writtenAnswers: {
        responses,
        messageId: message.id,
        conversationId: args.input.conversationId,
      },
    };
    await query(
      `update public.talent_calls set state=$3::text::jsonb, status='completed', completed_at=now(), last_active_at=clock_timestamp(), updated_at=clock_timestamp()
      where id=$1 and user_id=$2`,
      [row.id, args.userId, JSON.stringify(state)]
    );
    return {
      call: projectCall({ ...row, state, status: "completed" }),
      message,
      assistantMessage: null,
    };
  });
}

/** One row lock merges concurrent question writes without losing other responses.
 * The response is authored by the conversational model, not reclassified here. */
export async function recordInternalCallAnswers(args: {
  transaction: CallAnswersTransaction;
  callId: string;
  conversationId: string;
  userId: string;
  answers: Array<{ question_number: number; response: string }>;
}) {
  return args.transaction(async (query) => {
    const [conversation] = await query<{ id: string }>(
      "select id from public.talent_conversations where id=$1 and user_id=$2",
      [args.conversationId, args.userId]
    );
    if (!conversation) return fail("Conversation not found", 404);
    const [row] = await query<CallRow>(`${callQuery} for update`, [
      args.callId,
      args.userId,
    ]);
    if (!row) return fail("Call request not found", 404);
    if (!["pending", "active"].includes(row.status))
      return fail("Call request is already closed", 409);
    const call = projectCall(row);
    const questionAnswers = { ...call.questionAnswers };
    for (const answer of args.answers) {
      if (
        !Number.isInteger(answer.question_number) ||
        answer.question_number < 1 ||
        answer.question_number > call.questions.length ||
        typeof answer.response !== "string"
      )
        return fail("Invalid question reference or response type", 400);
      questionAnswers[String(answer.question_number)] = answer.response;
    }
    const state = { ...row.state, questionAnswers };
    await query(
      `update public.talent_calls set state=$3::text::jsonb, last_active_at=clock_timestamp(), updated_at=clock_timestamp()
      where id=$1 and user_id=$2`,
      [row.id, args.userId, JSON.stringify(state)]
    );
    return projectCall({ ...row, state });
  });
}
