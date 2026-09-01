import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../pages/meeting/[token].tsx", import.meta.url),
  "utf8"
);
const invitationSource = readFileSync(
  new URL("./invitation.ts", import.meta.url),
  "utf8"
);
const serverSource = readFileSync(
  new URL("./invitationServer.ts", import.meta.url),
  "utf8"
);

test("candidate availability reuses the shared company availability layout", () => {
  assert.match(source, /MeetingAvailabilityCalendar/);
  assert.match(source, /MeetingAvailabilitySplitLayout/);
  assert.match(source, /MeetingAvailabilityTimeButton/);
  assert.doesNotMatch(source, /from "@\/components\/ui\/calendar"/);
});

test("candidate availability lists every date group in one scrollable pane", () => {
  assert.match(source, /const slotGroups = useMemo/);
  assert.match(source, /slotGroups\.map\(\(group, index\)/);
  assert.match(source, /formatDateKey\(group\.dateKey, locale\)/);
  assert.match(source, /ref=\{slotListRef\}/);
  assert.match(source, /overflow-y-auto/);
  assert.doesNotMatch(source, /slotsForDate/);
});

test("candidate availability omits the multi-choice suggestion", () => {
  assert.doesNotMatch(source, /chooseHint/);
  assert.doesNotMatch(
    source,
    /만약을 대비해 2~3개의 일정을 선택해주신다면 더 좋습니다/
  );
  assert.doesNotMatch(
    source,
    /Choosing two or three times is helpful when possible/
  );
});

test("candidate time slots match the company 24-hour button design", () => {
  assert.match(source, /hourCycle: "h23"/);
  assert.match(source, /hour: "2-digit"/);
  assert.match(source, /selected && "bg-primary-faded\/50"/);
  assert.doesNotMatch(source, /\bClock\b/);
});

test("candidate dates have flush sticky headings without exposed top spacing", () => {
  assert.match(source, /"scroll-mt-0"/);
  assert.match(source, /sticky top-0 z-10 bg-bg-floating py-4 text-\[13px\]/);
  assert.doesNotMatch(source, /"scroll-mt-0 py-4"/);
});

test("candidate availability exposes and renders the company logo", () => {
  assert.match(invitationSource, /companyLogoUrl: string \| null/);
  assert.match(serverSource, /fetchPublicCompanyLogoUrl/);
  assert.match(serverSource, /companyLogoUrl: await companyLogoUrlPromise/);
  assert.match(source, /<CompanyLogo/);
});

test("candidate availability converts slots into the browser timezone", () => {
  assert.match(source, /resolvedBrowserTimezone/);
  assert.match(source, /dateKeyInTimezone\(slot\.startAt, displayTimezone\)/);
  assert.match(source, /timezoneNotice/);
  assert.match(source, /님의 시간대\(/);
  assert.match(source, /'s time zone \(/);
});

test("submit CTA is always English and appears fixed after a mobile selection", () => {
  assert.equal(source.match(/submit: "Submit availability"/g)?.length, 2);
  assert.equal(source.match(/submitting: "Submitting"/g)?.length, 2);
  assert.match(source, /selectedSlotIds\.length > 0 \? \(/);
  assert.match(source, /fixed inset-x-0 bottom-0/);
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden min-h-\[70px\][^\n]+md:flex/);
});
