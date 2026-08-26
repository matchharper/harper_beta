import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgMeetingAvailabilityUrl,
  buildOrgMeetingScheduleUrl,
  convertMarkdownLinksToSlackMrkdwn,
  formatSlackLink,
} from "@/lib/org/slackMessages";

test("meeting availability URL preserves the workspace and deep-link dialog", () => {
  const url = new URL(buildOrgMeetingAvailabilityUrl("workspace id"));

  assert.equal(url.pathname, "/org/settings");
  assert.equal(url.searchParams.get("dialog"), "interview-availability");
  assert.equal(url.searchParams.get("orgId"), "workspace id");
});

test("meeting schedule URL opens the company schedule detail", () => {
  const url = new URL(
    buildOrgMeetingScheduleUrl("workspace id", "schedule id")
  );

  assert.equal(url.pathname, "/org/inbox");
  assert.equal(url.searchParams.get("dialog"), "interview-schedule");
  assert.equal(url.searchParams.get("orgId"), "workspace id");
  assert.equal(url.searchParams.get("scheduleId"), "schedule id");
});

test("Slack schedule links escape labels and unsafe separators", () => {
  assert.equal(
    formatSlackLink("https://example.com/a|b", "스케줄 <열기>"),
    "<https://example.com/a%7Cb|스케줄 &lt;열기&gt;>"
  );
});

test("converts model-authored web Markdown links before posting to Slack", () => {
  assert.equal(
    convertMarkdownLinksToSlackMrkdwn(
      "[스케줄 열기](https://matchharper.com/org/settings?dialog=interview-availability)에서 설정해 주세요."
    ),
    "<https://matchharper.com/org/settings?dialog=interview-availability|스케줄 열기>에서 설정해 주세요."
  );
});

test("leaves existing Slack links and non-HTTP markers unchanged", () => {
  const value =
    "<https://matchharper.com/org/settings|스케줄 열기> [Members](team)";
  assert.equal(convertMarkdownLinksToSlackMrkdwn(value), value);
});
