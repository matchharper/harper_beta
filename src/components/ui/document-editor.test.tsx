import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DocumentEditor,
  DocumentEditorPanelProvider,
  copyDocumentText,
  formatDocumentLastChangedAt,
  isDocumentPreviewOverflowing,
} from "@/components/ui/document-editor";

test("renders a taller clickable document preview", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      aria-label="문서 내용"
      documentTitle="Request"
      lastChangedAt="2026-08-13T12:34:00.000Z"
      placeholder="내용을 작성해 주세요."
      readOnly
      savedValue="첫 문장"
      value="첫 문장"
    />
  );

  assert.match(html, /^<div/);
  assert.match(html, /<button/);
  assert.match(html, /data-document-editor-preview=""/);
  assert.match(html, /min-h-\[340px\]/);
  assert.match(html, /max-h-\[440px\]/);
  assert.match(html, /max-h-\[268px\]/);
  assert.match(html, /rounded-lg/);
  assert.match(html, /border-neutral-1000-a05/);
  assert.match(html, /hover:bg-neutral-100/);
  assert.match(html, />Request</);
  assert.match(html, />첫 문장</);
  assert.doesNotMatch(html, /uppercase|tracking-/);
  assert.doesNotMatch(html, /<textarea/);
  assert.match(html, /마지막 변경: .+, 4 글자/);
});

test("detects preview overflow from its rendered height", () => {
  assert.equal(isDocumentPreviewOverflowing(170, 168), true);
  assert.equal(isDocumentPreviewOverflowing(169, 168), false);
  assert.equal(isDocumentPreviewOverflowing(168, 168), false);
});

test("copies the complete document value", async () => {
  let copied = "";

  await copyDocumentText("첫 문장\n\n**두 번째 문장**", {
    writeText: async (value) => {
      copied = value;
    },
  });

  assert.equal(copied, "첫 문장\n\n**두 번째 문장**");
});

test("fails when clipboard access is unavailable", async () => {
  await assert.rejects(() => copyDocumentText("내용", null));
});

test("renders the placeholder for empty and whitespace-only documents", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      documentTitle="Description"
      placeholder="내용을 작성해 주세요."
      readOnly
      savedValue=""
      value="   "
    />
  );

  assert.match(html, /내용을 작성해 주세요\./);
  assert.doesNotMatch(html, />   </);
});

test("renders markdown formatting in a document preview", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      documentTitle="Description"
      format="markdown"
      readOnly
      savedValue={"**핵심 업무**\n\n- 제품 개발"}
      value={"**핵심 업무**\n\n- 제품 개발"}
    />
  );

  assert.match(html, /<strong[^>]*>핵심 업무<\/strong>/);
  assert.match(html, /<ul[^>]*>/);
  assert.doesNotMatch(html, /\*\*핵심 업무\*\*/);
});

test("supports a controlled side panel without rendering another preview", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      documentTitle="Career History.md"
      format="markdown"
      hideMeta
      hidePreview
      open={false}
      savedValue="- Acme - Engineer : Applied."
      value="- Acme - Engineer : Applied."
    />
  );

  assert.doesNotMatch(html, /data-document-editor-preview/);
  assert.doesNotMatch(html, /마지막 변경/);
});

test("notifies the surrounding panel when a document opens", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  let openedDocumentId = "";

  try {
    await act(async () => {
      root.render(
        <DocumentEditorPanelProvider
          onOpenDocument={(documentId) => {
            openedDocumentId = documentId;
          }}
        >
          <DocumentEditor
            documentTitle="Career History"
            readOnly
            savedValue="첫 문장"
            value="첫 문장"
          />
        </DocumentEditorPanelProvider>
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>(
      '[data-document-editor-preview=""]'
    );
    assert.ok(openButton);
    await act(async () => openButton.click());

    assert.ok(openedDocumentId);
    assert.ok(
      container.querySelector('[data-document-editor-panel=""]')
        ?.textContent
    );
  } finally {
    await act(async () => root.unmount());
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    dom.window.close();
  }
});

test("formats recent changes as relative Korean time", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T11:59:30.000Z", now),
    "방금 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T11:42:00.000Z", now),
    "18분 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T05:00:00.000Z", now),
    "7시간 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-05T12:00:00.000Z", now),
    "8일 전"
  );
});

test("formats changes from at least ten days ago as a Korean calendar date", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  assert.equal(
    formatDocumentLastChangedAt("2026-08-03T12:00:00.000Z", now),
    "2026. 8. 3."
  );
  assert.equal(formatDocumentLastChangedAt(null, now), "-");
  assert.equal(formatDocumentLastChangedAt("not-a-date", now), "-");
});
