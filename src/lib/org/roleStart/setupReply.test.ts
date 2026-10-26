import assert from "node:assert/strict";
import test from "node:test";
import { roleSetupReply } from "./setupReply";

type Message = Parameters<typeof roleSetupReply>[0][number];
const setup: Message = {
  role: "assistant",
  status: "completed",
  content: "역할 정보를 작성했어요.",
  metadata: { roleCreationView: "role_setup" },
};
const question: Message = {
  role: "assistant",
  status: "completed",
  content: "희망 연봉 범위가 어떻게 되나요?",
  metadata: { roleStartQuestion: { questionId: "question", chips: [], status: "pending" } },
};

test("background questions and later chat messages cannot replace the Setup response", () => {
  const messages: Message[] = [
    setup,
    question,
    { role: "user", status: "completed", content: "답변", metadata: {} },
    { role: "assistant", status: "completed", content: "질문을 마쳤어요.", metadata: { roleStartBriefReady: { href: "/" } } },
    { role: "assistant", status: "completed", content: "일반 대화 답변", metadata: { source: "org_role_creation_assistant" } },
  ];
  assert.equal(roleSetupReply(messages), setup.content);
});

test("the latest completed role edit replaces Setup while subsequent questions stay separate", () => {
  const edit: Message = {
    role: "assistant", status: "completed", content: "근무지를 수정했어요.",
    metadata: { roleCreationView: "role_details" },
  };
  assert.equal(roleSetupReply([setup, question, edit, question]), edit.content);
});

test("missing or legacy origins leave the Setup response empty", () => {
  assert.equal(roleSetupReply([]), "");
  assert.equal(roleSetupReply([question, {
    role: "assistant", status: "completed", content: "과거 응답",
    metadata: { source: "org_role_creation_assistant" },
  }]), "");
  assert.equal(roleSetupReply([{ ...setup, role: "user" }]), "");
  assert.equal(roleSetupReply([{ ...setup, status: "pending" }]), "");
  assert.equal(roleSetupReply([{ ...setup, status: "failed" }]), "");
});
