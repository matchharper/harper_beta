import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CareerFormView, type CareerFormSubmission } from "./CareerFormCard";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";
import type { CareerForm } from "@/lib/career/forms/schema";

test("stored form renders its fields and edited itemwise answers do not skip siblings", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  const form: CareerForm = {
    formId: 10,
    revision: 2,
    kind: "suggestion",
    items: [
      {
        id: "first",
        type: "textarea",
        label: "관련 경험",
        content: "처음 값",
        positive: {
          id: "answer",
          label: "이 답변 전달",
          message: "이 경험을 참고해줘.",
        },
      },
      { id: "second", type: "text", label: "다른 질문", content: "" },
    ],
    negative: { id: "later", label: "나중에", message: "나중에 답할게." },
  };
  const message = toUiMessage(
    toTalentMessageResponse({
      id: 11,
      conversation_id: "c",
      user_id: "u",
      role: "assistant",
      content: "",
      message_type: "career_form",
      payload: form as never,
      created_at: "2026-10-29T00:00:00Z",
    })
  );
  const submissions: CareerFormSubmission[] = [];
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () =>
      root.render(
        <CareerFormView
          form={message.careerForm!}
          onRespond={(submission) => {
            submissions.push(submission);
          }}
        />
      )
    );
    const textarea = dom.window.document.querySelector("textarea")!;
    assert.equal(textarea.value, "처음 값");
    assert.equal(dom.window.document.querySelectorAll("[required]").length, 0);
    // React's native change listener is installed at import time; call its bound input props.
    const propsKey = Object.keys(textarea).find((key) =>
      key.startsWith("__reactProps$")
    )!;
    await act(async () =>
      (textarea as any)[propsKey].onChange({
        target: { value: "사용자 수정값" },
      })
    );
    assert.equal(textarea.value, "사용자 수정값");
    const button = [...dom.window.document.querySelectorAll("button")].find(
      (entry) => entry.textContent === "이 답변 전달"
    )!;
    await act(async () => button.click());
    assert.deepEqual(submissions[0], {
      actionId: "answer",
      itemId: "first",
      values: { first: "사용자 수정값" },
    });
    assert.equal(dom.window.document.querySelector("input")!.value, "");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});
