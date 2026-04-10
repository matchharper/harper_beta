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
import { TALENT_INTERVIEW_FINAL_STEP, TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { getStepGuideForPrompt, INTERRUPT_HANDLING_INSTRUCTION } from "@/lib/talentOnboarding/interviewSteps";
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

type StepTransition = { next_step: number } | null;

type ParsedAssistantResponse = {
  reply: string;
  extractedInsights: Record<string, ExtractedInsightValue> | null;
  stepTransition: StepTransition;
};

function parseStepTransition(parsed: Record<string, unknown>): StepTransition {
  const st = parsed.step_transition;
  if (st && typeof st === "object" && !Array.isArray(st)) {
    const nextStep = (st as Record<string, unknown>).next_step;
    if (typeof nextStep === "number" && nextStep >= 1 && nextStep <= 5) {
      return { next_step: nextStep };
    }
  }
  return null;
}

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
      stepTransition: parseStepTransition(parsed),
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
            stepTransition: parseStepTransition(parsed),
          };
        }
      } catch {
        logger.log("[TalentChat] JSON regex fallback parse failed");
      }
    }
    // Final fallback: treat entire raw text as reply, skip extraction
    logger.log("[TalentChat] Using raw text fallback, no extraction this turn");
    return { reply: raw, extractedInsights: null, stepTransition: null };
  }
}

/** Build bounded "Currently known insights" section for the prompt */
function buildExistingInsightsSection(content: Record<string, string> | null): string {
  if (!content || Object.keys(content).length === 0) return "";
  const MAX_TOTAL = 2000;
  const MAX_PER_VALUE = 150;
  let section = "\n## Currently Known Insights (do NOT re-extract unless user corrects or enriches)\n";
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

  const topUncovered = uncoveredItems
    .slice(0, 3)
    .map((item) => `- ${item.promptHint}`)
    .join("\n");

  const existingInsightsSection = buildExistingInsightsSection(currentInsightContent);

  return `
## Response Format
You MUST return a valid JSON object with exactly these fields:
{
  "reply": "your Korean conversational reply here",
  "extracted_insights": {
    "key_name": { "value": "extracted value", "action": "new" | "update" }
  },
  "step_transition": null | { "next_step": <number> }
}

## Step Transition
If the current step's transition condition (described in the interview step guide above) is met, set "step_transition" to { "next_step": <next step number> }.
Otherwise set it to null. Do NOT skip steps — always transition to the immediately next step.

## Insight Extraction Rules
Insight coverage: ${coveredCount}/${totalCount} items covered.

### Action Types
- "new": Use when filling a key for the first time (the key has no existing value).
- "update": Use when the user corrects, enriches, or contradicts a previously known insight. The "value" must be the final integrated text combining old and new information, not just the new part.

When using "update", naturally acknowledge the change in your reply (e.g. "그럼 연봉과 문화 둘 다 중요하시다는 거죠?"). Do NOT ask an explicit confirmation question — weave it into the conversation naturally.
If unsure whether something is new or an update, default to "new".
${existingInsightsSection}
### Uncovered Topics (extract when mentioned)
${checklistLines}

Beyond the checklist above, you may also extract any other meaningful career insights you discover in the conversation as free-form keys (e.g. "leadership_experience", "side_project_interests", "industry_network"). Use descriptive snake_case keys and Korean values. Both checklist and free-form keys support "update" if the user revises them.

Only include keys where the user provided clear information. Use Korean for values.
If the conversation naturally covers a topic, extract it. Do NOT ask about all topics at once.

## Conversation Guidance
Prioritize naturally asking about these uncovered topics (one at a time):
${topUncovered}
`;
}

function buildSystemPrompt(args: {
  profile: TalentUserProfileRow | null;
  structuredProfileText: string;
  shouldSendReliefNudge: boolean;
  userTurnCount: number;
  insightExtractionPrompt: string;
  currentStep: number;
}) {
  const {
    profile,
    structuredProfileText,
    shouldSendReliefNudge,
    userTurnCount,
    insightExtractionPrompt,
    currentStep,
  } = args;
  const linkText = (profile?.resume_links ?? []).join(", ");

  const stepGuide = getStepGuideForPrompt(currentStep);

  return [
    "You are Harper, a Korean AI talent agent for candidate onboarding.",
    "",
    "Always answer in Korean.",
    "Be concise, clear, and warm.",
    "Given the conversation, do all of the following:",
    "1) brief acknowledgement",
    "2) short guidance or summary",
    "3) one next question (if needed).",
    "Avoid markdown tables and long bullet dumps. Your output will be used as a voice script for TTS.",
    "",
    stepGuide,
    "",
    INTERRUPT_HANDLING_INSTRUCTION,
    "",
    insightExtractionPrompt,
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    structuredProfileText || "[Structured Talent Profile]\n(none)",
    "",
    shouldSendReliefNudge
      ? [
          "IMPORTANT: Include this exact nudge once in your response:",
          "지금은 여기까지 해도 됩니다.",
          "지금 정보만으로도 매칭을 시작할 수 있습니다.",
          "After that, optionally ask one lightweight follow-up question.",
        ].join("\n")
      : "Keep the flow moving with one high-signal follow-up question when useful.",
  ].join("\n");
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

    const shouldSendReliefNudge =
      userTurnCount >= 5 &&
      !Boolean((conversation as TalentConversationRow).relief_nudge_sent);

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    const currentStep: number =
      (conversation as TalentConversationRow & { current_step?: number })
        .current_step ?? 1;

    const rawAssistantText = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            profile,
            structuredProfileText,
            shouldSendReliefNudge,
            userTurnCount,
            insightExtractionPrompt,
            currentStep,
          }),
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
        // Step A: Convert {value, action} objects to plain Record<string, string>.
        // IMPORTANT: Must produce plain strings before upsertTalentInsights,
        // because normalizeTalentInsightText (server.ts:212) rejects non-strings.
        const processedInsights: Record<string, string> = {};

        for (const [rawKey, extracted] of Object.entries(parsedResponse.extractedInsights)) {
          const key = normalizeTalentInsightKey(rawKey);
          if (!key || !extracted.value) continue;

          const existingValue = currentInsightContent?.[key]?.trim();

          if (extracted.action === "update") {
            // Update: always write (upsert — works even if key doesn't exist yet)
            if (existingValue && extracted.value.length < existingValue.length * 0.3) {
              logger.log("[TalentChat] Insight update suspiciously shorter", {
                key, existingLen: existingValue.length, newLen: extracted.value.length,
              });
            }
            processedInsights[key] = extracted.value;
            logger.log("[TalentChat] Insight updated", { key, action: "update" });
          } else {
            // New: only write if key is empty/missing
            if (!existingValue) {
              processedInsights[key] = extracted.value;
              logger.log("[TalentChat] Insight created", { key, action: "new" });
            }
          }
        }

        if (Object.keys(processedInsights).length > 0) {
          // Step B: Merge — processedInsights last so "update" keys overwrite existing.
          // Safe because Step A already filtered "new" actions for existing keys.
          const finalContent: Record<string, string> = {
            ...(currentInsightContent ?? {}),
            ...processedInsights,
          };

          // Step C: Upsert — finalContent is Record<string, string>,
          // safe for normalizeTalentInsightContent inside upsertTalentInsights.
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

    // Step transition: if LLM signals a step change, update current_step
    const nextStep = parsedResponse.stepTransition?.next_step ?? null;
    const effectiveStep =
      nextStep && nextStep > currentStep && nextStep <= TALENT_INTERVIEW_FINAL_STEP
        ? nextStep
        : currentStep;

    // Completed when Step 5 reached AND at least 60% of checklist covered
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
    const isCompleted =
      effectiveStep >= TALENT_INTERVIEW_FINAL_STEP &&
      coverageRatio >= TALENT_INTERVIEW_MIN_COVERAGE;
    // Step 6 = post-interview update mode
    const finalStep = isCompleted ? 6 : effectiveStep;
    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        current_step: finalStep,
        relief_nudge_sent: shouldSendReliefNudge
          ? true
          : Boolean((conversation as TalentConversationRow).relief_nudge_sent),
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
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: effectiveStep,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
