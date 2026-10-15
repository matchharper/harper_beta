import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { SimulationNextActionCard } from "./SimulationNextActionCard";
import {
  createSimulationSession,
  type SessionAction,
} from "@/lib/career/simulation/session";

test("reminder shows only the chosen action; stale cards cannot act", () => {
  const s = createSimulationSession({
    roleRef: "role:r",
    roleName: "Role",
    documentId: null,
    documentName: null,
  });
  s.analysisStatus = "completed";
  s.analysisMessageId = 10;
  s.revision = 3;
  const action = (
    id: string,
    status: SessionAction["status"] = "pending"
  ): SessionAction => ({
    id,
    title: `Action ${id}`,
    status,
    category: "wording",
    target: "Resume",
    proposal: "Clarify ownership",
    reason: "Role requirement",
    requirementIds: [],
    evidenceIds: [],
    needsConfirmation: false,
    questions: [],
    executionPrompt: "Clarify ownership",
    resolution: "",
    evidenceMessageId: null,
  });
  s.actions = [
    action("A1", "completed"),
    action("A2"),
    action("A3"),
    action("A4"),
  ];
  s.proposal = {
    actionId: "A3",
    title: "Start with A3",
    reason: "Current focus",
    request: "Help with A3",
  };
  const render = (revision: number) =>
    new JSDOM(
      renderToStaticMarkup(
        <MessagesProvider locale="ko">
          <SimulationNextActionCard
            card={{ sessionMessageId: 1, revision, actionId: "A3" }}
            session={s}
            disabled={false}
            onAction={() => {}}
          />
        </MessagesProvider>
      )
    ).window.document;
  const doc = render(3);
  const starts = [...doc.querySelectorAll("button")].filter(
    (b) => b.textContent === "이 액션 진행하기"
  );
  assert.equal(starts.length, 1);
  assert.match(doc.body.textContent!, /1\. Start with A3/);
  assert.doesNotMatch(doc.body.textContent!, /Action A2/);
  assert.doesNotMatch(doc.body.textContent!, /Action A4/);
  assert.match(doc.body.textContent!, /완료 1 · 건너뜀 0 · 전체 4/);
  assert.equal(
    [...render(2).querySelectorAll("button")].some(
      (b) => b.textContent === "이 액션 진행하기"
    ),
    false
  );
});
