import "server-only";
import postgres from "postgres";
import { submitInternalCallAnswers } from "./internalCallAnswersStore";
import { careerT } from "./translatedCareerMessage";
import type { CallAnswersQuery } from "./internalCallAnswersStore";

let client: ReturnType<typeof postgres> | undefined;
export function callAnswersDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database unavailable");
  return (client ??= postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(url)
      ? { ssl: "require" as const }
      : {}),
  }));
}
export function callAnswersQuery(
  sql:
    | ReturnType<typeof postgres>
    | postgres.TransactionSql = callAnswersDatabase()
): CallAnswersQuery {
  return async <T>(query: string, parameters: unknown[]) =>
    Array.from(
      await sql.unsafe(query, parameters as postgres.ParameterOrJSON<never>[])
    ) as T[];
}

/** Persist the exact questionnaire as the source message of a normal chat turn. */
export async function saveInternalCallChatSubmission(args: {
  input: import("./internalCallAnswers").InternalCallSubmission;
  userId: string;
  isMobile: boolean;
  locale?: string | null;
  messagePayload: Record<string, unknown>;
}) {
  return submitInternalCallAnswers({
    ...args,
    transaction: async (work) =>
      (await callAnswersDatabase().begin((tx) =>
        work(callAnswersQuery(tx))
      )) as Awaited<ReturnType<typeof work>>,
    renderMessage: (call, responses) =>
      [
        careerT(
          args.locale,
          "career.internal_call.answers.heading",
          "{companyName} · {roleTitle} 추가 질문 답변",
          {
            values: {
              companyName: call.companyName,
              roleTitle: call.roleTitle,
            },
          }
        ),
        ...responses.map(
          (answer) =>
            `${answer.questionIndex + 1}. ${call.questions[answer.questionIndex]}\n${answer.decision === "answer" ? answer.text : careerT(args.locale, "career.application.questions.skipped", "건너뜀")}`
        ),
      ].join("\n\n"),
  });
}
