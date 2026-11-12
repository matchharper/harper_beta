import { supabaseServer } from "./supabaseServer";
import { fetchAllStatsRows } from "./statsQuery";
import {
  ANALYTICS_TEST_FIXTURE_TALENT_LOG_TYPE,
  buildDailyStatsTalentScope,
  buildToolRows,
  getKstDayRange,
  resolveDailyUserStatsDate,
} from "./dailyUserStats";
import {
  inDebugDay,
  type DailyDebugReport,
  type DebugDelivery,
  type DebugPending,
  type DebugReply,
  type DebugRun,
  type DebugSection,
  type DebugProfileError,
  type DebugFeatureExecution,
} from "./dailyDebugReport";
import {
  buildDebugProfileStats,
  buildDebugProfileSubmissions,
  type DebugProfileRow,
  type DebugProfileRevision,
  type DebugResumeUpload,
} from "./dailyDebugProfiles";
import { OPS_EMAIL_TEST_KIND } from "./email/runtime/opsTest";
import type { Database } from "@/types/database.types";

const tableQuery = (table: string, columns: string) =>
  supabaseServer
    .from(table as keyof Database["public"]["Tables"])
    .select(columns);
type Query = ReturnType<typeof tableQuery>;
import {
  buildDebugRecommendationStats,
  DEBUG_APPLICATION_CLICK_TYPES,
  type DebugRecommendation,
  type DebugOpportunityProgress,
  type DebugApplicationClick,
  type DebugInternalAcceptance,
  type DebugApplicationAttempt,
} from "./dailyDebugRecommendations";
const runColumns =
  "id,talent_id,trigger,status,created_at,updated_at,started_at,completed_at,not_before,error_message,agentOutcome:coverage->>agentOutcome,runContract:trigger_payload->>runContract,createdBy:trigger_payload->>createdBy,acceptedAt:trigger_payload->agentInvocation->>acceptedAt";
const deliveryColumns =
  "id,talent_id,discovery_run_id,channel,status,created_at,updated_at,sent_at,error_message,providerEmailId:payload->>resendEmailId";
type RunProjection = Omit<DebugRun, "coverage" | "trigger_payload"> & {
  agentOutcome: string | null;
  runContract: string | null;
  createdBy: string | null;
  acceptedAt: string | null;
};
type DeliveryProjection = Omit<DebugDelivery, "payload"> & {
  providerEmailId: string | null;
};
const unique = <T extends { id: string }>(rows: T[]) => [
  ...new Map(rows.map((row) => [row.id, row])).values(),
];

export async function buildDailyDebugReport(
  dateInput?: string | null,
  now = new Date()
): Promise<DailyDebugReport> {
  const observedAt = now.toISOString();
  const dayRange = getKstDayRange(resolveDailyUserStatsDate(dateInput, now));
  const range = {
    ...dayRange,
    endIso: dayRange.endIso > observedAt ? observedAt : dayRange.endIso,
  };
  const { startIso, endIso } = range;
  const day = (column: string) =>
    `and(${column}.gte.${startIso},${column}.lt.${endIso})`;
  // The generated Database snapshot does not yet contain schedules/daily sources.
  // Only fixed server-owned table/column names below pass this type boundary.
  const read = async <T>(
    table: string,
    columns: string,
    filter: (query: Query) => Query,
    order = "id"
  ) => {
    const rows = await fetchAllStatsRows(
      (from, to) =>
        filter(tableQuery(table, columns))
          .order(order, { ascending: true })
          .range(from, to),
      `daily-debug:${table}`
    );
    return rows as unknown as T[];
  };
  const section = async <T>(
    load: () => Promise<T>
  ): Promise<DebugSection<T>> => {
    try {
      return { data: await load() };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const scope = await section(async () => {
    const [users, fixtures] = await Promise.all([
      read<{
        user_id: string;
        email: string | null;
        deleted_at?: string | null;
      }>("talent_users", "user_id,email,deleted_at", (q) => q, "user_id"),
      read<{ user_id: string | null }>("logs", "user_id", (q) =>
        q.eq("type", ANALYTICS_TEST_FIXTURE_TALENT_LOG_TYPE)
      ),
    ]);
    const includedUsers = buildDailyStatsTalentScope(
      users,
      fixtures
    ).includedTalentUsers;
    return {
      ids: new Set(includedUsers.map((u) => u.user_id)),
      activeIds: new Set(
        includedUsers.filter((u) => !u.deleted_at).map((u) => u.user_id)
      ),
    };
  });
  const failed = {
    data: null,
    error: `대상 사용자 집계 실패: ${scope.error}`,
  } as const;
  if (!scope.data)
    return {
      ...range,
      observedAt,
      runs: failed,
      deliveries: failed,
      tools: failed,
      recommendations: failed,
      replies: failed,
      schedules: failed,
      sources: failed,
      profiles: failed,
      profileErrors: failed,
      searches: failed,
      browsers: failed,
    };
  const included = (id: string | null) => Boolean(id && scope.data.ids.has(id));
  const active = (id: string | null) =>
    Boolean(id && scope.data.activeIds.has(id));
  const owned = <T extends { talent_id: string | null }>(rows: T[]) =>
    rows.filter((r) => included(r.talent_id));

  const runsPromise = section(async () =>
    owned(
      await read<RunProjection>("opportunity_discovery_run", runColumns, (q) =>
        q.or(
          [
            day("started_at"),
            day("created_at"),
            day("completed_at"),
            `and(status.in.(failed,partial),${day("updated_at")})`,
            "status.in.(queued,running,handed_off)",
          ].join(",")
        )
      )
    )
      .map(
        ({
          agentOutcome,
          runContract,
          createdBy,
          acceptedAt,
          ...row
        }): DebugRun => ({
          ...row,
          coverage: { agentOutcome: agentOutcome ?? undefined },
          trigger_payload: {
            runContract: runContract ?? undefined,
            createdBy: createdBy ?? undefined,
            agentInvocation: { acceptedAt: acceptedAt ?? undefined },
          },
        })
      )
      .filter(
        (r) =>
          r.trigger_payload?.createdBy !== "career_dev_controls" &&
          (!["queued", "running", "handed_off"].includes(r.status) ||
            active(r.talent_id))
      )
  );

  const deliveriesPromise = section(async () => {
    const [runs, windowRows] = await Promise.all([
      runsPromise,
      read<DeliveryProjection>(
        "talent_opportunity_delivery",
        deliveryColumns,
        (q) =>
          q.or(
            [
              day("sent_at"),
              day("updated_at"),
              "status.in.(pending,queued,retry,sending,delivery_unknown)",
            ].join(",")
          )
      ),
    ]);
    // Join by run ID as well as time: a day's starts can finish after midnight,
    // and an existing sent receipt can survive a later run failure/retry.
    const ids = runs.data?.map((r) => r.id) ?? [];
    const batches: string[][] = [];
    // Same URL-sized batching as existing stats history queries.
    for (let offset = 0; offset < ids.length; offset += 100) {
      batches.push(ids.slice(offset, offset + 100));
    }
    // fetchAllStatsRows shares the existing six-query concurrency bound.
    const linked = (
      await Promise.all(
        batches.map((batch) =>
          read<DeliveryProjection>(
            "talent_opportunity_delivery",
            deliveryColumns,
            (q) => q.in("discovery_run_id", batch)
          )
        )
      )
    ).flat();
    return owned(unique([...windowRows, ...linked]))
      .map(
        ({ providerEmailId, ...row }): DebugDelivery => ({
          ...row,
          payload: { resendEmailId: providerEmailId ?? undefined },
        })
      )
      .filter(
        (r) =>
          ![
            "pending",
            "queued",
            "retry",
            "sending",
            "delivery_unknown",
          ].includes(r.status) || active(r.talent_id)
      );
  });

  const [
    runs,
    deliveries,
    tools,
    recommendations,
    replies,
    schedules,
    sources,
    profiles,
    profileErrors,
    searches,
    browsers,
  ] = await Promise.all([
    runsPromise,
    deliveriesPromise,
    section(async () => {
      const logs = await read<{
        user_id: string | null;
        type: string;
        created_at: string;
      }>("logs", "user_id,type,created_at", (q) =>
        q
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .or(
            "type.like.career_tool_call:*,type.like.career_tool_call_failed:*"
          )
      );
      const rows = logs.filter((l) => included(l.user_id));
      return buildToolRows(
        rows.filter((l) => l.type.startsWith("career_tool_call:")),
        rows.filter((l) => l.type.startsWith("career_tool_call_failed:"))
      );
    }),
    section(async () => {
      const recommendationColumns =
        "id,talent_id,role_id,opportunity_type,created_at,viewed_at,clicked_at,feedback,feedback_at";
      type ApplicationProjection = {
        user_id: string;
        id: string;
        browserId: string | null;
        browserStatus: string | null;
        startedAt: string | null;
        updatedAt: string | null;
        authorizedReviewFingerprint: string | null;
        approved: boolean | null;
        executed: boolean | null;
        evidenceMessageId: number | null;
        evidence: string | null;
        previousAttempts: DebugApplicationAttempt[] | null;
      };
      const [
        windowRows,
        progressRows,
        clickRows,
        acceptanceRows,
        applicationRows,
      ] = await Promise.all([
        read<DebugRecommendation>(
          "talent_opportunity_recommendation",
          `${recommendationColumns},evidence`,
          (q) =>
            q.or(
              [
                day("created_at"),
                day("viewed_at"),
                day("clicked_at"),
                day("feedback_at"),
              ].join(",")
            )
        ),
        read<DebugOpportunityProgress>(
          "talent_progress",
          "id,talent_id,role_id,recommendation_id,kind,created_at,feedback:metadata->>feedback,savedStage:metadata->>savedStage",
          (q) =>
            q
              .in("kind", [
                "saved_stage_changed",
                "candidate_opportunity_feedback_changed",
              ])
              .gte("created_at", startIso)
              .lt("created_at", endIso)
        ),
        read<DebugApplicationClick>("logs", "id,user_id,type,created_at", (q) =>
          q
            .in("type", [...DEBUG_APPLICATION_CLICK_TYPES])
            .gte("created_at", startIso)
            .lt("created_at", endIso)
        ),
        read<DebugInternalAcceptance>(
          "agent_contact_messages",
          "id,root_id,talent_id,role_id,created_at,direction,material_id,legacyCorrespondence:source->>legacyCorrespondence",
          (q) =>
            q
              .eq("direction", "to_company")
              .gte("created_at", startIso)
              .lt("created_at", endIso)
        ),
        read<ApplicationProjection>(
          "talent_simulate_application",
          "id,user_id,browserId:payload->browser->>id,browserStatus:payload->browser->>status,startedAt:payload->browser->>startedAt,updatedAt:payload->browser->>updatedAt,authorizedReviewFingerprint:payload->browser->managed->>authorizedReviewFingerprint,approved:payload->browser->approval->approved,executed:payload->browser->approval->executed,evidenceMessageId:payload->browser->approval->evidenceMessageId,evidence:payload->browser->result->>evidence,previousAttempts:payload->browser->previousAttempts",
          (q) =>
            q.gte("updated_at", startIso).not("payload->browser", "is", null)
        ),
      ]);
      const progress = owned(progressRows);
      const recommendations = owned(windowRows);
      const known = new Set(recommendations.map((r) => r.id));
      const missing = [
        ...new Set(
          progress
            .map((r) => r.recommendation_id)
            .filter((id): id is string => Boolean(id && !known.has(id)))
        ),
      ];
      for (let offset = 0; offset < missing.length; offset += 100) {
        recommendations.push(
          ...owned(
            await read<DebugRecommendation>(
              "talent_opportunity_recommendation",
              recommendationColumns,
              (q) => q.in("id", missing.slice(offset, offset + 100))
            )
          )
        );
      }
      const applications = applicationRows
        .filter((r) => included(r.user_id))
        .map((r) => ({
          user_id: r.user_id,
          attempts: [
            ...(r.previousAttempts ?? []),
            ...(r.browserId
              ? [
                  {
                    id: r.browserId,
                    status: r.browserStatus ?? "",
                    startedAt: r.startedAt ?? "",
                    updatedAt: r.updatedAt ?? "",
                    managed: {
                      authorizedReviewFingerprint:
                        r.authorizedReviewFingerprint ?? undefined,
                    },
                    approval: {
                      approved: r.approved === true,
                      executed: r.executed === true,
                      evidenceMessageId: r.evidenceMessageId ?? undefined,
                    },
                    result: { evidence: r.evidence ?? undefined },
                  },
                ]
              : []),
          ],
        }));
      const evidenceIds = [
        ...new Set(
          applications.flatMap((a) =>
            a.attempts
              .map((b) => b.approval?.evidenceMessageId)
              .filter((id): id is number => Boolean(id))
          )
        ),
      ];
      const evidenceMessages: {
        id: number;
        user_id: string;
        created_at: string;
      }[] = [];
      for (let offset = 0; offset < evidenceIds.length; offset += 100) {
        evidenceMessages.push(
          ...(await read<{ id: number; user_id: string; created_at: string }>(
            "talent_messages",
            "id,user_id,created_at",
            (q) => q.in("id", evidenceIds.slice(offset, offset + 100))
          ))
        );
      }
      return buildDebugRecommendationStats({
        startIso,
        endIso,
        recommendations: unique(recommendations),
        progress,
        clicks: clickRows
          .filter((r) => included(r.user_id))
          .map((r) => ({ ...r, id: String(r.id) })),
        internalAcceptances: owned(acceptanceRows),
        applications,
        evidenceMessages,
      });
    }),
    section(async () =>
      owned(
        await read<DebugReply>(
          "email_reply_jobs",
          "id,talent_id,status,kind,created_at,updated_at,processed_at,last_error",
          (q) =>
            q.or(
              [
                day("created_at"),
                day("processed_at"),
                day("updated_at"),
                "status.in.(queued,running,processing,retry,waiting_career)",
              ].join(",")
            )
        )
      ).filter(
        (r) =>
          r.kind !== OPS_EMAIL_TEST_KIND &&
          (![
            "queued",
            "running",
            "processing",
            "retry",
            "waiting_career",
          ].includes(r.status) ||
            active(r.talent_id))
      )
    ),
    section(async () => {
      const [rows, settings] = await Promise.all([
        read<
          DebugPending & { next_run_at: string; schedule_key: string | null }
        >(
          "talent_agent_schedules",
          "id,talent_id,next_run_at,schedule_key",
          (q) => q.eq("status", "active").lte("next_run_at", observedAt)
        ),
        read<{
          user_id: string;
          status: string | null;
          get_external_recommendation: boolean | null;
        }>(
          "talent_setting",
          "user_id,status,get_external_recommendation",
          (q) => q,
          "user_id"
        ),
      ]);
      const byUser = new Map(settings.map((s) => [s.user_id, s]));
      return owned(rows)
        .filter((r) => active(r.talent_id))
        .filter((r) => {
          if (r.schedule_key !== "career_check_in") return true;
          const setting = byUser.get(r.talent_id);
          return (
            setting &&
            setting.status !== "stopped" &&
            setting.get_external_recommendation !== false
          );
        })
        .map((r) => ({
          id: r.id,
          talent_id: r.talent_id,
          due_at: r.next_run_at,
        }));
    }),
    section(async () =>
      owned(
        await read<DebugPending & { available_at: string }>(
          "career_daily_sources",
          "id,talent_id,available_at",
          (q) =>
            q
              .is("finished_at", null)
              .is("cancelled_at", null)
              .lte("available_at", observedAt)
        )
      )
        .filter((r) => active(r.talent_id))
        .map((r) => ({
          id: r.id,
          talent_id: r.talent_id,
          due_at: r.available_at,
        }))
    ),
    section(async () => {
      const revisionColumns =
        "profile_id,revision,created_at,resume_links:snapshot->talentUser->resume_links,source_kind:source->>kind,profile:talent_profiles!inner(talent_id,is_default)";
      const [uploadRows, revisionRows] = await Promise.all([
        read<DebugResumeUpload>(
          "talent_documents",
          "user_id:talent_id,created_at,storage_path,origin_type",
          (q) =>
            q
              .eq("kind", "resume")
              .gte("created_at", startIso)
              .lt("created_at", endIso)
        ),
        read<DebugProfileRevision>(
          "talent_profile_revisions",
          revisionColumns,
          (q) =>
            q
              .eq("profile.is_default", true)
              .gte("created_at", startIso)
              .lt("created_at", endIso)
              .order("revision", { ascending: true }),
          "profile_id"
        ),
      ]);
      const uploads = uploadRows.filter((r) => active(r.user_id));
      const revisions = revisionRows.filter((r) => active(r.profile.talent_id));
      const present = new Set(
        revisions.map((r) => `${r.profile_id}:${r.revision}`)
      );
      const missingPrevious = revisions.filter(
        (r) =>
          r.revision > 1 &&
          r.source_kind !== "existing_profile" &&
          !present.has(`${r.profile_id}:${r.revision - 1}`)
      );
      const previousRevisions: DebugProfileRevision[] = [];
      // Read only the predecessor of each profile's first revision in the day,
      // not the entire history or full profile snapshots.
      for (let offset = 0; offset < missingPrevious.length; offset += 100) {
        previousRevisions.push(
          ...(await read<DebugProfileRevision>(
            "talent_profile_revisions",
            revisionColumns,
            (q) =>
              q
                .or(
                  missingPrevious
                    .slice(offset, offset + 100)
                    .map(
                      (r) =>
                        `and(profile_id.eq.${r.profile_id},revision.eq.${r.revision - 1})`
                    )
                    .join(",")
                )
                .order("revision", { ascending: true }),
            "profile_id"
          ))
        );
      }
      const submissions = buildDebugProfileSubmissions({
        uploads,
        revisions,
        previousRevisions,
        startIso,
        endIso,
      });
      const profiles: DebugProfileRow[] = [];
      for (let offset = 0; offset < submissions.length; offset += 100) {
        profiles.push(
          ...(await read<DebugProfileRow>(
            "talent_users",
            "user_id,talent_experiences(count),talent_educations(count),talent_extras(content)",
            (q) =>
              q.in(
                "user_id",
                submissions.slice(offset, offset + 100).map((r) => r.user_id)
              ),
            "user_id"
          ))
        );
      }
      return buildDebugProfileStats(profiles, submissions);
    }),
    section(async () =>
      (
        await read<DebugProfileError>(
          "logs",
          "id,user_id,type,error:meta_data->>error",
          (q) =>
            q
              .like("type", "career_profile_source_save_failed:%")
              .gte("created_at", startIso)
              .lt("created_at", endIso)
        )
      )
        .filter((r) => included(r.user_id))
        .map((r) => ({ ...r, id: String(r.id) }))
    ),
    section(async () =>
      owned(
        await read<DebugFeatureExecution>(
          "external_recommendation_runs",
          "id,talent_id,status,created_at,finished_at,error",
          (q) =>
            q
              .eq("variant", "career_agent")
              .gte("finished_at", startIso)
              .lt("finished_at", endIso)
        )
      )
    ),
    section(async () =>
      (
        await read<DebugFeatureExecution & { environment: string | null }>(
          "talent_external_operations",
          "id,talent_id:user_id,status,created_at,finished_at:updated_at,error:result->>error,environment:request->>execution_environment",
          (q) =>
            q
              .eq("kind", "browser_run")
              .or(
                [
                  day("updated_at"),
                  "status.in.(reserved,preparing,dispatching,running,cancelling,capacity_wait)",
                ].join(",")
              )
        )
      ).filter(
        (r) =>
          included(r.talent_id) &&
          (!r.environment || r.environment === "production") &&
          (["completed", "succeeded", "failed", "cancelled"].includes(
            r.status
          ) ||
            active(r.talent_id))
      )
    ),
  ]);
  return {
    ...range,
    observedAt,
    runs,
    deliveries,
    tools,
    recommendations,
    replies,
    schedules,
    sources,
    profiles,
    profileErrors,
    searches,
    browsers,
  };
}
