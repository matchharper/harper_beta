import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProgressFeed } from "./ProgressFeed";

test("expands exact candidate email and Harper relay content independently", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const reactGlobal = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(reactGlobal, {
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });

  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <ProgressFeed
          items={[
            {
              createdAt: "2026-08-31T02:03:34.665Z",
              delivery: {
                bodyText: "후보자에게 실제로 보낸 본문",
                id: "request-1:sent",
                label: "메일 내용",
                subject: "[Wonderful] 일본어 숙련도 확인",
              },
              id: "progress-1",
              text: "요청 내용 · 일본어 숙련도",
              title: "후보자에게 질문을 보냈어요",
            },
            {
              createdAt: "2026-08-31T02:46:20.102Z",
              delivery: {
                bodyText: "Harper가 Slack과 채팅에 전달한 최종 문구",
                id: "request-1:received",
                label: "Harper가 전달한 내용",
                subject: null,
              },
              id: "progress-2",
              text: "요청 내용 · 일본어 숙련도",
              title: "후보자의 답변이 도착했어요",
            },
          ]}
        />
      );
    });

    assert.doesNotMatch(container.textContent ?? "", /실제로 보낸 본문/);
    assert.doesNotMatch(container.textContent ?? "", /Slack과 채팅에 전달/);

    const buttons = Array.from(container.querySelectorAll("button"));
    const emailButton = buttons.find((button) =>
      button.textContent?.includes("메일 내용")
    );
    const relayButton = buttons.find((button) =>
      button.textContent?.includes("Harper가 전달한 내용")
    );
    assert.ok(emailButton);
    assert.ok(relayButton);

    await act(async () => emailButton.click());
    assert.match(container.textContent ?? "", /제목/);
    assert.match(
      container.textContent ?? "",
      /\[Wonderful\] 일본어 숙련도 확인/
    );
    assert.match(container.textContent ?? "", /본문/);
    assert.match(container.textContent ?? "", /후보자에게 실제로 보낸 본문/);

    await act(async () => relayButton.click());
    assert.match(
      container.textContent ?? "",
      /Harper가 Slack과 채팅에 전달한 최종 문구/
    );
  } finally {
    await act(async () => root.unmount());
    Object.assign(reactGlobal, {
      document: previousDocument,
      IS_REACT_ACT_ENVIRONMENT: previousActEnvironment,
      window: previousWindow,
    });
    dom.window.close();
  }
});
