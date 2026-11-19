import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  executeConnectedGmailSearch,
  formatGmailSearchResult,
} from "@/lib/integrations/gmail";
import { readTalentSchedules, formatTalentSchedules } from "../meetings/server";
import type { TalentMeetingSchedule } from "../meetings/types";
import type { CareerBackgroundRun } from "./types";

export async function prepareCareerInboxContext(
  args: {
    admin: TalentAdminClient;
    userId: string;
    run: CareerBackgroundRun;
    now?: Date;
    skipGmail?: boolean;
  },
  dependencies: {
    search: typeof executeConnectedGmailSearch;
    readSchedules: typeof readTalentSchedules;
  } = {
    search: executeConnectedGmailSearch,
    readSchedules: readTalentSchedules,
  }
) {
  const lines: string[] = [];
  const appointments = new Map<string, TalentMeetingSchedule>();
  if (args.skipGmail) {
    lines.push("Gmail was not queried in this preview.");
  }
  // References in a work reservation survive beyond the three-day window and include cancelled appointments.
  const events = args.run.trigger_payload?.sourceEvents ?? [];
  const ids = [
    ...new Set<string>(
      events.flatMap((event: any) =>
        Array.isArray(event.targetRefs?.meetingScheduleIds)
          ? (event.targetRefs.meetingScheduleIds as string[])
          : []
      )
    ),
  ];
  const threads = new Set<string>();
  const now = args.now ?? new Date();
  try {
    let offset: number | null = 0;
    do {
      const page = await dependencies.readSchedules({
        admin: args.admin,
        userId: args.userId,
        from: now.toISOString(),
        until: new Date(now.getTime() + 3 * 86400000).toISOString(),
        offset,
      });
      for (const schedule of page.schedules)
        appointments.set(schedule.id, schedule);
      offset = page.nextOffset;
    } while (offset !== null);
  } catch {
    lines.push("Upcoming appointment sources could not be fully read.");
  }
  for (const id of ids) {
    try {
      const current = await dependencies.readSchedules({
        admin: args.admin,
        userId: args.userId,
        scheduleId: id,
      });
      lines.push(
        `Appointment referenced by this work reservation:\n${formatTalentSchedules(current)}`
      );
      for (const schedule of current.schedules) {
        appointments.set(schedule.id, schedule);
        for (const thread of schedule.source_refs?.gmailThreadIds ?? [])
          threads.add(thread);
      }
    } catch {
      lines.push(
        `Referenced appointment ${id} could not be read; its current state is unknown.`
      );
    }
  }
  lines.push(formatTalentSchedules({ schedules: [...appointments.values()] }));
  for (const threadId of args.skipGmail ? [] : threads) {
    try {
      const result = await dependencies.search({
        admin: args.admin,
        talentId: args.userId,
        query: "",
        threadId,
        includeContent: true,
        maxResults: 50,
      });
      lines.push(
        `Current source thread ${threadId}:\n${formatGmailSearchResult(result)}`
      );
    } catch {
      lines.push(
        `Source thread ${threadId} could not be read. Schedule changes in this thread have not been checked.`
      );
    }
  }
  return {
    text: lines.join("\n\n"),
    meetingScheduleVersions: Object.fromEntries(
      [...appointments.values()].map((row) => [row.id, row.version])
    ),
  };
}
