import assert from "node:assert/strict";
import test from "node:test";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import {
  billingActionNoticeSlack,
  billingActionNoticeView,
  readBillingActionNotice,
} from "./notice";
import { BILLING_SUPPORT_HREF, billingErrorCopy } from "./types";
import { buildHarperSlackChoiceBlocks } from "../slackChoiceButtons";

test("only a known display notice renders; arbitrary server metadata is not displayed", () => {
  for (const metadata of [
    null,
    {},
    { billingNotice: "credits_exhausted" },
    { billingNotice: { code: "unknown" } },
  ]) {
    assert.equal(readBillingActionNotice(metadata), null);
  }
  assert.deepEqual(
    readBillingActionNotice({
      billingNotice: { code: "credits_exhausted", balance: 123 },
    }),
    { code: "credits_exhausted" }
  );
});

for (const locale of ["ko", "en"] as const) {
  test(`${locale}: chat, Slack and modal share the localized failure copy`, () => {
    const notice = { code: "credits_exhausted" } as const;
    const error = Object.assign(new Error("서버에서 보낸 한국어 오류"), {
      billingCode: notice.code,
    });
    const view = billingActionNoticeView(notice, locale);
    assert.equal(
      view.message,
      localizedOrgErrorMessage(error, locale, "fallback")
    );
    assert.equal(view.message, billingErrorCopy(notice.code, locale));
    assert.equal(view.href, BILLING_SUPPORT_HREF);
    const slack = billingActionNoticeSlack(notice, locale);
    assert.equal(slack.blocks[0].text.text, slack.text);
    assert.match(slack.text, /mailto:/);
    if (locale === "en") assert.doesNotMatch(slack.text, /[가-힣]/);
  });
}

test("unrecognized Korean errors use the English modal fallback", () => {
  assert.equal(
    localizedOrgErrorMessage(
      new Error("한국어 오류"),
      "en",
      "Unable to complete this request."
    ),
    "Unable to complete this request."
  );
});

test("long Slack replies reserve a notice block without losing action buttons", () => {
  const blocks = buildHarperSlackChoiceBlocks({
    choices: [{ label: "View details", userMessage: "Show the details" }],
    sourceJobId: "job",
    maxBlocks: 49,
    text: "A long reply. ".repeat(20_000),
  });
  const delivered = [
    ...blocks,
    ...billingActionNoticeSlack({ code: "credits_exhausted" }, "en").blocks,
  ];
  assert.equal(delivered.length, 50);
  assert.equal(delivered.at(-2)?.type, "actions");
  assert.equal(delivered.at(-1)?.type, "section");
});
