import "server-only";

import { createHash } from "node:crypto";

import { extractMeetingInvitationPathFromQueuePayload } from "@/lib/meetings/invitationPath";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

const INVITATION_QUEUE_TYPE = "meeting_schedule_candidate_invitation";
const ACTIVE_ROUND_STATUSES = new Set(["queued", "sent"]);

type PendingMeetingScheduleRow = {
  active_round_id: string | null;
  id: string;
  role_id: string;
  title: string;
  updated_at: string;
};

type PendingMeetingRoundRow = {
  delivery_queue_id: string | null;
  id: string;
  invitation_expires_at: string | null;
  invitation_snapshot: unknown;
  public_token_hash: string | null;
  schedule_id: string;
  status: string;
  submitted_at: string | null;
};

export type TalentPendingMeetingSchedule = {
  companyName: string;
  roleId: string;
  roleTitle: string;
  scheduleId: string;
};

function cleanText(value: unknown, fallback = "", maxLength = 1000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function invitationPathMatchesHash(path: string, expectedHash: unknown) {
  const token = path.startsWith("/meeting/")
    ? path.slice("/meeting/".length)
    : "";
  const hash = cleanText(expectedHash, "", 64);
  return Boolean(
    token && hash && createHash("sha256").update(token).digest("hex") === hash
  );
}

function isCurrentPendingRound(round: PendingMeetingRoundRow, now: string) {
  const expiresAt = new Date(round.invitation_expires_at ?? "").getTime();
  return Boolean(
    ACTIVE_ROUND_STATUSES.has(cleanText(round.status, "", 40)) &&
    !round.submitted_at &&
    Number.isFinite(expiresAt) &&
    expiresAt > new Date(now).getTime() &&
    round.delivery_queue_id &&
    round.public_token_hash
  );
}

function invitationPathFromStoredBodies(args: {
  emailBody?: unknown;
  expectedHash: unknown;
  queuePayload?: unknown;
}) {
  const path =
    extractMeetingInvitationPathFromQueuePayload(args.queuePayload) ??
    extractMeetingInvitationPathFromQueuePayload({ body: args.emailBody });
  return path && invitationPathMatchesHash(path, args.expectedHash)
    ? path
    : null;
}

export async function fetchPendingTalentMeetingSchedules(args: {
  admin: TalentAdminClient;
  limit: number;
  talentId: string;
}): Promise<TalentPendingMeetingSchedule[]> {
  const now = new Date().toISOString();
  const { data: scheduleData, error: scheduleError } = await (
    args.admin.from("meeting_schedules" as any) as any
  )
    .select("id, role_id, title, active_round_id, updated_at")
    .eq("talent_id", args.talentId)
    .eq("status", "awaiting_talent")
    .not("active_round_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(args.limit);
  if (scheduleError) throw scheduleError;

  const schedules = (scheduleData ?? []) as PendingMeetingScheduleRow[];
  const roundIds = schedules.flatMap((schedule) =>
    schedule.active_round_id ? [schedule.active_round_id] : []
  );
  if (roundIds.length === 0) return [];

  const { data: roundData, error: roundError } = await (
    args.admin.from("meeting_schedule_rounds" as any) as any
  )
    .select(
      "id, schedule_id, status, submitted_at, invitation_expires_at, invitation_snapshot, delivery_queue_id, public_token_hash"
    )
    .in("id", roundIds);
  if (roundError) throw roundError;

  const rounds = ((roundData ?? []) as PendingMeetingRoundRow[]).filter(
    (round) => isCurrentPendingRound(round, now)
  );
  const queueIds = rounds.flatMap((round) =>
    round.delivery_queue_id ? [round.delivery_queue_id] : []
  );
  if (queueIds.length === 0) return [];

  const [queueResult, emailResult] = await Promise.all([
    (args.admin.from("contact_queue" as any) as any)
      .select("id, payload")
      .in("id", queueIds)
      .eq("type", INVITATION_QUEUE_TYPE)
      .eq("user_id", args.talentId),
    (args.admin.from("career_email_messages" as any) as any)
      .select("body_text, metadata, occurred_at")
      .eq("talent_id", args.talentId)
      .eq("direction", "outbound")
      .eq("mail_type", INVITATION_QUEUE_TYPE)
      .eq("status", "sent")
      .in("metadata->>contactQueueId", queueIds)
      .order("occurred_at", { ascending: false }),
  ]);
  const { data: queueData, error: queueError } = queueResult;
  const { data: emailData, error: emailError } = emailResult;
  if (queueError) throw queueError;
  if (emailError) throw emailError;

  const queuePayloadById = new Map<string, unknown>(
    (queueData ?? []).map((queue: { id: string; payload: unknown }) => [
      queue.id,
      queue.payload,
    ])
  );
  const emailBodyByQueueId = new Map<string, unknown>();
  for (const email of emailData ?? []) {
    const metadata = isRecord(email.metadata) ? email.metadata : {};
    const queueId = cleanText(metadata.contactQueueId, "", 160);
    if (queueId && !emailBodyByQueueId.has(queueId)) {
      emailBodyByQueueId.set(queueId, email.body_text);
    }
  }
  const roundById = new Map(rounds.map((round) => [round.id, round]));

  return schedules.flatMap((schedule) => {
    const round = schedule.active_round_id
      ? roundById.get(schedule.active_round_id)
      : null;
    if (
      !round ||
      round.schedule_id !== schedule.id ||
      !round.delivery_queue_id
    ) {
      return [];
    }
    const path = invitationPathFromStoredBodies({
      emailBody: emailBodyByQueueId.get(round.delivery_queue_id),
      expectedHash: round.public_token_hash,
      queuePayload: queuePayloadById.get(round.delivery_queue_id),
    });
    if (!path) {
      return [];
    }
    const snapshot = isRecord(round.invitation_snapshot)
      ? round.invitation_snapshot
      : {};
    return [
      {
        companyName: cleanText(snapshot.companyName, "채용 회사", 160),
        roleId: cleanText(schedule.role_id, "", 160),
        roleTitle: cleanText(
          snapshot.roleName,
          cleanText(schedule.title, "미팅 요청", 180),
          180
        ),
        scheduleId: cleanText(schedule.id, "", 160),
      },
    ];
  });
}

export async function resolveTalentPendingMeetingPath(args: {
  admin: TalentAdminClient;
  scheduleId: string;
  talentId: string;
}) {
  const { data: schedule, error: scheduleError } = await (
    args.admin.from("meeting_schedules" as any) as any
  )
    .select("id, active_round_id")
    .eq("id", args.scheduleId)
    .eq("talent_id", args.talentId)
    .eq("status", "awaiting_talent")
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule?.active_round_id) return null;

  const { data: round, error: roundError } = await (
    args.admin.from("meeting_schedule_rounds" as any) as any
  )
    .select(
      "id, schedule_id, status, submitted_at, invitation_expires_at, invitation_snapshot, delivery_queue_id, public_token_hash"
    )
    .eq("id", schedule.active_round_id)
    .eq("schedule_id", schedule.id)
    .maybeSingle();
  if (roundError) throw roundError;
  const normalizedRound = round as PendingMeetingRoundRow | null;
  if (
    !normalizedRound ||
    !isCurrentPendingRound(normalizedRound, new Date().toISOString())
  ) {
    return null;
  }

  const { data: queue, error: queueError } = await (
    args.admin.from("contact_queue" as any) as any
  )
    .select("payload")
    .eq("id", normalizedRound.delivery_queue_id)
    .eq("type", INVITATION_QUEUE_TYPE)
    .eq("user_id", args.talentId)
    .maybeSingle();
  if (queueError) throw queueError;
  let emailBody: unknown;
  if (!extractMeetingInvitationPathFromQueuePayload(queue?.payload)) {
    const { data: email, error: emailError } = await (
      args.admin.from("career_email_messages" as any) as any
    )
      .select("body_text")
      .eq("talent_id", args.talentId)
      .eq("direction", "outbound")
      .eq("mail_type", INVITATION_QUEUE_TYPE)
      .eq("status", "sent")
      .eq("metadata->>contactQueueId", normalizedRound.delivery_queue_id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (emailError) throw emailError;
    emailBody = email?.body_text;
  }
  return invitationPathFromStoredBodies({
    emailBody,
    expectedHash: normalizedRound.public_token_hash,
    queuePayload: queue?.payload,
  });
}
