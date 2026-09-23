import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";

import { MessagesProvider } from "@/i18n/useMessage";
import CareerMessageBubble from "./CareerMessageBubble";

const router: NextRouter = {
  query: {},
  isReady: true,
  pathname: "/career",
  asPath: "/career",
  basePath: "",
  route: "/career",
  push: async () => true,
  replace: async () => true,
  reload() {},
  back() {},
  forward() {},
  prefetch: async () => {},
  beforePopState() {},
  isFallback: false,
  isPreview: false,
  isLocaleDomain: false,
  events: { on() {}, off() {}, emit() {} },
};

test("renders completed markdown spans while an assistant message is streaming", () => {
  const html = renderToStaticMarkup(
    <RouterContext.Provider value={router}>
      <MessagesProvider locale="ko">
        <CareerMessageBubble
          isUser={false}
          message={{
            id: "streaming-assistant",
            role: "assistant",
            content: "**굵게** ~~취소선~~ `코드`",
            messageType: "chat",
            createdAt: "2026-09-22T00:00:00.000Z",
            typing: true,
            typingMode: "stream",
          }}
        />
      </MessagesProvider>
    </RouterContext.Provider>
  );

  assert.match(html, /<strong[^>]*>굵게<\/strong>/);
  assert.match(html, /<del>취소선<\/del>/);
  assert.match(html, /<code[^>]*>코드<\/code>/);
  assert.doesNotMatch(html, /\*\*굵게\*\*|~~취소선~~/);
});
