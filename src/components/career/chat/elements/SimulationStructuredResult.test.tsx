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
      originalText: "Supported customer onboarding.",
      suggestedText: "Guided customers through product onboarding.",
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
      suggestedText: "An additional supported bullet.",
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

test("action cards retain proposals and hide questions and rationale behind a tooltip", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult data={data} />
    </MessagesProvider>
  );
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll("[data-simulation-action]").length, 2);
  assert.match(doc.body.textContent!, /추천 액션/);
  assert.doesNotMatch(
    doc.body.textContent!,
    /Did you lead the rollout|Supports customer-facing scope|R1/
  );
  assert.match(doc.body.textContent!, /Describe verified customer work/);
  assert.equal(doc.querySelectorAll("button").length, 2);
  assert.match(doc.body.textContent!, /rational/);
  assert.doesNotMatch(doc.body.textContent!, /HIDDEN/);
  assert.equal(doc.querySelectorAll("a,input").length, 0);
  assert.equal(doc.querySelectorAll("details").length, 0);
  assert.match(html, /min-w-0/);
  assert.match(html, /break-words/);
  assert.equal(
    doc.querySelector("del")?.textContent,
    "Supported customer onboarding."
  );
  assert.match(doc.querySelector("del")!.className, /text-critical/);
  assert.match(doc.body.textContent!, /제안 문구 · 예시/);
  assert.equal(
    doc.querySelector(".text-positive")?.textContent,
    "Guided customers through product onboarding."
  );
  assert.equal(doc.querySelectorAll("del").length, 1); // Legacy actions have no fabricated original.
  assert.ok(doc.querySelector(".overflow-x-auto"));
  assert.equal(doc.querySelectorAll(".text-positive").length, 2);
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

test("final fit verdict appears above actions while legacy results omit it", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult
        data={{
          ...data,
          fitVerdict: { level: "stretch", reason: "Core experience gap." },
        }}
      />
    </MessagesProvider>
  );
  const doc = new JSDOM(html).window.document;
  assert.match(
    doc.querySelector('[data-fit-verdict="stretch"]')!.textContent!,
    /현실적으로 어려움/
  );
  assert.ok(
    html.indexOf("Core experience gap.") <
      html.indexOf("data-simulation-action")
  );
});

test("debug table joins source diagnoses to final actions in a collapsed disclosure", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult
        data={{
          ...data,
          actionCoverage: [
            {
              requirementId: "R1",
              actionIds: ["A1"],
              disposition: "action",
              reason: "Profile evidence is missing from resume.",
            },
          ],
        }}
        diagnoses={[
          {
            requirementId: "R1",
            match: "met",
            presentation: "absent",
            rationale: "Source diagnosis",
            evidence: [],
            target: "Experience",
            questions: [],
          },
        ]}
      />
    </MessagesProvider>
  );
  const doc = new JSDOM(html).window.document;
  const debug = doc.querySelector("details")!;
  assert.equal(debug.hasAttribute("open"), false);
  assert.match(debug.textContent!, /충족.*이력서에 빠져 있음/);
  assert.match(debug.textContent!, /A1 · Add customer onboarding/);
  assert.match(doc.body.textContent!, /경험 확인 후 사용할 예시/);
});

test("horizontal action cards expose an individually gated start control", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult
        data={data}
        onStartAction={() => {}}
        canStartAction={(id) => id === "A1"}
      />
    </MessagesProvider>
  );
  const doc = new JSDOM(html).window.document;
  const buttons = [...doc.querySelectorAll("button")].filter(
    (b) => b.textContent === "진행하기"
  );
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].disabled, false);
  assert.equal(buttons[1].disabled, true);
});

test("sequential preparation keeps fit and diagnostics without individual action cards", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <SimulationStructuredResult hideActions data={{...data,fitVerdict:{level:"moderate",reason:"Relevant experience with missing evidence"},comparison:{kind:"comparison",diagnoses:[],observations:[]},actionCoverage:[]}} />
    </MessagesProvider>
  );
  const doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll("[data-simulation-action]").length,0);
  assert.doesNotMatch(doc.body.textContent!,/진행하기|HIDDEN/);
  assert.match(doc.body.textContent!,/Relevant experience with missing evidence/);
  assert.match(doc.body.textContent!,/요건·준비 항목 연결/);
});
