import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type {
  CareerBackgroundLogPage,
  CareerBackgroundToolLog,
} from "@/lib/career/background/toolTrace";

test("run modal appends every page, displays inputs/results/errors, stops polling and reopens without executing", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/career/tasks",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const requests: number[] = [];
  const calls: CareerBackgroundToolLog[] = [
    {
      id: 1,
      executionId: "loader",
      callId: "call-1",
      name: "load_career_capabilities",
      phase: "started",
      occurredAt: "2026-11-02T00:00:00Z",
      inputText: '{"capabilities":["opportunities"]}',
    },
    {
      id: 2,
      executionId: "loader",
      name: "load_career_capabilities",
      phase: "returned",
      occurredAt: "2026-11-02T00:00:01Z",
      durationMs: 1000,
      resultText: "Capability ready",
    },
    {
      id: 3,
      executionId: "read",
      name: "read_matching",
      phase: "started",
      occurredAt: "2026-11-02T00:00:02Z",
      inputText: '{"id":"matching"}',
    },
    {
      id: 4,
      executionId: "read",
      name: "read_matching",
      phase: "threw",
      occurredAt: "2026-11-02T00:00:03Z",
      durationMs: 500,
      errorText: "<script>not executable</script> Missing matching",
    },
  ];
  let finished = false;
  const fetchWithAuth = async (url: string, init?: RequestInit) => {
    assert.ok(
      !init?.method || init.method === "GET",
      "opening a viewer must not start another run"
    );
    const cursor = Number(
      new URL(url, "http://localhost").searchParams.get("after")
    );
    requests.push(cursor);
    const logs = finished
      ? calls.filter((log) => log.id > cursor)
      : calls.filter((log) => log.id > cursor).slice(0, 2);
    const hasMore = !finished && cursor === 0;
    if (!hasMore) finished = true;
    return Response.json({
      run: {
        id: "run",
        status: finished ? "completed" : "handed_off",
        error: null,
        outcome: finished ? "no_send" : null,
      },
      logs,
      nextCursor: logs.at(-1)?.id ?? cursor,
      hasMore,
    } satisfies CareerBackgroundLogPage);
  };
  modules._load = function (request: string, ...args: any[]) {
    if (request === "@/hooks/career/useCareerApi")
      return { useCareerApi: () => ({ fetchWithAuth }) };
    if (request === "@/components/common/TalentCareerModal")
      return {
        __esModule: true,
        default: ({ title, children, onClose }: any) => (
          <section role="dialog" aria-label={title}>
            <button onClick={onClose}>닫기</button>
            {children}
          </section>
        ),
      };
    return originalLoad.call(this, request, ...args);
  };
  const root = createRoot(dom.window.document.getElementById("root")!);
  let closes = 0;
  try {
    const { default: Modal } = await import("./CareerAgentRunDevModal");
    const props = {
      runId: "run",
      pending: false,
      error: "",
      onRetry: () => assert.fail("unexpected retry"),
      onClose: () => {
        closes++;
      },
    };
    await act(async () => {
      root.render(<Modal {...props} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const content = dom.window.document.body.textContent ?? "";
    assert.equal(
      dom.window.document
        .querySelector('[role="dialog"]')
        ?.getAttribute("aria-label"),
      "Career agent 실행 로그"
    );
    assert.match(content, /도구 호출 2건/);
    assert.match(content, /opportunities/);
    assert.match(content, /Capability ready/);
    assert.match(content, /Missing matching/);
    assert.match(content, /이메일 없이 완료/);
    assert.equal(dom.window.document.querySelectorAll("script").length, 0);
    assert.equal(dom.window.document.querySelectorAll("li").length, 2);
    assert.deepEqual(requests, [0, 2]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    assert.deepEqual(
      requests,
      [0, 2],
      "completed runs stop polling after the last page"
    );
    await act(async () => {
      (
        dom.window.document.querySelector("button") as HTMLButtonElement
      ).click();
    });
    assert.equal(closes, 1);
    await act(async () => {
      root.render(null);
    });
    await act(async () => {
      root.render(<Modal {...props} />);
    });
    assert.deepEqual(requests, [0, 2, 0]);
    assert.equal(dom.window.document.querySelectorAll("li").length, 2);
  } finally {
    await act(async () => root.unmount());
    modules._load = originalLoad;
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
