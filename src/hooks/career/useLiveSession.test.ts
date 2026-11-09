import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { readLiveAudioDiagnostics } from "@/lib/career/liveSessionDiagnostics";

test("Live transport reports backend failures and preserves incoming speech", async (t) => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  const noop = () => {};
  const mocks: Record<string, unknown> = {
    react: {
      useCallback: (fn: unknown) => fn,
      useRef: (current: unknown) => ({ current }),
      useState: (value: unknown) => [value, noop],
      useEffect: noop,
    },
    "@/i18n/useCareerMessageFormatter": {
      useCareerMessageFormatter: () => () => "fixture",
    },
    "@/i18n/useMessage": { useMessages: () => ({ locale: "ko" }) },
    "@/lib/career/requestTimeZone": {
      getCareerBrowserTimeZone: () => "Asia/Seoul",
    },
  };
  modules._load = function (request, ...rest) {
    return request in mocks
      ? mocks[request]
      : load.call(this, request, ...rest);
  };
  const originals = new Map(
    ["navigator", "RTCPeerConnection"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  const sent: any[] = [];
  let channel: any;
  let stopped = 0;
  const toolRequests: any[] = [];
  let toolResult: Record<string, unknown> = { output: { results: [] } };
  class Peer {
    iceGatheringState = "complete";
    connectionState = "connected";
    localDescription: unknown;
    addTrack() {}
    async createOffer() {
      return { type: "offer", sdp: "fixture offer" };
    }
    async setLocalDescription(value: unknown) {
      this.localDescription = value;
    }
    async setRemoteDescription() {
      channel.readyState = "open";
      channel.onopen();
      channel.onmessage({ data: JSON.stringify({ type: "session.started" }) });
    }
    createDataChannel() {
      channel = {
        readyState: "connecting",
        send: (value: string) => sent.push(JSON.parse(value)),
        close: () => {
          channel.readyState = "closed";
        },
      };
      return channel;
    }
    async getStats() {
      return new Map();
    }
    getSenders() {
      return [];
    }
    close() {}
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getAudioTracks: () => [
            { enabled: true, muted: false, readyState: "live" },
          ],
          getTracks: () => [{ stop: () => stopped++ }],
        }),
      },
    },
  });
  Object.defineProperty(globalThis, "RTCPeerConnection", {
    configurable: true,
    value: Peer,
  });
  try {
    const { useLiveSession } = await import("./useLiveSession");
    const errors: string[] = [];
    const transcripts: string[] = [];
    const usage: unknown[] = [];
    const ended: unknown[] = [];
    const controller = useLiveSession({
      conversationId: "fixture-conversation",
      fetchWithAuth: async (url, init) => {
        if (url.endsWith("/usage")) usage.push(JSON.parse(String(init?.body)));
        if (url.endsWith("/tool/execute")) {
          toolRequests.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify(toolResult));
        }
        return new Response(
          JSON.stringify({ transport: { sdp: "fixture answer" } })
        );
      },
      onTranscript: (text) => transcripts.push(text),
      onAssistantDelta: noop,
      onAssistantDone: noop,
      onConnectionChange: noop,
      onError: (message) => errors.push(message),
      onEndCallTool: (options) => ended.push(options),
    });
    const receive = (message: unknown) =>
      channel.onmessage({ data: JSON.stringify(message) });
    try {
      assert.equal(
        await controller.connect({
          callSessionId: "fixture-call",
          internalCallRequestId: "fixture-internal-call",
        }),
        true
      );
      await t.test(
        "opening starts backend preparation instead of only asking the frontend to speak",
        () => {
          controller.triggerResponse();
          assert.deepEqual(
            sent.map((event) => event.type),
            ["response.item.create", "response.create"]
          );
          assert.equal(sent[0].item.role, "developer");
          assert.equal(sent[0].item.content[0].type, "input_text");
        }
      );
      await t.test("opening tool results resume the backend once", async () => {
        receive({
          type: "response.event",
          delegation_id: "opening",
          event: {
            type: "response.created",
            response: { id: "opening-response" },
          },
        });
        receive({
          type: "response.event",
          delegation_id: "opening",
          event: {
            type: "response.output_item.done",
            item: {
              type: "function_call",
              call_id: "search-call",
              name: "web_search",
              arguments: '{"query":"fixture interview"}',
            },
          },
        });
        const completed = {
          type: "response.event",
          delegation_id: "opening",
          event: {
            type: "response.completed",
            response: { id: "opening-response" },
          },
        };
        receive(completed);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(toolRequests.length, 1);
        assert.equal(toolRequests[0].name, "web_search");
        assert.equal(sent.at(-2).item.type, "function_call_output");
        assert.equal(sent.at(-2).item.call_id, "search-call");
        assert.equal(sent.at(-1).type, "response.create");
        const count = sent.length;
        receive(completed);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(toolRequests.length, 1);
        assert.equal(sent.length, count);
      });
      await t.test(
        "answer tool sends the active call and refreshes the speaking model before backend continuation",
        async () => {
          const context = {
            callId: "fixture-internal-call",
            revision: "2026-10-28T00:01:00.000Z",
            text: "Question 1: First?\nRecorded response: 모르겠어요",
          };
          toolResult = {
            output: {},
            modelOutput: "Response saved.",
            nextStepInstructions: "Realtime instructions",
            liveSessionUpdate: {
              instructions: "Backend instructions",
              onboardingContext: null,
              internalCallContext: context,
            },
          };
          receive({
            type: "response.event",
            delegation_id: "recording",
            event: {
              type: "response.created",
              response: { id: "record-response" },
            },
          });
          receive({
            type: "response.event",
            delegation_id: "recording",
            event: {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                call_id: "record-call",
                name: "record_call_answers",
                arguments:
                  '{"answers":[{"question_number":1,"response":"모르겠어요"}]}',
              },
            },
          });
          const before = sent.length;
          receive({
            type: "response.event",
            delegation_id: "recording",
            event: {
              type: "response.completed",
              response: { id: "record-response" },
            },
          });
          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(
            toolRequests.at(-1).internalCallRequestId,
            "fixture-internal-call"
          );
          assert.deepEqual(
            sent.slice(before).map((event) => event.type),
            [
              "session.update",
              "session.thinking.append",
              "response.item.create",
              "response.create",
            ]
          );
          assert.ok(sent[before + 1].content.includes(context.text));
          assert.equal(sent[before + 2].item.output, "Response saved.");
          const count = sent.length;
          controller.updateSessionInstructions("Stale", {
            instructions: "Stale",
            onboardingContext: null,
            internalCallContext: {
              ...context,
              revision: "2026-10-28T00:00:00.000Z",
              text: "Response not recorded.",
            },
          });
          assert.equal(sent.length, count);
        }
      );
      await t.test(
        "failed response without usage is surfaced, not treated as success",
        () => {
          receive({
            type: "response.event",
            delegation_id: "delegation-1",
            event: {
              type: "response.failed",
              response: {
                id: "response-1",
                error: {
                  code: "server_error",
                  message: "fixture backend failure",
                },
              },
            },
          });
          assert.equal(errors.at(-1), "fixture backend failure");
          assert.equal(usage.length, 0);
        }
      );
      await t.test(
        "incomplete responses and provider validation errors are surfaced",
        () => {
          receive({
            type: "response.event",
            event: {
              type: "response.incomplete",
              response: { incomplete_details: { reason: "max_output_tokens" } },
            },
          });
          assert.equal(errors.length, 2);
          receive({
            type: "error",
            error: {
              code: "responses_validation_failed",
              message: "fixture unsupported configuration",
            },
          });
          assert.equal(errors.at(-1), "fixture unsupported configuration");
        }
      );
      await t.test(
        "user speech survives the backend failure and is flushed on delegation",
        () => {
          receive({
            type: "session.input_transcript.delta",
            delta: "질문 조건을 ",
          });
          receive({
            type: "session.input_transcript.delta",
            delta: "설명해 주세요.",
          });
          receive({
            type: "session.delegation.created",
            delegation: { id: "delegation-2", response_id: "response-2" },
          });
          assert.deepEqual(transcripts, ["질문 조건을 설명해 주세요."]);
          assert.equal(stopped, 0);
        }
      );
      await t.test("failed closing handoff cannot arm hangup on a later unrelated reply", async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const backend = (event: unknown) => receive({ type: "response.event", delegation_id: "failed-ending", event });
        backend({ type: "response.created", response: { id: "failed-end-request" } });
        backend({ type: "response.output_item.done", item: { type: "function_call", name: "end_call", call_id: "failed-end-call", arguments: '{"complete_onboarding":true}' } });
        backend({ type: "response.completed", response: { id: "failed-end-request" } });
        await new Promise(resolve => setImmediate(resolve));
        backend({ type: "response.failed", response: { id: "failed-end-handoff", error: { message: "closing unavailable" } } });
        assert.equal(errors.at(-1), "closing unavailable");
        backend({ type: "response.created", response: { id: "ordinary-reply" } });
        backend({ type: "response.completed", response: { id: "ordinary-reply" } });
        t.mock.timers.tick(45_000);
        assert.equal(ended.length, 0);
        t.mock.timers.reset();
      });
      await t.test("end_call returns a scheduled result and waits for the final handoff and playback", async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const backend = (event: unknown) => receive({ type: "response.event", delegation_id: "ending", event });
        backend({ type: "response.created", response: { id: "end-request" } });
        backend({ type: "response.output_item.done", item: { type: "function_call", name: "end_call", call_id: "end-1", arguments: '{"complete_onboarding":true}' } });
        const completed = { type: "response.completed", response: { id: "end-request" } };
        backend(completed);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(sent.at(-1).type, "response.create");
        const receipt = sent.at(-2).item.output;
        assert.ok(receipt.includes("scheduled after the final spoken handoff"));
        assert.ok(receipt.includes("still pending"));
        assert.ok(receipt.includes("still connected"));
        const sentCount = sent.length;
        backend(completed);
        receive({ type: "session.output_transcript.delta", delta: "확인할게요." });
        t.mock.timers.tick(20_000);
        assert.equal(ended.length, 0, "interim acknowledgement cannot hang up before the backend handoff");
        assert.equal(sent.length, sentCount, "duplicate terminal events cannot resume or arm hangup twice");
        backend({ type: "response.created", response: { id: "end-handoff" } });
        backend({ type: "response.completed", response: { id: "end-handoff" } });
        receive({ type: "session.output_transcript.delta", delta: "말씀하신 조건으로 살펴볼게요. 감사합니다." });
        t.mock.timers.tick(1400);
        assert.equal(ended.length, 0, "transcript settling is not playback completion");
        t.mock.timers.tick(45_000);
        assert.deepEqual(ended, [{ completeOnboarding: true }]);
        t.mock.timers.reset();
      });
    } finally {
      controller.disconnect();
    }
    assert.equal(stopped, 1);
  } finally {
    modules._load = load;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("audio diagnostics distinguish capture and transmission without leaking device or network identifiers", async () => {
  const diagnostics = await readLiveAudioDiagnostics({
    connectionState: "connected",
    getSenders: () => [
      {
        track: {
          kind: "audio",
          enabled: true,
          muted: false,
          readyState: "live",
          label: "private microphone",
          id: "private-device",
        },
      },
    ],
    getStats: async () =>
      new Map([
        [
          "source",
          {
            type: "media-source",
            kind: "audio",
            audioLevel: 0.3,
            totalAudioEnergy: 0.7,
            totalSamplesDuration: 5,
            trackIdentifier: "private-device",
          },
        ],
        [
          "outbound",
          {
            type: "outbound-rtp",
            kind: "audio",
            bytesSent: 900,
            packetsSent: 12,
            ssrc: 12345,
          },
        ],
        ["candidate", { type: "local-candidate", address: "192.0.2.1" }],
      ]),
  } as unknown as RTCPeerConnection);
  assert.deepEqual(diagnostics, {
    connectionState: "connected",
    tracks: [{ enabled: true, muted: false, readyState: "live" }],
    input: [
      { audioLevel: 0.3, totalAudioEnergy: 0.7, totalSamplesDuration: 5 },
    ],
    outbound: [{ bytesSent: 900, packetsSent: 12 }],
  });
});
