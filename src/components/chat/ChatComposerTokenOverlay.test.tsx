import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatComposerTokenOverlay } from "./ChatComposerTokenOverlay";

test("renders an opportunity token as an inline detail control when a click handler is supplied", () => {
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

  assert.match(markup, /role="button"/);
  assert.match(markup, /data-chat-composer-token/);
  assert.match(markup, /기회 상세 열기: Harper · Applied AI Engineer/);
  assert.match(markup, /pointer-events-auto/);
  assert.doesNotMatch(markup, /<button/);
  assert.doesNotMatch(markup, /inline-flex|inline-block/);
});

test("renders a static official-job token without click semantics", () => {
  const text = "ML/AI Engineer at Top-tier VC-backed AI Legal Tech 포지션";
  const markup = renderToStaticMarkup(
    <ChatComposerTokenOverlay
      isTokenClickable={() => false}
      onTokenClick={() => undefined}
      segments={[
        {
          kind: "token",
          text,
          token: {
            data: { roleId: "role_1" },
            end: text.length,
            id: "official-job:role_1",
            start: 0,
            text,
          },
        },
      ]}
    />
  );

  assert.match(markup, /ML\/AI Engineer/);
  assert.match(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /role="button"/);
  assert.doesNotMatch(markup, /pointer-events-auto|cursor-pointer/);
});

test("keeps token and following text in the textarea's inline flow", () => {
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
        { kind: "text", text: " 질문이 있어요" },
      ]}
    />
  );

  assert.match(markup, /질문이 있어요/);
  assert.doesNotMatch(markup, /\bblock\b|w-fit|truncate/);
  assert.doesNotMatch(markup, /font-(?:medium|semibold|bold)/);
  assert.doesNotMatch(markup, /data-chat-composer-caret/);
});

test("leaves the separator after a token visible so it matches the textarea value", () => {
  const label = "에스아이에이 · ML Engineer (Runtime Optimization)";
  const markup = renderToStaticMarkup(
    <ChatComposerTokenOverlay
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
    />
  );

  assert.match(
    markup,
    /Runtime Optimization\)<\/span><span aria-hidden="true"> <\/span>/
  );
  assert.doesNotMatch(markup, /data-chat-composer-caret/);
});
