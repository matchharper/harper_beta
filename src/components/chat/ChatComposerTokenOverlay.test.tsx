import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatComposerTokenOverlay } from "./ChatComposerTokenOverlay";

test("renders an opportunity token as a detail button when a click handler is supplied", () => {
  const markup = renderToStaticMarkup(
    <ChatComposerTokenOverlay
      getTokenAriaLabel={(token) => `기회 상세 열기: ${token.text}`}
      onTokenClick={() => undefined}
      segments={[
        {
          kind: "token",
          text: "Harper · Applied AI Engineer",
          token: {
            data: { roleId: "role_1" },
            end: 30,
            id: "recommendation_1",
            start: 0,
            text: "Harper · Applied AI Engineer",
          },
        },
      ]}
    />
  );

  assert.match(markup, /<button/);
  assert.match(markup, /data-chat-composer-token/);
  assert.match(markup, /기회 상세 열기: Harper · Applied AI Engineer/);
  assert.match(markup, /pointer-events-auto/);
  assert.match(markup, /text-base/);
  assert.match(markup, /font-normal/);
  assert.match(markup, /md:text-sm/);
  assert.match(markup, /lg:text-\[14px\]/);
  assert.doesNotMatch(markup, /text-xs/);
  assert.doesNotMatch(markup, /font-medium/);
});

test("allows a caller to keep long token labels on one truncated line", () => {
  const markup = renderToStaticMarkup(
    <ChatComposerTokenOverlay
      onTokenClick={() => undefined}
      segments={[
        {
          kind: "token",
          text: "에스아이에이 · ML Engineer (Runtime Optimization)",
          token: {
            data: { roleId: "role_1" },
            end: 49,
            id: "recommendation_1",
            start: 0,
            text: "에스아이에이 · ML Engineer (Runtime Optimization)",
          },
        },
      ]}
      stackTokens
    />
  );

  assert.match(markup, /max-w-full/);
  assert.match(markup, /min-w-0/);
  assert.match(markup, /truncate/);
  assert.match(
    markup,
    /group-data-\[expanded=false\]\/chat-composer:whitespace-nowrap/
  );
});

test("renders a visual caret at the start of the line after a stacked token", () => {
  const label = "에스아이에이 · ML Engineer (Runtime Optimization)";
  const markup = renderToStaticMarkup(
    <ChatComposerTokenOverlay
      cursorOffset={label.length + 1}
      onTokenClick={() => undefined}
      segments={[
        {
          kind: "token",
          text: label,
          token: {
            data: { roleId: "role_1" },
            end: label.length,
            id: "recommendation_1",
            start: 0,
            text: label,
          },
        },
        { kind: "text", text: " " },
      ]}
      stackTokens
    />
  );

  assert.match(markup, /data-chat-composer-caret/);
  assert.equal(markup.match(/data-chat-composer-caret/g)?.length, 1);
  assert.doesNotMatch(markup, /> <span[^>]+data-chat-composer-caret/);
});
