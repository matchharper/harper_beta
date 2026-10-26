import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";

// Run the production callbacks with an isolated hook host and transport. This
// covers async save/disconnect ordering, not React rendering or actual audio.
test("onboarding end-call callbacks keep the connection until completion is saved", async (t) => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  let effects: Array<() => void> = [];
  let callbacks: any;
  let disconnected = 0;
  let continuations: string[] = [];
  let entries: any[] = [];
  const noop = () => {};
  const session = {
    isAssistantSpeaking: false,
    runAfterCurrentPlayback: (callback: () => void) => callback(),
    updateSessionInstructions: noop,
    triggerResponse: (instructions: string) => {
      continuations.push(instructions);
    },
    markRealtimeAudioTurnSaved: noop,
  };
  const mocks: Record<string, unknown> = {
    react: {
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useRef: (current: unknown) => ({ current }),
      useState: (value: unknown) => [value, noop],
      useEffect: (fn: () => void) => {
        effects.push(fn);
      },
    },
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "@/hooks/career/useCareerVoiceSession": {
      useCareerVoiceSession: (args: unknown) => {
        callbacks = args;
        return session;
      },
    },
    "@/components/career/useCareerVoiceInput": {
      useCareerVoiceInput: () => ({
        inputMode: "call",
        callTranscriptEntries: entries,
        endCallMode: () => {
          disconnected++;
        },
        getCallTranscriptEntries: () => [...entries],
        addCallTranscriptEntry: (role: string, text: string) => {
          entries.push({ role, text });
        },
        finalizeCallAssistantTranscript: (text: string) => {
          entries.push({ role: "assistant", text });
        },
        clearVoiceBuffer: noop,
      }),
    },
    "@/i18n/useCareerT": {
      useCareerT: () => (_key: string, text: string) => text,
    },
    "@/i18n/useCareerMessageFormatter": {
      useCareerMessageFormatter: () => () => "fixture message",
    },
    "@/i18n/useMessage": { useMessages: () => ({ locale: "ko" }) },
    "@/store/useCareerVoiceModelStore": {
      useCareerVoiceModelStore: () => undefined,
    },
    "@/components/toast/toast": { showToast: noop },
    "./opportunityDiscoveryToast": {
      showOpportunityDiscoveryStartedToast: noop,
    },
    "./careerHelpers": { toUiMessage: (message: unknown) => message },
  };
  modules._load = function (request, ...rest) {
    if (request in mocks) return mocks[request];
    return load.call(this, request, ...rest);
  };
  try {
    const { useCareerOnboardingVoice } =
      await import("./useCareerOnboardingVoice");
    const setup = (fetchWithAuth: any) => {
      effects = [];
      entries = [];
      continuations = [];
      disconnected = 0;
      const controller = useCareerOnboardingVoice({
        user: { id: "fixture-user" },
        userId: "fixture-user",
        authLoading: false,
        conversationId: "fixture-conversation",
        messages: [],
        fetchWithAuth,
        isVoiceInteractionLocked: false,
        isOnboardingDone: false,
        appendMessage: noop,
        setChatError: noop,
        setStage: noop,
        enqueueAssistantTypewriter: async () => {},
        onSendChatMessage: noop,
      } as any);
      effects.forEach((effect) => effect());
      return controller;
    };
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const response = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });

    await t.test(
      "last save and completion response both precede disconnect",
      async () => {
        let releaseSave!: () => void;
        let releaseCompletion!: () => void;
        const calls: string[] = [];
        setup(async (url: string, options: any) => {
          calls.push(url);
          if (url.endsWith("/save")) {
            await new Promise<void>((resolve) => {
              releaseSave = resolve;
            });
            return response({});
          }
          const body = JSON.parse(options.body);
          assert.equal(body.requireOnboardingCompletion, true);
          assert.ok(
            body.transcript.some(
              (entry: any) => entry.text === "영어로 미팅할 수 있어요."
            )
          );
          await new Promise<void>((resolve) => {
            releaseCompletion = resolve;
          });
          return response({ progress: { completed: true } });
        });
        callbacks.onTranscript("영어로 미팅할 수 있어요.");
        callbacks.onAssistantDone("잘 들었어요. 이 조건으로 살펴볼게요.");
        callbacks.onEndCallTool({ completeOnboarding: true });
        await tick();
        assert.equal(disconnected, 0);
        assert.equal(calls.length, 1);
        releaseSave();
        await tick();
        assert.equal(disconnected, 0);
        assert.equal(calls.length, 2);
        releaseCompletion();
        await tick();
        assert.equal(disconnected, 1);
      }
    );
    await t.test(
      "missing topics and server failure both keep the call connected",
      async () => {
        for (const result of [
          response({
            progress: { completed: false },
            nextStepInstructions: "updated",
            liveSessionUpdate: {},
          }),
          response({ error: "fixture save failure" }, 500),
        ]) {
          const controller = setup(async () => result);
          controller.handleEndCallMode({ completeOnboarding: true });
          await tick();
          assert.equal(disconnected, 0);
          assert.equal(continuations.length, 1);
        }
      }
    );
    await t.test(
      "a late user transcript is included before normal ending",
      async () => {
        const calls: any[] = [];
        setup(async (url: string, options: any) => {
          calls.push({ url, body: JSON.parse(options.body) });
          return response(
            url.endsWith("/save") ? {} : { progress: { completed: true } }
          );
        });
        callbacks.onUserSpeechStarted({ continuesCurrentUserTurn: false });
        callbacks.onUserSpeechStopped();
        callbacks.onAssistantDone("잘 들었어요.");
        callbacks.onEndCallTool({ completeOnboarding: true });
        await tick();
        assert.equal(calls.length, 0);
        assert.equal(disconnected, 0);
        callbacks.onTranscript("한국어와 영어 모두 가능해요.");
        await tick();
        await tick();
        const wrapup = calls.find((call) => call.url.endsWith("/call-wrapup"));
        assert.ok(
          wrapup.body.transcript.some((entry: any) => entry.role === "user")
        );
        assert.equal(disconnected, 1);
      }
    );
    await t.test(
      "explicit early stop disconnects without waiting for wrapup",
      async () => {
        let release!: () => void;
        const controller = setup(async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return response({ progress: { completed: false } });
        });
        entries.push({ role: "user", text: "나중에 할게요." });
        controller.handleEndCallMode({ completeOnboarding: false });
        assert.equal(disconnected, 1);
        await tick();
        release();
        await tick();
      }
    );
  } finally {
    modules._load = load;
  }
});
