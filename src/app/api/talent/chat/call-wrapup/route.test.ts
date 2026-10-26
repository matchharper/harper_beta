import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";
import { getOnboardingChecklistCoverageStats } from "@/lib/talentOnboarding/calls";
import { getOnboardingRequiredQuestionKeys } from "@/lib/talentOnboarding/insightChecklist";

// Exercise the actual route and coverage boundary; no production DB/model calls.
test("normal onboarding hangup waits for saved completion, while early stop stays resumable", async (t) => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  let coverage: Record<string, "covered"> = {};
  let alreadyDone = false;
  let extractedTranscript: unknown;
  let extract: () => Promise<void> = async () => {};
  let complete: () => Promise<void> = async () => {};
  let completed = 0;
  let loggedEnds = 0;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { stage: "chat" }, error: null }),
  };
  class MockInterviewRequestError extends Error {
    status = 400;
  }
  const mocks: Record<string, unknown> = {
    "@/lib/supabaseServer": {
      getRequestUser: async () => ({ id: "fixture-user" }),
    },
    "@/lib/talentOnboarding/server": {
      getTalentSupabaseAdmin: () => ({ from: () => chain }),
      fetchTalentSetting: async () => ({
        is_onboarding_done: alreadyDone,
        preferred_locale: "ko",
      }),
      fetchAllTalentContexts: async () => [],
      fetchTalentUserProfile: async () => ({}),
      getCareerOnboardingChecklistCoverage: async () => coverage,
      getOnboardingChecklistCoverageStats,
      projectBriefsToLegacyInsights: () => ({}),
      toTalentMessageResponse: (value: unknown) => value,
    },
    "@/lib/career/mockInterview": {
      readMockInterviewOpportunityId: () => null,
      MockInterviewRequestError,
    },
    "@/lib/talentOnboarding/manualCompletion": {
      completeTalentOnboardingManually: async () => {
        await complete();
        completed++;
        return {
          wrapupMessage: null,
          nextStepsMessage: null,
          opportunityDiscoveryQueued: true,
          opportunityRun: { id: "fixture-run" },
        };
      },
    },
    "@/lib/talentOnboarding/chatInsights": {
      extractAndPersistChatInsights: async (args: any) => {
        extractedTranscript = args.transcript;
        await extract();
        return 1;
      },
    },
    "@/lib/career/realtimeInstructions": {
      buildCareerRealtimeSessionInstructions: async () => ({
        instructions: "updated required topics",
        liveInstructions: "backend",
        liveOnboardingContext: "missing topic",
      }),
    },
    "@/lib/career/llmTools": {
      getCareerRealtimeToolCandidates: () => [{ name: "end_call" }],
    },
    "@/lib/career/prompts": {
      buildCareerInsightExtractionOnlyPrompt: () => "extract",
      buildCareerCallWrapupFallbackFollowUp: () => "나중에 이어가요.",
      buildCareerCallWrapupTurnInstruction: () =>
        "early stop, incomplete onboarding",
    },
    "@/lib/career/chatTurn": {
      runCareerChatTurn: async () => ({
        assistantMessage: { id: 1, content: "나중에 이어가요." },
        progress: { completed: false },
      }),
    },
    "@/lib/talentOnboarding/callNoteGeneration": {
      generateTalentCallNoteForWrapup: async () => ({ status: "skipped" }),
    },
    "@/lib/career/voiceExperiment.server": {
      logCareerVoiceModelCallCompleted: async () => {
        loggedEnds++;
      },
    },
    "@/lib/talentOnboarding/tools": { TALENT_TOOL_NAMES: {} },
    "@/lib/talentOnboarding/conversationSummary": {
      maybeSummarizeTalentConversation: async () => {},
    },
    "@/lib/talentOnboarding/internalOpportunityCallRequest": {},
    "@/lib/career/careerCoachingActivity": {},
    "@/lib/errorAlert": {},
  };
  modules._load = function (request, ...rest) {
    if (request in mocks) return mocks[request];
    return load.call(this, request, ...rest);
  };
  try {
    const { POST } = await import("./route");
    const transcript = [
      { role: "assistant", text: "업무 언어는요?", timestamp: null },
      {
        role: "user",
        text: "한국어와 영어 모두 미팅 가능해요.",
        timestamp: null,
      },
      {
        role: "assistant",
        text: "잘 들었어요. 이 조건으로 살펴볼게요.",
        timestamp: null,
      },
    ];
    const request = (requireOnboardingCompletion = true) =>
      new NextRequest("http://localhost/api/talent/chat/call-wrapup", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "fixture-conversation",
          callSessionId: "00000000-0000-4000-8000-000000000001",
          requireOnboardingCompletion,
          transcript,
          durationSeconds: 180,
        }),
      });
    const core = () =>
      Object.fromEntries(
        getOnboardingRequiredQuestionKeys().map((key) => [
          key,
          "covered" as const,
        ])
      );
    const reset = () => {
      coverage = {};
      completed = 0;
      loggedEnds = 0;
      extractedTranscript = null;
      alreadyDone = false;
      extract = async () => {};
      complete = async () => {};
    };

    await t.test(
      "latest transcript is reconciled before checking readiness and completion is awaited",
      async () => {
        reset();
        coverage = core();
        delete coverage.language;
        let releaseExtraction!: () => void;
        let releaseCompletion!: () => void;
        extract = async () => {
          await new Promise<void>((resolve) => {
            releaseExtraction = resolve;
          });
          coverage = core();
        };
        complete = () =>
          new Promise<void>((resolve) => {
            releaseCompletion = resolve;
          });
        let returned = false;
        const pending = POST(request()).then((response) => {
          returned = true;
          return response;
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(completed, 0);
        assert.equal(returned, false);
        assert.deepEqual(
          extractedTranscript,
          transcript.map(({ role, text }) => ({ role, content: text }))
        );
        releaseExtraction();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(completed, 0);
        assert.equal(returned, false);
        releaseCompletion();
        const body = await (await pending).json();
        assert.equal(body.progress.completed, true);
        assert.equal(completed, 1);
        assert.equal(body.opportunityRun.id, "fixture-run");
        assert.equal(loggedEnds, 1);
      }
    );
    await t.test(
      "a closing or legacy confirmation cannot fill an unanswered required topic",
      async () => {
        reset();
        coverage = { ...core(), final_priority_confirmation: "covered" };
        delete coverage.compensation;
        const body = await (await POST(request())).json();
        assert.equal(body.progress.completed, false);
        assert.equal(body.nextStepInstructions, "updated required topics");
        assert.equal(completed, 0);
        assert.equal(loggedEnds, 0);
      }
    );
    await t.test(
      "extraction failure and completion failure never return success",
      async () => {
        reset();
        extract = async () => {
          throw new Error("fixture extraction failure");
        };
        assert.equal((await POST(request())).status, 500);
        assert.equal(completed, 0);
        assert.equal(loggedEnds, 0);
        reset();
        coverage = core();
        complete = async () => {
          throw new Error("fixture commit failure");
        };
        assert.equal((await POST(request())).status, 500);
        assert.equal(completed, 0);
        assert.equal(loggedEnds, 0);
      }
    );
    await t.test(
      "explicit stop with missing answers leaves onboarding open",
      async () => {
        reset();
        coverage = { search_intensity: "covered" };
        const body = await (await POST(request(false))).json();
        assert.equal(body.progress.completed, false);
        assert.equal(completed, 0);
        assert.equal(extractedTranscript, null);
        assert.equal(loggedEnds, 1);
      }
    );
    await t.test(
      "already committed completion is acknowledged without repeating extraction or completion",
      async () => {
        reset();
        alreadyDone = true;
        const body = await (await POST(request())).json();
        assert.equal(body.progress.completed, true);
        assert.equal(completed, 0);
        assert.equal(extractedTranscript, null);
        assert.equal(loggedEnds, 1);
      }
    );
  } finally {
    modules._load = load;
  }
});
