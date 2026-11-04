import assert from "node:assert/strict";
import test from "node:test";
import { en } from "@/lang/en";
import type { MessageDictionary } from "./useMessage";
import { formatCareerMessage } from "./careerMessage";

test("career translations load with nested namespaces and still resolve source text", () => {
  assert.equal(
    formatCareerMessage(en as unknown as MessageDictionary, "지원 브라우저"),
    "Application browser"
  );
  assert.equal(
    formatCareerMessage(en as unknown as MessageDictionary, "저장된 질문 {count}개", { count: 2 }),
    "2 saved questions"
  );
});
