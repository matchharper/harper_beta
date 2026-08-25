import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChatComposerPickerSelection,
  CHAT_COMPOSER_PICKER_PAGE_SIZE,
  getChatComposerTriggerSearch,
} from "@/lib/chat/composerPicker";

test("replaces a picker trigger with plain selected text", () => {
  const result = applyChatComposerPickerSelection({
    cursor: 2,
    search: { start: 0 },
    selectedText: "김하퍼",
    value: "@김에게 연락해줘",
  });

  assert.deepEqual(result, {
    cursor: 4,
    selectedEnd: 3,
    selectedStart: 0,
    value: "김하퍼 에게 연락해줘",
  });
  assert.equal(
    getChatComposerTriggerSearch({
      cursor: result.cursor,
      triggers: ["@"],
      value: result.value,
    }),
    null
  );
});

test("does not duplicate an existing space after a picker selection", () => {
  const selectedText = "Acme · Backend Engineer";
  assert.deepEqual(
    applyChatComposerPickerSelection({
      cursor: 6,
      search: { start: 3 },
      selectedText,
      value: "이건 @기회 와 비교해줘",
    }),
    {
      cursor: "이건 ".length + selectedText.length,
      selectedEnd: "이건 ".length + selectedText.length,
      selectedStart: "이건 ".length,
      value: "이건 Acme · Backend Engineer 와 비교해줘",
    }
  );
});

test("finds the latest configured composer trigger at the cursor", () => {
  const value = "앞 문장 @인재 /compare 뒤 문장";
  assert.deepEqual(
    getChatComposerTriggerSearch({
      cursor: value.indexOf(" 뒤"),
      triggers: ["@", "/"],
      value,
    }),
    {
      query: "compare",
      start: value.indexOf("/"),
      trigger: "/",
    }
  );
});

test("keeps spaces in a search and closes after a newline or double space", () => {
  assert.deepEqual(
    getChatComposerTriggerSearch({
      cursor: 12,
      triggers: ["@"],
      value: "@Acme Staff",
    }),
    {
      query: "Acme Staff",
      start: 0,
      trigger: "@",
    }
  );
  assert.equal(
    getChatComposerTriggerSearch({
      cursor: 9,
      triggers: ["@"],
      value: "@Acme  새 문장",
    }),
    null
  );
  assert.equal(
    getChatComposerTriggerSearch({
      cursor: 10,
      triggers: ["@"],
      value: "@Acme\n새 문장",
    }),
    null
  );
});

test("picker pages never exceed twenty items", () => {
  assert.equal(CHAT_COMPOSER_PICKER_PAGE_SIZE, 20);
});
