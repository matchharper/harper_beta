import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { nextScheduleOccurrence, type CareerSchedule } from "./server";

export type DailySource = {
  id: string;
  available_at: string;
  event: { sourceKind: string; startsAt?: string; [key: string]: unknown };
};
export type ProcessingCandidate = {
  talentId: string;
  sources: DailySource[];
  schedules: CareerSchedule[];
};
export const careerDay = (date: Date) =>
  new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** Existing reservations stay fixed unless their saved contract permits merging. */
export function planCareerProcessing(
  candidate: ProcessingCandidate,
  now: Date
) {
  const day = careerDay(now);
  const dailyAt = new Date(`${day}T09:00:00+09:00`).getTime();
  const due = candidate.schedules.filter(
    (s) => s.next_run_at && Date.parse(s.next_run_at) <= now.getTime()
  );
  const futureFixed = candidate.schedules.filter(
    (s) =>
      s.next_run_at &&
      Date.parse(s.next_run_at) > now.getTime() &&
      careerDay(new Date(s.next_run_at)) === day &&
      s.target_refs.flexibleTiming !== true
  );
  const firstFixed = Math.min(
    ...futureFixed.map((s) => Date.parse(s.next_run_at!))
  );
  const firstAppointment = Math.min(
    ...candidate.sources.flatMap((s) =>
      s.event.sourceKind === "appointment" && s.event.startsAt
        ? [Date.parse(s.event.startsAt)]
        : []
    )
  );
  // Attach to an already planned call unless that misses today's appointment.
  const waitForReservation =
    !due.length && Number.isFinite(firstFixed) && firstFixed < firstAppointment;
  if (
    !due.length &&
    (!candidate.sources.length || now.getTime() < dailyAt || waitForReservation)
  )
    return null;
  const schedules = candidate.schedules.filter(
    (s) =>
      s.next_run_at &&
      (Date.parse(s.next_run_at) <= now.getTime() ||
        (s.target_refs.flexibleTiming === true &&
          careerDay(new Date(s.next_run_at)) === day))
  );
  return {
    sources: candidate.sources.map((s) => s.id),
    schedules: schedules.map((s) => ({
      id: s.id,
      revision: s.revision,
      dueAt: s.next_run_at,
      nextAt: nextScheduleOccurrence(
        s.recurrence,
        s.timezone,
        new Date(Math.max(now.getTime(), Date.parse(s.next_run_at!))),
        s.interval_days
      ),
    })),
  };
}

export async function collectCareerProcessing(args: {
  admin: TalentAdminClient;
  now?: Date;
  limit?: number;
}) {
  if (args.limit === 0) return { runIds: [] as string[], scheduleCount: 0 };
  const now = args.now ?? new Date();
  const rpc = async (name: string, input: Record<string, unknown>) => {
    const { data, error } = await (args.admin.rpc as any)(name, input);
    if (error) throw new Error(error.message);
    return data;
  };
  await rpc("collect_career_daily_sources", { p_now: now.toISOString() });
  const runIds: string[] = [];
  const capacity = args.limit ?? 100;
  let after: string | null = null;
  while (runIds.length < capacity) {
    const candidates: ProcessingCandidate[] = await rpc(
      "list_career_processing_candidates",
      {
        p_now: now.toISOString(),
        p_limit: capacity,
        p_after: after,
      }
    );
    if (!candidates.length) break;
    for (const candidate of candidates) {
      after = candidate.talentId;
      const plan = planCareerProcessing(candidate, now);
      if (!plan) continue;
      const id = await rpc("enqueue_career_processing", {
        p_talent: candidate.talentId,
        p_sources: plan.sources,
        p_schedules: plan.schedules,
        p_now: now.toISOString(),
      });
      if (id) runIds.push(id);
      if (runIds.length === capacity) break;
    }
    if (candidates.length < capacity) break;
  }
  return { runIds, scheduleCount: runIds.length };
}
