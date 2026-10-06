import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { SimulationStructuredResult } from "./SimulationStructuredResult";
import type { StructuredResult } from "@/lib/career/simulation/structured";

const data: StructuredResult = {
  kind: "review",
  actions: [
    {
      id: "A1",
      category: "content",
      title: "Add customer onboarding",
      target: "Implementation experience",
      proposal: "Describe verified customer work",
      reason: "Supports customer-facing scope",
      requirementIds: ["R1"],
      evidenceIds: ["E1"],
      needsConfirmation: true,
      questions: ["Did you lead the rollout?"],
      executionPrompt: "HIDDEN_INTERNAL_REQUEST",
    },
    {
      id: "A2",
      category: "consistency",
      title: "Unify bullet style",
      target: "All bullets",
      proposal: "Group minor style fixes",
      reason: "Improve readability",
      requirementIds: [],
      evidenceIds: [],
      needsConfirmation: false,
      questions: [],
      executionPrompt: "SECOND_HIDDEN_REQUEST",
    },
  ],
  emptyReason: "",
};

test("action cards expose recommendations and confirmation questions, but no execution prompt or controls", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult data={data} />
    </MessagesProvider>
  );
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll("[data-simulation-action]").length, 2);
  assert.match(doc.body.textContent!, /추천 액션/);
  assert.match(doc.body.textContent!, /Did you lead the rollout/);
  assert.doesNotMatch(doc.body.textContent!, /HIDDEN/);
  assert.equal(
    doc.querySelectorAll('button,a,input,[role="button"]').length,
    0
  );
  assert.equal(doc.querySelectorAll("details").length, 0);
  assert.match(html, /min-w-0/);
  assert.match(html, /break-words/);
});

test("empty action list explains why and English labels render", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <SimulationStructuredResult
        data={{
          kind: "review",
          actions: [],
          emptyReason: "No supported changes needed.",
        }}
      />
    </MessagesProvider>
  );
  assert.match(html, /Recommended actions/);
  assert.match(html, /No supported changes needed/);
  assert.doesNotMatch(html, /data-simulation-action/);
});
