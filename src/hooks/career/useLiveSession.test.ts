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
    const controller = useLiveSession({
      conversationId: "fixture-conversation",
      fetchWithAuth: async (url, init) => {
        if (url.endsWith("/usage")) usage.push(JSON.parse(String(init?.body)));
        if (url.endsWith("/tool/execute")) {
          toolRequests.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ output: { results: [] } }));
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
    });
    const receive = (message: unknown) =>
      channel.onmessage({ data: JSON.stringify(message) });
    try {
      assert.equal(
        await controller.connect({ callSessionId: "fixture-call" }),
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
