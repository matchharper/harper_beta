import assert from "node:assert/strict";
import test from "node:test";
import {
  addChatComposerToken,
  getChatComposerTokenKeyboardAction,
  normalizeChatComposerTokenSelection,
  reconcileChatComposerTokens,
  splitChatComposerTokenText,
  type ChatComposerToken,
} from "@/lib/chat/composerTokens";

const token: ChatComposerToken<{ roleId: string }> = {
  data: { roleId: "role-1" },
  end: 11,
  id: "token-1",
  start: 5,
  text: "Harper",
};

test("keeps token positions aligned when text changes outside a token", () => {
  assert.deepEqual(
    reconcileChatComposerTokens({
      nextValue: "tell Harper now please",
      previousValue: "tell Harper now",
      tokens: [token],
    }),
    [token]
  );
  assert.deepEqual(
    reconcileChatComposerTokens({
      nextValue: "okay tell Harper now",
      previousValue: "tell Harper now",
      tokens: [token],
    }),
    [{ ...token, end: 16, start: 10 }]
  );
});

test("drops token metadata when its complete range is deleted", () => {
  assert.deepEqual(
    reconcileChatComposerTokens({
      nextValue: "tell  now",
      previousValue: "tell Harper now",
      tokens: [token],
    }),
    []
  );
});

test("cursor navigation and deletion treat a token as one unit", () => {
  assert.deepEqual(
    getChatComposerTokenKeyboardAction({
      end: token.end,
      key: "ArrowLeft",
      start: token.end,
      tokens: [token],
    }),
    { cursor: token.start, kind: "move" }
  );
  assert.deepEqual(
    getChatComposerTokenKeyboardAction({
      end: token.end,
      key: "Backspace",
      start: token.end,
      tokens: [token],
    }),
    { end: token.end, kind: "delete", start: token.start }
  );
  assert.deepEqual(
    getChatComposerTokenKeyboardAction({
      end: token.start,
      key: "Delete",
      start: token.start,
      tokens: [token],
    }),
    { end: token.end, kind: "delete", start: token.start }
  );
});

test("clicks and partial selections cannot leave a cursor inside a token", () => {
  assert.deepEqual(
    normalizeChatComposerTokenSelection({
      end: 6,
      start: 6,
      tokens: [token],
    }),
    { end: token.start, start: token.start }
  );
  assert.deepEqual(
    normalizeChatComposerTokenSelection({
      end: 8,
      start: 2,
      tokens: [token],
    }),
    { end: token.end, start: 2 }
  );
});

test("insertion and rendering preserve structured token metadata", () => {
  const tokens = addChatComposerToken({
    data: token.data,
    end: 11,
    id: token.id,
    nextValue: "tell Harper now",
    previousValue: "tell @ha now",
    start: 5,
    text: token.text,
    tokens: [],
  });
  assert.deepEqual(splitChatComposerTokenText("tell Harper now", tokens), [
    { kind: "text", text: "tell " },
    { kind: "token", text: "Harper", token },
    { kind: "text", text: " now" },
  ]);
});
