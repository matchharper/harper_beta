import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Google Calendar refreshes automatically at the requested entry points", () => {
  const availability = source("src/lib/meetings/availabilityServer.ts");
  const invitation = source("src/lib/meetings/invitationServer.ts");
  const integration = source("src/lib/integrations/googleCalendarServer.ts");
  const integrationHook = source("src/hooks/org/useOrgGoogleCalendar.ts");

  assert.match(
    integration,
    /onActiveConnection[\s\S]*syncGoogleCalendarBusyBlocksIfStaleForCompanyUser/
  );
  assert.match(integrationHook, /queryKeys\.org\.meetingAvailabilityAll/);
  assert.match(
    availability,
    /fetchMeetingAvailability[\s\S]*syncGoogleCalendarBusyBlocksIfStaleForCompanyUser[\s\S]*fetchCalendarBusyBlocksForCompanyUser/
  );
  assert.match(
    invitation,
    /calculateCompanyPreviewSlots[\s\S]*syncGoogleCalendarBusyBlocksIfStaleForCompanyUser[\s\S]*computeCurrentMeetingSlots/
  );
  assert.match(
    invitation,
    /fetchPublicMeetingInvitation[\s\S]*await refreshInvitationOrganizerCalendar\(context\)/
  );
  assert.match(
    invitation,
    /submitPublicMeetingOptions[\s\S]*await refreshInvitationOrganizerCalendar\(context, true\)/
  );
});

test("automatic refresh reuses existing sync state and exposes no manual API", () => {
  const syncServer = source("src/lib/meetings/calendarSyncServer.ts");
  const hook = source("src/hooks/org/useOrgMeetingAvailability.ts");

  assert.match(syncServer, /state\.last_synced_at/);
  assert.doesNotMatch(hook, /useSyncOrgGoogleCalendar|calendar-sync/);
  assert.equal(
    existsSync(
      resolve(
        process.cwd(),
        "src/app/api/org/meeting-availability/calendar-sync/route.ts"
      )
    ),
    false
  );
});
