import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import {
  readInternalCallQuestions,
  submitInternalCallAnswers,
  type CallAnswersQuery,
  type CallAnswersTransaction,
} from "./internalCallAnswersStore";
import { internalCallSubmissionSchema } from "./internalCallAnswers";
import { executeRecordCallAnswers } from "./recordCallAnswersTool";
import { formatToolResultText } from "@/lib/llm/promptText";
import { getUnrecordedInternalCallQuestionNumbers } from "@/lib/talentOnboarding/internalOpportunityCallProgress";

// Use the production driver against local PostgreSQL wire messages. Direct
// PGlite.query() skips postgres-js parameter serialization and missed the bug.
async function fixture() {
  const db = new PGlite();
  await db.waitReady;
  const server = net.createServer((socket) => {
    let startup = true;
    let buffer = Buffer.alloc(0);
    let pending = Promise.resolve();
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 5) {
        const length = startup
          ? buffer.readInt32BE(0)
          : 1 + buffer.readInt32BE(1);
        if (buffer.length < length) break;
        const packet = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        if (startup) {
          startup = false;
          // AuthenticationOk + ReadyForQuery for this isolated, local fixture.
          socket.write(
            Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73])
          );
        } else if (packet[0] === 88) socket.end();
        else
          pending = pending
            .then(async () => {
              socket.write(Buffer.from(await db.execProtocolRaw(packet)));
            })
            .catch((error) => {
              socket.destroy(error);
            });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const sql = postgres({
    host: "127.0.0.1",
    port: (server.address() as net.AddressInfo).port,
    user: "fixture",
    database: "fixture",
    ssl: false,
    max: 1,
    prepare: false,
  });
  const queryFor =
    (connection: typeof sql | postgres.TransactionSql): CallAnswersQuery =>
    async <T>(text: string, parameters: unknown[]) =>
      Array.from(
        await connection.unsafe(
          text,
          parameters as postgres.ParameterOrJSON<never>[]
        )
      ) as T[];
  const transaction: CallAnswersTransaction = async (work) =>
    (await sql.begin((tx) => work(queryFor(tx)))) as Awaited<
      ReturnType<typeof work>
    >;
  return {
    db,
    transaction,
    query: queryFor(sql),
    close: async () => {
      await sql.end();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await db.close();
    },
  };
}

const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const conversation = "33333333-3333-4333-8333-333333333333";
const call = "44444444-4444-4444-8444-444444444444";

test("written Role answers preserve text, ownership, atomic completion and retry identity", async (t) => {
  const { db, query, transaction, close } = await fixture();
  t.after(close);
  await db.exec(`create table talent_conversations(id uuid primary key,user_id uuid);
    create table talent_calls(id uuid primary key,user_id uuid,kind text,status text,state jsonb check (jsonb_typeof(state)='object'),completed_at timestamptz,last_active_at timestamptz,updated_at timestamptz);
    create table talent_messages(id serial primary key,conversation_id uuid,user_id uuid,role text,content text,message_type text,is_mobile boolean,payload jsonb,created_at timestamptz default now());`);
  await db.query("insert into talent_conversations values ($1,$2)", [
    conversation,
    user,
  ]);
  const questions = ["First?", "Second?", "Third?"];
  await db.query(
    "insert into talent_calls(id,user_id,kind,status,state) values ($1,$2,'internal_opportunity_request','pending',$3::jsonb)",
    [
      call,
      user,
      JSON.stringify({
        companyName: "Fixture",
        roleTitle: "Engineer",
        questions,
        reasoning: "private rationale",
      }),
    ]
  );
  const text = "A long answer\n" + "가".repeat(5000);
  const input = internalCallSubmissionSchema.parse({
    callId: call,
    conversationId: conversation,
    questions,
    responses: [
      { questionIndex: 2, decision: "answer", text: "" },
      { questionIndex: 0, decision: "answer", text },
      { questionIndex: 1, decision: "skip" },
    ],
  });
  const args = {
    transaction,
    input,
    userId: user,
    isMobile: false,
    messagePayload: { careerCapabilities: { version: 1 } },
    renderMessage: (_call: unknown, responses: typeof input.responses) =>
      responses
        .map((a) => (a.decision === "answer" ? a.text : "Skipped"))
        .join("\n"),
  };
  await t.test(
    "reads only the owner's questions, without private rationale",
    async () => {
      const form = await readInternalCallQuestions(query, call, user);
      assert.deepEqual(form.questions, questions);
      assert.ok(!("reasoning" in form));
      await assert.rejects(readInternalCallQuestions(query, call, other), {
        status: 404,
      });
      await assert.rejects(
        submitInternalCallAnswers({ ...args, userId: other }),
        { status: 404 }
      );
    }
  );
  await t.test(
    "rejects stale question references and duplicated indices, not answer wording",
    async () => {
      await assert.rejects(
        submitInternalCallAnswers({
          ...args,
          input: { ...input, questions: ["Changed?", ...questions.slice(1)] },
        }),
        { status: 409 }
      );
      await assert.rejects(
        submitInternalCallAnswers({
          ...args,
          input: {
            ...input,
            responses: [
              input.responses[0],
              input.responses[0],
              input.responses[1],
            ],
          },
        }),
        { status: 400 }
      );
      assert.equal(
        (await db.query("select * from talent_messages")).rows.length,
        0
      );
    }
  );
  await t.test(
    "rolls message insert back if call completion fails",
    async () => {
      const failing: CallAnswersTransaction = (work) =>
        transaction((q) =>
          work(async <T>(sql: string, params: unknown[]) => {
            if (sql.startsWith("update public.talent_calls"))
              throw new Error("write failed");
            return q<T>(sql, params);
          })
        );
      await assert.rejects(
        submitInternalCallAnswers({ ...args, transaction: failing }),
        /write failed/
      );
      assert.equal(
        (await db.query("select * from talent_messages")).rows.length,
        0
      );
    }
  );
  await t.test(
    "saves the original answers once and returns the same receipt after a lost response",
    async () => {
      const result = await submitInternalCallAnswers(args);
      assert.equal(result.call.status, "completed");
      assert.ok(result.message.content.includes(text));
      const again = await submitInternalCallAnswers(args);
      assert.equal(again.message.id, result.message.id);
      assert.equal(
        (await db.query("select * from talent_messages")).rows.length,
        1
      );
      const rows = await db.query<{
        state: { writtenAnswers: { responses: unknown[] } };
      }>("select state from talent_calls");
      assert.equal(rows.rows[0].state.writtenAnswers.responses.length, 3);
    }
  );
  await t.test(
    "an interrupted reply resumes the same source; an existing reply is reused",
    async () => {
      const saved = await submitInternalCallAnswers(args);
      assert.equal(saved.assistantMessage, null);
      assert.equal(
        (await readInternalCallQuestions(query, call, user)).replyCompleted,
        false
      );
      assert.deepEqual(saved.message.payload, args.messagePayload);
      const reply = await db.query<{ id: number }>(
        `insert into talent_messages (conversation_id,user_id,role,content,message_type,payload)
       values ($1,$2,'assistant','Thanks for your answers.','chat',$3::jsonb) returning id`,
        [
          conversation,
          user,
          JSON.stringify({ internalCallAnswerMessageId: saved.message.id }),
        ]
      );
      const retry = await submitInternalCallAnswers(args);
      assert.equal(retry.message.id, saved.message.id);
      assert.equal(retry.assistantMessage?.id, reply.rows[0].id);
      assert.equal(
        (await readInternalCallQuestions(query, call, user)).replyCompleted,
        true
      );
      assert.equal(
        (await db.query("select * from talent_messages")).rows.length,
        2
      );
    }
  );
});

test("voice tool persists uncertainty, refusals and corrections; retries merge without losing responses", async () => {
  const { db, transaction, close } = await fixture();
  try {
    await db.exec(`create table talent_conversations(id uuid primary key,user_id uuid);
      create table talent_calls(id uuid primary key,user_id uuid,kind text,status text,state jsonb check (jsonb_typeof(state)='object'),last_active_at timestamptz,updated_at timestamptz);`);
    await db.query("insert into talent_conversations values ($1,$2)", [
      conversation,
      user,
    ]);
    await db.query(
      "insert into talent_calls values ($1,$2,'internal_opportunity_request','active',$3::jsonb,null,null)",
      [
        call,
        user,
        JSON.stringify({
          companyName: "Fixture",
          roleTitle: "Engineer",
          questions: ["First?", "Second?", "Third?"],
          reasoning: "private rationale",
        }),
      ]
    );
    const args = {
      callId: call,
      conversationId: conversation,
      userId: user,
      transaction,
    };
    const record = (
      answers: Array<{ question_number: number; response: string }>
    ) => executeRecordCallAnswers({ ...args, input: { answers } });
    await assert.rejects(
      executeRecordCallAnswers({
        ...args,
        userId: other,
        input: { answers: [] },
      }),
      { status: 404 }
    );
    await assert.rejects(
      record([{ question_number: 4, response: "Wrong reference" }]),
      { status: 400 }
    );
    await Promise.all([
      record([{ question_number: 1, response: "잘 모르겠어요." }]),
      record([{ question_number: 2, response: "답변하지 않을게요." }]),
    ]);
    const retried = await record([
      { question_number: 2, response: "답변하지 않을게요." },
    ]);
    assert.deepEqual(retried.call.questionAnswers, {
      "1": "잘 모르겠어요.",
      "2": "답변하지 않을게요.",
    });
    assert.deepEqual(
      getUnrecordedInternalCallQuestionNumbers(
        retried.call.questions,
        retried.call.questionAnswers
      ),
      [3]
    );
    const correction = "정정할게요.\n" + "경험".repeat(3000);
    const result = await record([
      { question_number: 1, response: correction },
      { question_number: 3, response: "" },
    ]);
    assert.deepEqual(result.call.questionAnswers, {
      "1": correction,
      "2": "답변하지 않을게요.",
      "3": "",
    });
    assert.deepEqual(
      getUnrecordedInternalCallQuestionNumbers(
        result.call.questions,
        result.call.questionAnswers
      ),
      []
    );
    const providerText = formatToolResultText(result);
    assert.equal(providerText, result.modelOutput);
    assert.ok(providerText.includes(correction));
    assert.ok(
      providerText.includes("Questions without a recorded response: none.")
    );
    assert.ok(!providerText.includes("private rationale"));
    assert.equal(result.call.status, "active"); // Recording does not hang up or send anything.
    const read = await readInternalCallQuestions(
      async <T>(sql: string, params: unknown[]) =>
        (await db.query<T>(sql, params)).rows,
      call,
      user
    );
    assert.deepEqual(read.questionAnswers, result.call.questionAnswers);
    await db.query("update talent_calls set status='completed'");
    await assert.rejects(
      record([{ question_number: 1, response: "Late write" }]),
      { status: 409 }
    );
  } finally {
    await close();
  }
});
