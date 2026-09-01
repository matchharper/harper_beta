import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./OrgInterviewAvailabilityDialog.tsx", import.meta.url),
  "utf8"
);
const layoutSource = readFileSync(
  new URL("../../meetings/MeetingAvailabilityLayout.tsx", import.meta.url),
  "utf8"
);

test("meeting availability dropdowns stay inside the dialog scroll boundary", () => {
  assert.match(
    source,
    /const \[portalContainer, setPortalContainer\] = useState<HTMLDivElement \| null>/
  );
  assert.match(source, /ref=\{setPortalContainer\}/);
  assert.ok((source.match(/container=\{portalContainer\}/g)?.length ?? 0) >= 4);
  assert.match(source, /<Popover\.Portal container=\{portalContainer\}>/);
  assert.match(source, /className="z-\[110\][^"]+"/);
  assert.match(source, /!inset-0[^\n]+!translate-x-0 !translate-y-0/);
  assert.equal(source.match(/alignItemWithTrigger=\{false\}/g)?.length, 2);
});

test("compact calendar navigation fits within the reserved header space", () => {
  assert.match(layoutSource, /size-10 hover:bg-neutral-100 sm:size-10/);
  assert.match(layoutSource, /h-10 px-10 sm:h-11 sm:px-11/);
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
  assert.match(timeline, /MeetingAvailabilityTimeButton/);
  assert.match(
    layoutSource,
    /min-h-9 w-full justify-between tabular-nums text-neutral-primary/
  );
});

test("synced Google Calendar blocks are shown inline and can be made available again", () => {
  const timelineStart = source.indexOf("function HourTimeline");
  const timelineEnd = source.indexOf("function DateOverridePanel");
  const timeline = source.slice(timelineStart, timelineEnd);

  assert.match(source, /calendarBusy: isCalendarBusyDate/);
  assert.match(source, /after:bg-action/);
  assert.match(source, /after:bottom-1\.5/);
  assert.doesNotMatch(source, /after:bottom-0\.5/);
  assert.doesNotMatch(source, /after:bg-info/);
  assert.match(timeline, /calendarBusyBlockOverlapsTimeRange/);
  assert.match(timeline, /bg-action-faded/);
  assert.match(timeline, /src="\/images\/logos\/calendar\.png"/);
  assert.match(timeline, /자동 불가 처리/);
  assert.match(timeline, /onMakeCalendarBusyBlocksAvailable/);
  assert.match(source, /useUpdateOrgGoogleCalendarBusyBlock/);
  assert.doesNotMatch(source, /Google Calendar에서 가져온 일정/);
  assert.doesNotMatch(source, /미팅 가능으로 설정|다시 제외하기/);
  assert.doesNotMatch(
    source,
    /파란 점은 Google Calendar 일정으로 제외된 시간이 있는 날이에요/
  );
});

test("available Calendar days keep square height and connect to adjacent available days", () => {
  assert.match(source, /MeetingAvailabilityCalendar/);
  assert.match(layoutSource, /available-day/);
  assert.match(
    layoutSource,
    /available-day\+_\.available-day>button\]:rounded-l-none/
  );
  assert.match(
    layoutSource,
    /available-day:has\(\+_\.available-day\)>button\]:rounded-r-none/
  );
  assert.doesNotMatch(
    layoutSource,
    /button\[data-day\]\]:(?:aspect-auto|h-(?:7|8))/
  );
});

test("today uses only a light outline without the shared blue fill", () => {
  assert.match(
    layoutSource,
    /\[&>button\]:ring-1 \[&>button\]:ring-inset \[&>button\]:ring-neutral-1000-a10/
  );
  assert.doesNotMatch(layoutSource, /today:\s*"[^"]*bg-action-faded/);
});

test("connected Calendar is informational and refreshes when the dialog opens", () => {
  assert.match(
    source,
    /useOrgMeetingAvailability\(\{\s*enabled: open,\s*workspaceId,\s*\}\)/
  );
  assert.match(source, /aria-label="Google Calendar 연동됨"/);
  assert.match(source, /className="bg-black\/5 text-neutral-primary"/);
  assert.match(
    source,
    /5분 단위로, 그리고 일정 선택을 요청받은 사람이 달력을 열 때 자동으로 일정을 읽어와 불가능한 시간을 처리합니다\./
  );
  assert.doesNotMatch(source, /Calendar Sync|syncGoogleCalendar|syncMessage/);
  assert.doesNotMatch(source, /useSyncOrgGoogleCalendar/);
});
