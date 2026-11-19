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
