import assert from "node:assert/strict";
import test from "node:test";
import { Editor } from "@tiptap/core";
import { JSDOM } from "jsdom";
import {
  createMarkdownEditorExtensions,
  normalizeMarkdownEditorLinkHref,
  resolveMarkdownBubbleMenuContainer,
  shouldEmitMarkdownEditorUpdate,
  shouldShowMarkdownBubbleMenu,
} from "./markdown-rich-text-editor";

function createTestEditor(markdown: string) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.assign(globalThis, {
    document: dom.window.document,
    navigator: dom.window.navigator,
    window: dom.window,
  });

  return new Editor({
    content: markdown,
    contentType: "markdown",
    element: dom.window.document.createElement("div"),
    extensions: createMarkdownEditorExtensions(),
  });
}

test("round-trips the supported role description markdown", () => {
  const markdown = [
    "## 역할 소개",
    "",
    "**굵게**, *기울임*, ~~취소선~~, `inlineCode`",
    "",
    "- 첫 번째 업무",
    "- 두 번째 업무",
    "",
    "[Harper](https://matchharper.com)",
  ].join("\n");
  const editor = createTestEditor(markdown);

  assert.equal(editor.getMarkdown(), markdown);
  editor.destroy();
});

test("does not change markdown when focusing a document that ends with a list", () => {
  const markdown = [
    "## 역할 소개",
    "",
    "- 첫 번째 업무",
    "- 두 번째 업무",
  ].join("\n");
  const editor = createTestEditor(markdown);

  editor.commands.setTextSelection(1);

  assert.equal(editor.getMarkdown(), markdown);
  editor.destroy();
});

test("does not emit a value change for focus-only editor updates", () => {
  assert.equal(shouldEmitMarkdownEditorUpdate({ docChanged: false }), false);
  assert.equal(shouldEmitMarkdownEditorUpdate({ docChanged: true }), true);
});

test("changes a text block between paragraph, level 2, and level 3 headings", () => {
  const editor = createTestEditor("역할 소개");
  editor.commands.setTextSelection(2);

  assert.equal(editor.commands.setHeading({ level: 2 }), true);
  assert.equal(editor.getMarkdown().trimEnd(), "## 역할 소개");

  assert.equal(editor.commands.setHeading({ level: 3 }), true);
  assert.equal(editor.getMarkdown().trimEnd(), "### 역할 소개");

  assert.equal(editor.commands.setParagraph(), true);
  assert.equal(editor.getMarkdown().trimEnd(), "역할 소개");
  editor.destroy();
});

test("only shows the formatting bubble menu for a non-empty text selection", () => {
  const visibleState = {
    codeBlockActive: false,
    editable: true,
    editorFocused: true,
    menuFocused: false,
    selectionEmpty: false,
  };

  assert.equal(shouldShowMarkdownBubbleMenu(visibleState), true);
  assert.equal(
    shouldShowMarkdownBubbleMenu({
      ...visibleState,
      selectionEmpty: true,
    }),
    false
  );
  assert.equal(
    shouldShowMarkdownBubbleMenu({
      ...visibleState,
      editorFocused: false,
      menuFocused: true,
    }),
    true
  );
});

test("keeps the formatting bubble menu inside the closest dialog", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const dialog = dom.window.document.createElement("div");
  const editorContainer = dom.window.document.createElement("div");
  const editorElement = dom.window.document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.append(editorContainer);
  editorContainer.append(editorElement);
  dom.window.document.body.append(dialog);

  assert.equal(
    resolveMarkdownBubbleMenuContainer(editorElement, editorContainer),
    dialog
  );

  dialog.removeAttribute("role");
  assert.equal(
    resolveMarkdownBubbleMenuContainer(editorElement, editorContainer),
    editorContainer
  );
});

test("preserves existing tables and images without exposing insert controls", () => {
  const markdown = [
    "| 항목 | 내용 |",
    "| --- | --- |",
    "| 위치 | 서울 |",
    "",
    "![팀 사진](https://example.com/team.png)",
  ].join("\n");
  const editor = createTestEditor(markdown);
  const serialized = editor.getMarkdown();

  assert.match(serialized, /\| 항목\s+\| 내용\s+\|/);
  assert.match(serialized, /\| 위치\s+\| 서울\s+\|/);
  assert.match(serialized, /!\[팀 사진\]\(https:\/\/example\.com\/team\.png\)/);
  editor.destroy();
});

test("normalizes safe link values and rejects unsafe protocols", () => {
  assert.equal(
    normalizeMarkdownEditorLinkHref("matchharper.com/jobs"),
    "https://matchharper.com/jobs"
  );
  assert.equal(
    normalizeMarkdownEditorLinkHref("hello@matchharper.com"),
    "mailto:hello@matchharper.com"
  );
  assert.equal(
    normalizeMarkdownEditorLinkHref("https://example.com"),
    "https://example.com"
  );
  assert.equal(normalizeMarkdownEditorLinkHref("javascript:alert(1)"), null);
  assert.equal(normalizeMarkdownEditorLinkHref(""), "");
});
