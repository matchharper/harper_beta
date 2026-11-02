import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";

for (const newerUserMessage of [false, true]) {
  test(`return endpoint streams before completion and ${newerUserMessage ? "rejects a stale anchor" : "keeps its own progress from invalidating the anchor"}`, async () => {
    const conversation = {
      id: "fixture-conversation",
      user_id: "fixture-user",
      stage: "completed",
    };
    const rows: any[] = [
      {
        id: 1,
        role: "assistant",
        message_type: "chat",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const admin = {
      from: (table: string) => {
        let messageType: string | undefined;
        let excluded: number[] = [];
        const query: any = {
          select: () => query,
          order: () => query,
          limit: () => query,
          update: () => query,
          eq: (key: string, value: string) => {
            if (key === "message_type") messageType = value;
            return query;
          },
          not: (key: string, operator: string, value: string) => {
            assert.equal(key, "id");
            assert.equal(operator, "in");
            excluded = value.slice(1, -1).split(",").map(Number);
            return query;
          },
          maybeSingle: async () => ({
            error: null,
            data:
              table === "talent_conversations"
                ? conversation
                : (rows
                    .filter(
                      (row) =>
                        row.message_type === messageType &&
                        !excluded.includes(row.id)
                    )
                    .at(-1) ?? null),
          }),
          then: (resolve: (value: unknown) => void) =>
            resolve({ data: null, error: null }),
        };
        return query;
      },
    };
    let finishModel!: () => void;
    const modelGate = new Promise<void>((resolve) => {
      finishModel = resolve;
    });
    let finished = false;
    const known: Record<string, any> = {
      NextResponse,
      getRequestUser: async () => ({
        id: conversation.user_id,
        email: "fixture@matchharper.com",
      }),
      getTalentSupabaseAdmin: () => admin,
      ensureTalentUserRecord: async () => {},
      fetchTalentSetting: async () => ({
        is_onboarding_done: true,
        preferred_locale: "ko",
      }),
      isMobileRequest: () => false,
      resolveCareerRequestTimeZone: () => "Asia/Seoul",
      hideExpiredUnansweredExternalOpportunities: async () => 0,
      fetchCareerReengagementPendingActions: async () => ({
        promptActions: [],
        actionReferences: {},
      }),
      fetchCareerReengagementHistory: async () => [],
      buildCareerSessionStartTurnInstruction: () => "Fixture return context",
      CAREER_SESSION_START_NO_MESSAGE_MARKER: "__NO_SESSION_GREETING__",
      TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP:
        "session_reengagement_skip",
      CAREER_REENGAGEMENT_MESSAGE_PAYLOAD: { kind: "session_reengagement" },
      CLAUDE_HAIKU_MODEL: "claude-haiku-5-5",
      runCareerChatTurn: async (args: any) => {
        assert.equal(typeof args.onTextDelta, "function");
        await args.onTextDelta("다시 오셨네요.");
        await modelGate;
        const progress = {
          id: 2,
          role: "assistant",
          content: "다시 오셨네요.",
          messageType: "chat",
          createdAt: new Date().toISOString(),
        };
        rows.push({
          ...progress,
          message_type: "chat",
          created_at: progress.createdAt,
        });
        args.onArtifactMessage(progress);
        assert.equal(await args.shouldInsertAssistantMessage(), true);
        if (newerUserMessage)
          rows.push({
            id: 3,
            role: "user",
            message_type: "chat",
            created_at: new Date().toISOString(),
          });
        assert.equal(
          await args.shouldInsertAssistantMessage(),
          !newerUserMessage
        );
        await args.onTextDelta("살펴볼 포지션이 있어요.");
        finished = true;
        const final = {
          ...progress,
          id: 4,
          content: "살펴볼 포지션이 있어요.",
        };
        return {
          assistantMessage: newerUserMessage ? null : final,
          assistantMessages: newerUserMessage ? [] : [progress, final],
          noMessage: newerUserMessage,
        };
      },
    };
    const filename = new URL("./route.ts", import.meta.url);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const compiledModule = {
      exports: {} as { POST: (req: NextRequest) => Promise<Response> },
    };
    vm.runInNewContext(code, {
      module: compiledModule,
      exports: compiledModule.exports,
      process,
      console,
      Date,
      Set,
      ReadableStream,
      TextEncoder,
      Response,
      require: () =>
        new Proxy(
          {},
          {
            get: (_, key) =>
              key in known
                ? known[String(key)]
                : () => {
                    throw new Error(
                      `Unexpected route dependency: ${String(key)}`
                    );
                  },
          }
        ),
    });
    const response = await compiledModule.exports.POST(
      new NextRequest("http://localhost/api/talent/session/reengagement", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          devForce: true,
        }),
      })
    );
    assert.match(response.headers.get("content-type")!, /text\/event-stream/);
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.equal(finished, false);
    assert.equal(first.done, false);
    assert.match(
      new TextDecoder().decode(first.value),
      /event: text_delta[\s\S]*다시 오셨네요/
    );
    finishModel();
    let tail = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      tail += new TextDecoder().decode(chunk.value);
    }
    assert.match(tail, /event: assistant_message/);
    assert.match(tail, /event: reengagement_result/);
    assert.match(tail, /event: done/);
    assert.doesNotMatch(tail, /event: error/);
    const final = JSON.parse(
      tail.split("event: reengagement_result\ndata: ")[1].split("\n")[0]
    );
    assert.equal(final.assistantMessages.length, newerUserMessage ? 0 : 2);
  });
}
