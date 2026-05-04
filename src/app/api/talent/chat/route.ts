import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countAdditionalOnboardingQuestionSelections,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX } from "@/lib/talentOnboarding/onboarding";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  buildCareerTextChatPromptBlocks,
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
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";
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
import {
  COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
  fetchRecentCompanySnapshot,
  formatCompanySnapshotMessage,
  getOrCreateCompanySnapshot,
  prepareCompanySnapshot,
  toCompanySnapshotResponseMessage,
  touchConversation,
} from "@/lib/career/companySnapshot";
import { logger } from "@/utils/logger";

export const maxDuration = 60;

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

type PreparedCompanySnapshotResult = Omit<
  Awaited<ReturnType<typeof prepareCompanySnapshot>>,
  "setup"
> & {
  setup: Awaited<ReturnType<typeof prepareCompanySnapshot>>["setup"] | null;
};

const EMPTY_ASSISTANT_TEXT_FALLBACK =
  "말씀해주신 내용 확인했습니다. 이어서 조금만 더 여쭤볼게요.";

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

async function buildTalentProfileSnapshot(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const [setting, insights] = await Promise.all([
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
  ]);
  const careerMoveIntent = sanitizeTalentCareerMoveIntent(
    setting?.career_move_intent
  );
  return {
    talentPreferences: {
      engagementTypes: normalizeTalentEngagementTypes(
        setting?.engagement_types ?? []
      ),
      preferredLocations: normalizeTalentPreferredLocations(
        setting?.preferred_locations ?? []
      ),
      careerMoveIntent,
      careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
      periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
        setting?.periodic_interval_days
      ),
      recommendationBatchSize: normalizeTalentRecommendationBatchSize(
        setting?.recommendation_batch_size
      ),
    },
    talentInsights: normalizeTalentInsightContent(insights?.content ?? null),
    preferencesUpdatedAt: setting?.updated_at ?? null,
    insightUpdatedAt: insights?.last_updated_at ?? null,
  };
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

    const [
      profile,
      currentInsights,
      talentSetting,
      additionalQuestionSelectionCount,
    ] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentSetting({ admin, userId: user.id }),
      countAdditionalOnboardingQuestionSelections({
        admin,
        conversationId,
      }),
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
    const extractTurnInsights = (assistantContent: string) =>
      extractAndPersistChatInsights({
        admin,
        assistantContent,
        buildPrompt: (promptArgs) =>
          buildCareerInsightExtractionPrompt({
            currentInsightContent: promptArgs.currentInsightContent,
          }),
        conversationId,
        currentInsightContent,
        logPrefix: "TalentChat",
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
    const currentProgressStep = Math.min(
      userTurnCount,
      TALENT_INTERVIEW_FINAL_STEP
    );
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
    const isOnboardingActiveForTools = !Boolean(
      talentSetting?.is_onboarding_done
    );
    const canSelectAdditionalOnboardingQuestion =
      additionalQuestionSelectionCount <
      TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX;
    // During onboarding, suppress all chat tools EXCEPT the silent profile writer
    // and the additional-question selector. After onboarding, keep the selector
    // hidden because it is only meaningful inside onboarding. The selector is
    // also hidden after the hard max so the model cannot keep asking extras.
    const toolDefinitions = isOnboardingActiveForTools
      ? availableChatTools.filter(
          (tool) =>
            tool.function.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE ||
            (canSelectAdditionalOnboardingQuestion &&
              tool.function.name ===
                TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION)
        )
      : availableChatTools.filter(
          (tool) =>
            tool.function.name !==
            TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION
        );
    const currentPreferences = {
      engagementTypes: talentSetting?.engagement_types ?? [],
      preferredLocations: talentSetting?.preferred_locations ?? [],
      careerMoveIntent: talentSetting?.career_move_intent ?? null,
      careerMoveIntentLabel: getTalentCareerMoveIntentLabel(
        talentSetting?.career_move_intent ?? null
      ),
      periodicIntervalDays: talentSetting?.periodic_interval_days ?? null,
      recommendationBatchSize: talentSetting?.recommendation_batch_size ?? null,
    };
    const { promptBlocks } =
      buildCareerTextChatPromptBlocks({
        additionalQuestionSelectionCount,
        currentInsightContent,
        currentPreferences,
        isOnboardingDone: talentSetting?.is_onboarding_done,
        profile,
        structuredProfileText,
        toolNames: toolDefinitions.map((tool) => tool.function.name),
      });
    const systemBlocks = promptBlocks;

    // console.info("[career-chat:prompt-breakdown]", {
    //   cacheableSystemBlockKeys: systemBlocks
    //     .filter((block) => block.cacheable)
    //     .map((block) => block.key),
    //   label: "career/chat:assistant",
    //   conversationId,
    //   historyChars: countMessageContentChars(llmMessages),
    //   historyMessageCount: llmMessages.length,
    //   isOnboardingActive,
    //   profileChars: countPromptChars(structuredProfileText),
    //   systemBlockChars: countPromptBlockChars(systemBlocks),
    //   systemBlockCount: systemBlocks.length,
    //   toolPolicyChars: countPromptChars(toolPolicy),
    //   toolSchemaChars: countSerializedChars(toolDefinitions),
    //   userId: user.id,
    // });

    // logger.log("\n\n [toolPolicy] : ", toolPolicy);

    // --- Conversation LLM call (natural language, no JSON mode) ---
    const preparedCompanySnapshotRef: {
      current: PreparedCompanySnapshotResult | null;
    } = { current: null };
    const selectedAdditionalQuestionRef: {
      current: string | null;
    } = { current: null };
    const executeDefaultTalentTool = async (toolArgs: {
      input: Record<string, unknown>;
      name: string;
    }) => {
      const result = await executeTalentTool({
        context: {
          admin,
          conversationId,
          userId: user.id,
        },
        name: toolArgs.name,
        input: toolArgs.input,
      });

      if (
        toolArgs.name ===
          TALENT_TOOL_NAMES.SELECT_ADDITIONAL_ONBOARDING_QUESTION &&
        result &&
        typeof result === "object" &&
        (result as { shouldAsk?: unknown }).shouldAsk !== false
      ) {
        const assistantMessage = String(
          (result as { assistantMessage?: unknown }).assistantMessage ?? ""
        ).trim();
        if (assistantMessage) {
          selectedAdditionalQuestionRef.current = assistantMessage;
        }
      }

      return result;
    };

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
                if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
                  const companyName =
                    optionalToolString(input.company_name) ??
                    optionalToolString(input.companyName);
                  if (!companyName) {
                    throw new Error("research_company requires company_name.");
                  }

                  const cachedSnapshot = await fetchRecentCompanySnapshot({
                    admin,
                    companyName,
                  });
                  if (cachedSnapshot) {
                    const messageContent = formatCompanySnapshotMessage({
                      reused: true,
                      snapshot: cachedSnapshot,
                    });
                    const { data: cacheMessage, error: cacheMessageError } =
                      await admin
                        .from("talent_messages")
                        .insert({
                          content: messageContent,
                          conversation_id: conversationId,
                          message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                          role: "assistant",
                          user_id: user.id,
                        })
                        .select("*")
                        .single();
                    if (cacheMessageError || !cacheMessage) {
                      throw new Error(
                        cacheMessageError?.message ??
                          "Failed to insert company_snapshot result message."
                      );
                    }
                    await touchConversation(admin, conversationId, user.id);
                    preparedCompanySnapshotRef.current = {
                      messages: [
                        toCompanySnapshotResponseMessage(
                          cacheMessage as TalentMessageRow
                        ),
                      ],
                      setup: null,
                    };
                    return { ok: true, cached: true };
                  }

                  // Intentional double cache-fetch: route checked cache above for fast-path,
                  // but getOrCreateCompanySnapshot rechecks for idempotency (another request
                  // may have created the snapshot between the two calls).
                  const result = await getOrCreateCompanySnapshot({
                    admin,
                    companyName,
                    reason: optionalToolString(input.reason),
                    userId: user.id,
                  });
                  const messageContent = formatCompanySnapshotMessage({
                    reused: result.reused,
                    snapshot: result.snapshot,
                  });
                  const { data: researchMessage, error: researchMessageError } =
                    await admin
                      .from("talent_messages")
                      .insert({
                        content: messageContent,
                        conversation_id: conversationId,
                        message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                        role: "assistant",
                        user_id: user.id,
                      })
                      .select("*")
                      .single();
                  if (researchMessageError || !researchMessage) {
                    throw new Error(
                      researchMessageError?.message ??
                        "Failed to insert company_snapshot result message."
                    );
                  }
                  await touchConversation(admin, conversationId, user.id);
                  preparedCompanySnapshotRef.current = {
                    messages: [
                      toCompanySnapshotResponseMessage(
                        researchMessage as TalentMessageRow
                      ),
                    ],
                    setup: null,
                  };
                  return { ok: true, cached: result.reused };
                }

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

                return executeDefaultTalentTool({ name, input });
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
                  currentStep: currentProgressStep,
                  targetCount: TALENT_INTERVIEW_FINAL_STEP,
                },
              });
              const profileSnapshot = await buildTalentProfileSnapshot({
                admin,
                userId: user.id,
              });
              send("talent_profile", profileSnapshot);
              send("done", { ok: true });
              return;
            }

            const assistantTextSource =
              selectedAdditionalQuestionRef.current ?? assistantText.trim();
            const assistantTextWithMarkers =
              assistantTextSource || EMPTY_ASSISTANT_TEXT_FALLBACK;

            const completion = resolveTalentOnboardingCompletion({
              assistantContent: assistantTextWithMarkers,
            });

            const safeAssistantText =
              stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
              EMPTY_ASSISTANT_TEXT_FALLBACK;
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
              opportunityDiscoveryQueued: Boolean(completedOpportunityRun),
              opportunityRun: serializeOpportunityRun(completedOpportunityRun),
            });
            send("progress", {
              progress: {
                answeredCount: userTurnCount,
                targetCount: TALENT_INTERVIEW_FINAL_STEP,
                completed: isCompleted,
                currentStep: currentProgressStep,
              },
            });
            const profileSnapshot = await buildTalentProfileSnapshot({
              admin,
              userId: user.id,
            });
            send("talent_profile", profileSnapshot);
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
        if (name === TALENT_TOOL_NAMES.RESEARCH_COMPANY) {
          const companyName =
            optionalToolString(input.company_name) ??
            optionalToolString(input.companyName);
          if (!companyName) {
            throw new Error("research_company requires company_name.");
          }

          const cachedSnapshot = await fetchRecentCompanySnapshot({
            admin,
            companyName,
          });
          if (cachedSnapshot) {
            const messageContent = formatCompanySnapshotMessage({
              reused: true,
              snapshot: cachedSnapshot,
            });
            const { data: cacheMessage, error: cacheMessageError } = await admin
              .from("talent_messages")
              .insert({
                content: messageContent,
                conversation_id: conversationId,
                message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                role: "assistant",
                user_id: user.id,
              })
              .select("*")
              .single();
            if (cacheMessageError || !cacheMessage) {
              throw new Error(
                cacheMessageError?.message ??
                  "Failed to insert company_snapshot result message."
              );
            }
            await touchConversation(admin, conversationId, user.id);
            preparedCompanySnapshotRef.current = {
              messages: [
                toCompanySnapshotResponseMessage(
                  cacheMessage as TalentMessageRow
                ),
              ],
              setup: null,
            };
            return { ok: true, cached: true };
          }

          // Intentional double cache-fetch: route checked cache above for fast-path,
          // but getOrCreateCompanySnapshot rechecks for idempotency (another request
          // may have created the snapshot between the two calls).
          const result = await getOrCreateCompanySnapshot({
            admin,
            companyName,
            reason: optionalToolString(input.reason),
            userId: user.id,
          });
          const messageContent = formatCompanySnapshotMessage({
            reused: result.reused,
            snapshot: result.snapshot,
          });
          const { data: researchMessage, error: researchMessageError } =
            await admin
              .from("talent_messages")
              .insert({
                content: messageContent,
                conversation_id: conversationId,
                message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
                role: "assistant",
                user_id: user.id,
              })
              .select("*")
              .single();
          if (researchMessageError || !researchMessage) {
            throw new Error(
              researchMessageError?.message ??
                "Failed to insert company_snapshot result message."
            );
          }
          await touchConversation(admin, conversationId, user.id);
          preparedCompanySnapshotRef.current = {
            messages: [
              toCompanySnapshotResponseMessage(
                researchMessage as TalentMessageRow
              ),
            ],
            setup: null,
          };
          return { ok: true, cached: result.reused };
        }

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

        return executeDefaultTalentTool({ name, input });
      },
    });

    const preparedCompanySnapshot = preparedCompanySnapshotRef.current;
    if (preparedCompanySnapshot) {
      const preparedAssistantText =
        preparedCompanySnapshot.messages[
          preparedCompanySnapshot.messages.length - 1
        ]?.content ?? "";
      await extractTurnInsights(preparedAssistantText);
      const profileSnapshot = await buildTalentProfileSnapshot({
        admin,
        userId: user.id,
      });

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
          currentStep: currentProgressStep,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
        ...profileSnapshot,
      });
    }

    logger.log("\n\nassistantText : ", assistantText, "\n\n");

    const assistantTextSource =
      selectedAdditionalQuestionRef.current ?? assistantText.trim();
    const assistantTextWithMarkers =
      assistantTextSource || EMPTY_ASSISTANT_TEXT_FALLBACK;

    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantTextWithMarkers,
    });

    const safeAssistantText =
      stripTalentOnboardingCompletionMarker(assistantTextWithMarkers) ||
      EMPTY_ASSISTANT_TEXT_FALLBACK;

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

    await extractTurnInsights(safeAssistantText);

    // --- Completion check: explicit LLM onboarding-done marker only. ---
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

    const profileSnapshot = await buildTalentProfileSnapshot({
      admin,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      opportunityDiscoveryQueued: Boolean(completedOpportunityRun),
      opportunityRun: serializeOpportunityRun(completedOpportunityRun),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: currentProgressStep,
      },
      ...profileSnapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
