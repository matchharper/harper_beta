import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("admission and queue show Thinking; concurrent tools retain Working until all finish", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { CareerWorkActivityStatus } = await import("./CareerWorkActivity");
  const render = (props: Parameters<typeof CareerWorkActivityStatus>[0]) =>
    renderToStaticMarkup(createElement(CareerWorkActivityStatus, props));
  assert.match(render({ admitting: true }), /Thinking/);
  assert.match(
    render({ activities: [{ id: "queued", logs: [] }] }),
    /Thinking/
  );
  const active = [
    { id: "first", logs: ["이력서 준비 중"] },
    { id: "second", logs: ["지원 페이지 확인 중"] },
  ];
  const both = render({ activities: active });
  assert.match(both, /Working/);
  assert.match(both, /이력서 준비 중/);
  assert.match(both, /지원 페이지 확인 중/);
  const remaining = render({ activities: active.slice(1) });
  assert.match(remaining, /Working/);
  assert.doesNotMatch(remaining, /이력서 준비 중|Harper가 진행하고 있어요/);
  assert.equal(render({ activities: [] }), "");
});
