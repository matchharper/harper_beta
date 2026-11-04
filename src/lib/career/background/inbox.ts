import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  executeConnectedGmailSearch,
  formatGmailSearchResult,
} from "@/lib/integrations/gmail";
import { readTalentSchedules, formatTalentSchedules } from "../meetings/server";
import type { TalentMeetingSchedule } from "../meetings/types";
import type { CareerBackgroundRun } from "./types";

// Product-specified discovery scope. Exact thread reads deliberately bypass it.
export const CAREER_INTERVIEW_EMAIL_QUERY =
  "newer_than:2y -in:sent {subject:interview subject:면접 subject:인터뷰} {subject:invitation subject:confirmation subject:schedule subject:일정 subject:안내 subject:결과 subject:합격 subject:초대} -category:promotions -category:social -in:spam -in:trash";

export async function prepareCareerInboxContext(
  args: {
    admin: TalentAdminClient;
    userId: string;
    run: CareerBackgroundRun;
    now?: Date;
  },
  dependencies = {
    search: executeConnectedGmailSearch,
    readSchedules: readTalentSchedules,
  }
) {
  const lines: string[] = [];
  const appointments = new Map<string, TalentMeetingSchedule>();
  try {
    const result = await dependencies.search({
      admin: args.admin,
      talentId: args.userId,
      query: CAREER_INTERVIEW_EMAIL_QUERY,
      includeContent: false,
      maxResults: 50,
    });
    lines.push(
      `Automatically retrieved interview email evidence. Discovery query: ${CAREER_INTERVIEW_EMAIL_QUERY}`,
      formatGmailSearchResult(result)
    );
    if (result.nextPageToken)
      lines.push(
        "Older matching email remains outside this page. search_connected_gmail accepts page_token with the same query; this is not a completed mailbox review."
      );
  } catch {
    lines.push(
      "Automatic Gmail retrieval failed. No conclusion about new email or schedule changes is available."
    );
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
      for (const schedule of current.schedules)
        appointments.set(schedule.id, schedule);
    } catch {
      lines.push(
        `Referenced appointment ${id} could not be read; its current state is unknown.`
      );
    }
  }
  for (const schedule of appointments.values())
    for (const thread of schedule.source_refs?.gmailThreadIds ?? [])
      threads.add(thread);
  for (const threadId of threads) {
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
