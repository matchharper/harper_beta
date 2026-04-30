import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import {
  buildCareerChatPromptBlocks,
  buildCareerInsightExtractionPrompt,
} from "@/lib/career/prompts";
import {
  runCareerChatAssistant,
  runCareerChatAssistantStream,
} from "@/lib/career/llm";
import {
  executeTalentTool,
  getOpenAIChatTools,
  getStopAfterTalentToolNames,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  TALENT_ONBOARDING_DONE_MARKER,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import { prepareCompanySnapshot } from "@/lib/career/companySnapshot";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

type PreparedCompanySnapshotResult = Awaited<
  ReturnType<typeof prepareCompanySnapshot>
>;

const toResponseMessage = (item: TalentMessageRow) => ({
  id: item.id,
  role: item.role,
  content: item.content,
  messageType: item.message_type ?? "chat",
  createdAt: item.created_at,
});

const wantsSseStream = (req: NextRequest) =>
  (req.headers.get("accept") ?? "").includes("text/event-stream");

const createSseMessage = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const createSseHeaders = () => ({
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
});

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

const optionalToolString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

function countPromptChars(value: string | null | undefined) {
  return typeof value === "string" ? value.length : 0;
}

function countMessageContentChars(
  messages: Array<{ content: string | null | undefined }>
) {
  return messages.reduce(
    (sum, message) => sum + countPromptChars(message.content),
    0
  );
}

function countSerializedChars(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.length : 0;
  } catch {
    return 0;
  }
}

function countPromptBlockChars(
  blocks: Array<{ text: string | null | undefined }>
) {
  return blocks.reduce((sum, block) => sum + countPromptChars(block.text), 0);
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await warmCache();

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();
    const streamResponse = wantsSseStream(req);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });
    if (activeRun) {
      return NextResponse.json(
        {
          error:
            "기회를 찾는 중입니다. 검색이 끝나면 바로 이어서 대화할 수 있습니다.",
          opportunityRun: serializeOpportunityRun(activeRun),
        },
        { status: 423 }
      );
    }

    const [profile, currentInsights, talentSetting] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentSetting({ admin, userId: user.id }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      setting: talentSetting,
      maxResumeChars: 3000,
    });

    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;
    const extractTurnInsights = (assistantContent: string) =>
      extractAndPersistChatInsights({
        admin,
        assistantContent,
        buildPrompt: (promptArgs) =>
          buildCareerInsightExtractionPrompt({
            coveredCount: promptArgs.coveredCount,
            currentInsightContent: promptArgs.currentInsightContent,
            totalCount: promptArgs.totalCount,
            uncoveredItems: promptArgs.uncoveredItems,
          }),
        conversationId,
        coveredCount,
        currentInsightContent,
        logPrefix: "TalentChat",
        totalCount: INSIGHT_CHECKLIST.length,
        uncoveredItems,
        userId: user.id,
      });

    const normalizedContent = link
      ? `${message}\n\n참고 링크: ${link}`
      : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const recentMessages = await fetchRecentMessages({
      admin,
      conversationId,
      limit: 24,
    });

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    const availableChatTools = getOpenAIChatTools("chat");
    const { isOnboardingActive, promptBlocks, toolPolicy } =
      buildCareerChatPromptBlocks({
        coveredCount,
        currentInsightContent,
        isOnboardingDone: talentSetting?.is_onboarding_done,
        profile,
        structuredProfileText,
        toolNames: availableChatTools.map((tool) => tool.function.name),
        totalInsightCount: INSIGHT_CHECKLIST.length,
        uncoveredItems,
        userTurnCount,
      });
    const toolDefinitions = isOnboardingActive ? [] : availableChatTools;
    const systemBlocks = promptBlocks;

    console.info("[career-chat:prompt-breakdown]", {
      cacheableSystemBlockKeys: systemBlocks
        .filter((block) => block.cacheable)
        .map((block) => block.key),
      label: "career/chat:assistant",
      conversationId,
      historyChars: countMessageContentChars(llmMessages),
      historyMessageCount: llmMessages.length,
      isOnboardingActive,
      profileChars: countPromptChars(structuredProfileText),
      systemBlockChars: countPromptBlockChars(systemBlocks),
      systemBlockCount: systemBlocks.length,
      toolPolicyChars: countPromptChars(toolPolicy),
      toolSchemaChars: countSerializedChars(toolDefinitions),
      userId: user.id,
    });

    // logger.log("\n\n [toolPolicy] : ", toolPolicy);

    // --- Conversation LLM call (natural language, no JSON mode) ---
    const preparedCompanySnapshotRef: {
      current: PreparedCompanySnapshotResult | null;
    } = { current: null };

    if (streamResponse) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(createSseMessage(event, data)));
          };
          let pendingAssistantText = "";
          let streamedAssistantText = "";
          const sendVisibleTextDelta = (delta: string) => {
            pendingAssistantText = (pendingAssistantText + delta).replaceAll(
              TALENT_ONBOARDING_DONE_MARKER,
              ""
            );
            const safeLength = Math.max(
              0,
              pendingAssistantText.length - TALENT_ONBOARDING_DONE_MARKER.length
            );
            if (safeLength <= 0) return;

            const visibleDelta = pendingAssistantText.slice(0, safeLength);
            pendingAssistantText = pendingAssistantText.slice(safeLength);
            streamedAssistantText += visibleDelta;
            send("text_delta", { delta: visibleDelta });
          };
          const flushVisibleText = (finalText: string) => {
            const missingText = finalText.startsWith(streamedAssistantText)
              ? finalText.slice(streamedAssistantText.length)
              : pendingAssistantText.replaceAll(
                  TALENT_ONBOARDING_DONE_MARKER,
                  ""
                );
            pendingAssistantText = "";
            if (!missingText) return;
            streamedAssistantText += missingText;
            send("text_delta", { delta: missingText });
          };
          const runInsightExtractionInBackground = (content: string) => {
            if (!content.trim()) return;
            void extractTurnInsights(content).then((newKeysCount) => {
              console.info("[TalentChat] background insight extraction done", {
                conversationId,
                newKeysCount,
                userId: user.id,
              });
            });
          };

          try {
            send("user_message", {
              message: toResponseMessage(
                insertedUserMessage as TalentMessageRow
              ),
            });

            const assistantText = await runCareerChatAssistantStream({
              messages: llmMessages,
              tools: toolDefinitions,
              stopAfterToolNames: getStopAfterTalentToolNames("chat"),
              systemBlocks,
              onTextDelta: (delta) => {
                sendVisibleTextDelta(delta);
              },
              executeTool: async ({ name, input }) => {
                if (name === TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT) {
                  const companyName = optionalToolString(input.companyName);
                  if (!companyName) {
                    throw new Error(
                      "prepare_company_snapshot requires companyName."
                    );
                  }

                  const prepared = await prepareCompanySnapshot({
                    admin,
                    companyName,
                    conversationId,
                    reason: optionalToolString(input.reason),
                    userId: user.id,
                  });
                  preparedCompanySnapshotRef.current = prepared;
                  return {
                    ok: true,
                    result: "company_snapshot_setup_ui_created",
                    setup: prepared.setup,
                  };
                }

                return executeTalentTool({
                  context: {
                    admin,
                    conversationId,
                    userId: user.id,
                  },
                  name,
                  input,
                });
              },
            });

            const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
            if (preparedCompanySnapshot) {
              const preparedAssistantText =
                preparedCompanySnapshot.messages[
                  preparedCompanySnapshot.messages.length - 1
                ]?.content ?? "";
              runInsightExtractionInBackground(preparedAssistantText);

              send("assistant_messages", {
                messages: preparedCompanySnapshot.messages,
              });
              send("progress", {
                progress: {
                  answeredCount: userTurnCount,
                  completed: false,
                  currentStep: coveredCount,
                  targetCount: TALENT_INTERVIEW_FINAL_STEP,
                },
              });
              send("done", { ok: true });
              return;
            }

            const assistantTextWithMarkers =
              assistantText.trim() ||
              "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

            const completion = resolveTalentOnboardingCompletion({
              assistantContent: assistantTextWithMarkers,
            });

            const safeAssistantText =
              stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
              "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";
            flushVisibleText(safeAssistantText);

            const { data: insertedAssistantMessage, error: assistantError } =
              await admin
                .from("talent_messages")
                .insert({
                  conversation_id: conversationId,
                  user_id: user.id,
                  role: "assistant",
                  content: safeAssistantText,
                  message_type: "chat",
                })
                .select("*")
                .single();

            if (assistantError) {
              throw new Error(
                assistantError.message ?? "Failed to insert assistant message"
              );
            }

            runInsightExtractionInBackground(safeAssistantText);

            const isCompleted = completion.completed;
            const now = new Date().toISOString();
            await admin
              .from("talent_conversations")
              .update({
                stage: isCompleted ? "completed" : "chat",
                updated_at: now,
              })
              .eq("id", conversationId)
              .eq("user_id", user.id);

            const completedOpportunityRun =
              isCompleted && completion.reason
                ? await completeOnboardingAndQueueInitialOpportunityRun({
                    admin,
                    completionReason: completion.reason,
                    conversationId,
                    source: "career_chat_completion",
                    userId: user.id,
                  })
                : null;
            if (completedOpportunityRun) {
              startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
            }

            send("assistant_message", {
              message: toResponseMessage(
                insertedAssistantMessage as TalentMessageRow
              ),
            });
            send("opportunity_run", {
              opportunityRun: serializeOpportunityRun(completedOpportunityRun),
            });
            send("progress", {
              progress: {
                answeredCount: userTurnCount,
                targetCount: TALENT_INTERVIEW_FINAL_STEP,
                completed: isCompleted,
                currentStep: coveredCount,
              },
            });
            send("done", { ok: true });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to process talent chat";
            send("error", { error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: createSseHeaders(),
      });
    }

    const assistantText = await runCareerChatAssistant({
      messages: llmMessages,
      tools: toolDefinitions,
      stopAfterToolNames: getStopAfterTalentToolNames("chat"),
      systemBlocks,
      executeTool: async ({ name, input }) => {
        if (name === TALENT_TOOL_NAMES.PREPARE_COMPANY_SNAPSHOT) {
          const companyName = optionalToolString(input.companyName);
          if (!companyName) {
            throw new Error("prepare_company_snapshot requires companyName.");
          }

          const prepared = await prepareCompanySnapshot({
            admin,
            companyName,
            conversationId,
            reason: optionalToolString(input.reason),
            userId: user.id,
          });
          preparedCompanySnapshotRef.current = prepared;
          return {
            ok: true,
            result: "company_snapshot_setup_ui_created",
            setup: prepared.setup,
          };
        }

        return executeTalentTool({
          context: {
            admin,
            conversationId,
            userId: user.id,
          },
          name,
          input,
        });
      },
    });

    const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
    if (preparedCompanySnapshot) {
      const preparedAssistantText =
        preparedCompanySnapshot.messages[
          preparedCompanySnapshot.messages.length - 1
        ]?.content ?? "";
      const newKeysCount = await extractTurnInsights(preparedAssistantText);

      return NextResponse.json({
        ok: true,
        assistantMessage:
          preparedCompanySnapshot.messages[
            preparedCompanySnapshot.messages.length - 1
          ],
        assistantMessages: preparedCompanySnapshot.messages,
        progress: {
          answeredCount: userTurnCount,
          completed: false,
          currentStep: coveredCount + newKeysCount,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      });
    }

    const assistantTextWithMarkers =
      assistantText.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantTextWithMarkers,
    });

    const safeAssistantText =
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantText,
          message_type: "chat",
        })
        .select("*")
        .single();

    if (assistantError) {
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    const newKeysCount = await extractTurnInsights(safeAssistantText);

    // --- Completion check: explicit LLM onboarding-done marker only. ---
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const isCompleted = completion.completed;

    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    const completedOpportunityRun =
      isCompleted && completion.reason
        ? await completeOnboardingAndQueueInitialOpportunityRun({
            admin,
            completionReason: completion.reason,
            conversationId,
            source: "career_chat_completion",
            userId: user.id,
          })
        : null;
    if (completedOpportunityRun) {
      startOpportunityDiscoveryInBackground(completedOpportunityRun.id);
    }

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      opportunityRun: serializeOpportunityRun(completedOpportunityRun),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: insightsCoveredAfter,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
