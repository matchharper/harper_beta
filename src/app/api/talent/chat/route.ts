import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  normalizeTalentInsightKey,
  TalentConversationRow,
  TalentMessageRow,
  TalentUserProfileRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { buildCareerSystemPrompt } from "@/lib/talentOnboarding/interviewSteps";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
  type InsightChecklistItem,
} from "@/lib/talentOnboarding/insightChecklist";
import {
  normalizeExtractedInsights,
  type ExtractedInsightValue,
} from "@/lib/talentOnboarding/insights";
import { logger } from "@/utils/logger";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

type ParsedAssistantResponse = {
  reply: string;
  extractedInsights: Record<string, ExtractedInsightValue> | null;
};

function parseAssistantResponse(raw: string): ParsedAssistantResponse {
  // Attempt 1: direct JSON parse
  try {
    const parsed = JSON.parse(raw);
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    const insights = parsed.extracted_insights;
    if (!reply) throw new Error("empty reply");
    return {
      reply,
      extractedInsights:
        insights && typeof insights === "object"
          ? normalizeExtractedInsights(insights)
          : null,
    };
  } catch {
    // Attempt 2: regex extraction (handles LLM wrapping JSON in prose)
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const reply =
          typeof parsed.reply === "string" ? parsed.reply.trim() : "";
        const insights = parsed.extracted_insights;
        if (reply) {
          return {
            reply,
            extractedInsights:
              insights && typeof insights === "object"
                ? normalizeExtractedInsights(insights)
                : null,
          };
        }
      } catch {
        logger.log("[TalentChat] JSON regex fallback parse failed");
      }
    }
    // Final fallback: treat entire raw text as reply, skip extraction
    logger.log("[TalentChat] Using raw text fallback, no extraction this turn");
    return { reply: raw, extractedInsights: null };
  }
}

/** Build bounded "Currently known insights" section for the prompt */
function buildExistingInsightsSection(content: Record<string, string> | null): string {
  if (!content || Object.keys(content).length === 0) return "";
  const MAX_TOTAL = 2000;
  const MAX_PER_VALUE = 150;
  let section = "\n이미 수집된 정보 (재질문 금지, 더 깊은 질문에 활용):\n";
  let totalLen = section.length;
  const sortedEntries = Object.entries(content).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sortedEntries) {
    const truncated = value.length > MAX_PER_VALUE ? value.slice(0, MAX_PER_VALUE) + "..." : value;
    const line = `- "${key}": "${truncated}"\n`;
    if (totalLen + line.length > MAX_TOTAL) break;
    section += line;
    totalLen += line.length;
  }
  return section;
}

function buildInsightExtractionPrompt(
  uncoveredItems: InsightChecklistItem[],
  coveredCount: number,
  totalCount: number,
  currentInsightContent: Record<string, string> | null
): string {
  const checklistLines = uncoveredItems
    .map((item) => `- "${item.key}": ${item.promptHint}`)
    .join("\n");

  const existingInsightsSection = buildExistingInsightsSection(currentInsightContent);

  return `
## Response Format
You MUST return a valid JSON object with exactly these fields:
{
  "reply": "your Korean conversational reply here",
  "extracted_insights": {
    "key_name": { "value": "extracted value", "action": "new" | "update" }
  }
}

## Insight Extraction Rules
Slot coverage: ${coveredCount}/${totalCount} items covered.

### Action Types
- "new": Use when filling a key for the first time (the key has no existing value).
- "update": Use when the user corrects, enriches, or contradicts a previously known insight. The "value" must be the final integrated text combining old and new information, not just the new part.

When using "update", naturally acknowledge the change in your reply (e.g. "그럼 연봉과 문화 둘 다 중요하시다는 거죠?"). Do NOT ask an explicit confirmation question — weave it into the conversation naturally.
If unsure whether something is new or an update, default to "new".
${existingInsightsSection}
### Uncovered Slots (extract when mentioned)
${checklistLines}

Beyond the checklist above, you may also extract any other meaningful career insights you discover in the conversation as free-form keys (e.g. "leadership_experience", "side_project_interests", "industry_network"). Use descriptive snake_case keys and Korean values. Both checklist and free-form keys support "update" if the user revises them.

Only include keys where the user provided clear information. Use Korean for values.
If the conversation naturally covers a topic, extract it. Do NOT ask about all topics at once.
`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();

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

    const [profile, currentInsights] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 3000,
    });

    const currentInsightContent = (currentInsights?.content ?? null) as Record<string, string> | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = (INSIGHT_CHECKLIST.length - uncoveredItems.length);
    const insightExtractionPrompt = buildInsightExtractionPrompt(
      uncoveredItems,
      coveredCount,
      INSIGHT_CHECKLIST.length,
      currentInsightContent
    );

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

    const uncoveredSlotsSection = uncoveredItems.length > 0
      ? "우선 수집할 슬롯:\n" + uncoveredItems.slice(0, 3).map((item) => `- ${item.label}: ${item.promptHint}`).join("\n")
      : "";

    const systemPromptContent = buildCareerSystemPrompt({
      channelType: "Chat",
      candidateName: profile?.name ?? "",
      structuredProfileText,
      resumeFileName: profile?.resume_file_name ?? null,
      resumeLinks: (profile?.resume_links ?? []) as string[],
      userTurnCount,
      existingInsightsSection: buildExistingInsightsSection(currentInsightContent),
      uncoveredSlotsSection,
      slotCoverage: `${coveredCount}/${INSIGHT_CHECKLIST.length} 슬롯 수집 완료.`,
    }) + "\n\n" + insightExtractionPrompt;

    const rawAssistantText = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: systemPromptContent,
        },
        ...llmMessages,
      ],
      temperature: 0.55,
      jsonMode: true,
    });

    const parsedResponse = parseAssistantResponse(rawAssistantText);

    const safeAssistantText =
      parsedResponse.reply.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    // Persist extracted insights with action-aware merge (never blocks chat response)
    if (parsedResponse.extractedInsights) {
      try {
        const processedInsights: Record<string, string> = {};

        for (const [rawKey, extracted] of Object.entries(parsedResponse.extractedInsights)) {
          const key = normalizeTalentInsightKey(rawKey);
          if (!key || !extracted.value) continue;

          const existingValue = currentInsightContent?.[key]?.trim();

          if (extracted.action === "update") {
            if (existingValue && extracted.value.length < existingValue.length * 0.3) {
              logger.log("[TalentChat] Insight update suspiciously shorter", {
                key, existingLen: existingValue.length, newLen: extracted.value.length,
              });
            }
            processedInsights[key] = extracted.value;
            logger.log("[TalentChat] Insight updated", { key, action: "update" });
          } else {
            if (!existingValue) {
              processedInsights[key] = extracted.value;
              logger.log("[TalentChat] Insight created", { key, action: "new" });
            }
          }
        }

        if (Object.keys(processedInsights).length > 0) {
          const finalContent: Record<string, string> = {
            ...(currentInsightContent ?? {}),
            ...processedInsights,
          };

          await upsertTalentInsights({
            admin,
            userId: user.id,
            content: finalContent,
          });
        }
      } catch (insightError) {
        logger.log("[TalentChat] Failed to persist insights", {
          userId: user.id,
          error:
            insightError instanceof Error
              ? insightError.message
              : "Unknown error",
        });
      }
    }

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

    // Completion: coverage-based (no step transitions)
    const newKeysCount = parsedResponse.extractedInsights
      ? Object.entries(parsedResponse.extractedInsights).filter(
          ([key]) =>
            !currentInsightContent?.[normalizeTalentInsightKey(key) ?? ""]?.trim()
        ).length
      : 0;
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const coverageRatio = INSIGHT_CHECKLIST.length > 0
      ? insightsCoveredAfter / INSIGHT_CHECKLIST.length
      : 1;
    const isCompleted = coverageRatio >= TALENT_INTERVIEW_MIN_COVERAGE;

    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        current_step: isCompleted ? 6 : 1,
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (conversationUpdateError) {
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ??
            "Failed to update conversation progress",
        },
        { status: 500 }
      );
    }

    const toResponseMessage = (item: TalentMessageRow) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      messageType: item.message_type ?? "chat",
      createdAt: item.created_at,
    });

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      progress: {
        answeredCount: userTurnCount,
        targetCount: INSIGHT_CHECKLIST.length,
        completed: isCompleted,
        currentStep: isCompleted ? 6 : 1,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
