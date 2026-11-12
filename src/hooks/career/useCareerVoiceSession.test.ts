import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import type { UseRealtimeSessionArgs } from "./useRealtimeSession";
import { CAREER_REALTIME_MODEL } from "@/lib/career/voiceModel";

test("Career connects to Live by default and retains the explicit Realtime transport", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  const calls: string[] = [];
  const noop = () => {};
  const session = (model: string) => ({
    connect: async () => { calls.push(`${model}:connect`); return true; },
    disconnect: () => calls.push(`${model}:disconnect`),
    sendTextMessage: (text: string) => calls.push(`${model}:${text}`),
  });
  const mocks: Record<string, unknown> = {
    react: {
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useRef: (current: unknown) => ({ current }),
      useState: (value: unknown) => [value, noop],
    },
    "./useLiveSession": { useLiveSession: () => session("live") },
    "./useRealtimeSession": { useRealtimeSession: () => session("realtime") },
  };
  modules._load = function (request, ...rest) {
    return request in mocks ? mocks[request] : load.call(this, request, ...rest);
  };
  try {
    const { useCareerVoiceSession: createVoiceController } = await import("./useCareerVoiceSession");
    const args: UseRealtimeSessionArgs = {
      conversationId: "fixture-conversation",
      fetchWithAuth: async () => { throw new Error("Unexpected HTTP request"); },
      onTranscript: noop,
      onAssistantDelta: noop,
      onAssistantDone: noop,
      onError: noop,
      onConnectionChange: noop,
    };
    for (const modelOverride of [undefined, CAREER_REALTIME_MODEL]) {
      const controller = createVoiceController({ ...args, modelOverride });
      assert.equal(await controller.connect(), true);
      controller.sendTextMessage("hello");
      controller.disconnect();
    }
    assert.deepEqual(calls, [
      "live:connect", "live:hello", "live:disconnect",
      "realtime:connect", "realtime:hello", "realtime:disconnect",
    ]);
  } finally {
    modules._load = load;
  }
});
