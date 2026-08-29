import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./OrgInterviewAvailabilityDialog.tsx", import.meta.url),
  "utf8"
);

test("meeting availability dropdowns use viewport portal coordinates below their triggers", () => {
  assert.doesNotMatch(source, /portalContainer|setPortalContainer/);
  assert.equal(source.match(/alignItemWithTrigger=\{false\}/g)?.length, 2);
});

test("compact calendar navigation fits within the reserved header space", () => {
  assert.match(
    source,
    /navigationButtonClassName="size-10[^\n]+sm:size-10[^\n]+"/
  );
  assert.match(
    source,
    /navigationHeaderClassName="h-10 px-10 sm:h-11 sm:px-11"/
  );
});

test("quick settings replace the selected days without a separate apply mode", () => {
  assert.doesNotMatch(source, /PresetMode|PRESET_MODE_LABELS|바꾸기|추가하기/);
  assert.match(source, /next\.weeklyRules\[key\] = \[interval\]/);
});

test("date override hours use two columns from the small breakpoint", () => {
  const timelineStart = source.indexOf("function HourTimeline");
  const timelineEnd = source.indexOf("function DateOverridePanel");
  const timeline = source.slice(timelineStart, timelineEnd);

  assert.match(timeline, /grid gap-1\.5 pb-1 sm:grid-cols-2/);
});

test("synced Google Calendar blocks are shown on the date picker and can be made available again", () => {
  assert.match(source, /calendarBusy: isCalendarBusyDate/);
  assert.match(source, /after:bg-info/);
  assert.match(source, /Google Calendar에서 가져온 일정/);
  assert.match(source, /미팅 가능으로 설정/);
  assert.match(source, /useUpdateOrgGoogleCalendarBusyBlock/);
});
