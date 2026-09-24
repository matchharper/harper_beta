import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { OrgSlackChannelPicker } from "./OrgSlackChannelPicker";

const channels = [
  { channelId: "C_PUBLIC", channelName: "recruiting", isPrivate: false },
  { channelId: "C_PRIVATE", channelName: "people-team", isPrivate: true },
];
const noop = () => {};

test("offers one compact dark invitation action per channel, without a select or dividers", () => {
  const html = renderToStaticMarkup(
    <OrgSlackChannelPicker
      channels={channels}
      onInvite={noop}
      onRefresh={noop}
      onCreate={noop}
    />
  );
  const { document } = new JSDOM(html).window;
  const list = document.querySelector('ul[aria-label="초대할 Slack 채널"]');
  assert.ok(list);
  assert.equal(list.children.length, 2);
  assert.match(
    list.parentElement!.className,
    /max-h-\[378px\].*overflow-y-auto/
  );
  assert.equal(document.querySelector("select"), null);
  assert.equal(document.querySelector("details"), null);
  assert.doesNotMatch(html, /비공개 채널이 보이지 않나요/);
  assert.doesNotMatch(html, /divide-y|첫 인사가 전송/);
  for (const row of list.children) {
    assert.match(row.className, /py-1\.5/);
    const button = row.querySelector("button")!;
    assert.equal(button.textContent, "초대");
    assert.match(button.className, /bg-neutral-1000/);
    assert.match(button.className, /text-xs/);
    assert.match(button.getAttribute("aria-label")!, /에 Harper 초대$/);
  }
  assert.match(document.body.textContent!, /비공개 채널 people-team/);
  const create = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("새 채널 만들기")
  );
  assert.ok(create);
  assert.match(create.className, /bg-primary/);
});

test("only the active invitation shows progress and all mutation actions are disabled", () => {
  const html = renderToStaticMarkup(
    <OrgSlackChannelPicker
      channels={channels}
      pendingChannelId="C_PRIVATE"
      onInvite={noop}
      onRefresh={noop}
      onCreate={noop}
    />
  );
  const { document } = new JSDOM(html).window;
  assert.equal(
    document.querySelector('[aria-label="recruiting에 Harper 초대"]')!
      .textContent,
    "초대"
  );
  assert.equal(
    document.querySelector('[aria-label="people-team에 Harper 초대"]')!
      .textContent,
    "초대 중"
  );
  assert.ok(
    Array.from(document.querySelectorAll("button")).every(
      (button) => button.disabled
    )
  );
});

test("keeps creation available with no existing channels and hides it when not permitted", () => {
  const enabled = renderToStaticMarkup(
    <OrgSlackChannelPicker
      channels={[]}
      onInvite={noop}
      onRefresh={noop}
      onCreate={noop}
    />
  );
  const restricted = renderToStaticMarkup(
    <OrgSlackChannelPicker channels={[]} onInvite={noop} onRefresh={noop} />
  );
  assert.match(enabled, /초대할 수 있는 채널이 없어요/);
  assert.match(enabled, /새 채널 만들기/);
  assert.doesNotMatch(restricted, /새 채널 만들기/);
});
